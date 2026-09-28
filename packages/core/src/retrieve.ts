import { basename, extname } from "node:path";
import { createFilesystem, type Snapshot, type DirectoryEntry } from "./filesystem";
import { type EvaluationRequest, EvaluationFailure } from "./evaluator";
import { inspect, pythonPreview, sourceForUnit, splitSource } from "./source";
import {
  navigationRequest,
  fileAssessmentRequest,
  type DirectoryPreview,
  type FilePreview,
  type NavigationItem,
  type Evidence,
} from "./requests";
import { selectFile, type SelectionResult } from "./selection";
import { localCallContext } from "./call-context";
import { selectTestBodies } from "./test-body-selection";
import { repositoryContext } from "./repository-context";
import type { Evaluator, FileEvidence, RetrievalResult, SearchInput } from "./types";

// Bound per-stage source work; the evaluator separately caps shared provider attempts.
const stageWorkers = 32;
/** Traversal owns admission; every stage reads through the same eligibility policy. */
export async function retrieve(input: SearchInput, evaluator: Evaluator): Promise<RetrievalResult> {
  const reader = await createFilesystem({
    root: input.root,
    policy: input.policy,
    signal: input.signal,
    protectedPaths: input.protectedPaths,
  });
  const issues = new Map<string, number>();
  let providerFailure: string | undefined;
  const inspected = new Set<string>();
  const candidates = new Map<string, { path: string; contentHash: string; score: number }>();
  const files = new Map<string, FileEvidence>();
  const declarations = new Map<string, SelectionResult["declarations"]>();
  const visited = new Set<string>();
  const pruned = new Map<string, NavigationItem>();
  const previews = new Map<string, FilePreview>();
  type Donor = { path: string; contentHash: string };
  const donors = new WeakMap<NavigationItem, Donor[]>();
  const anchors = new WeakMap<{ path: string; classes: string[] }, Donor>();
  function buffered(item: NavigationItem, sources: Donor[]) {
    donors.set(
      item,
      sources.map(({ path, contentHash }) => ({ path, contentHash })),
    );
    return item;
  }
  let validationQueue: Promise<void> = Promise.resolve();
  async function freshEvaluation(request: EvaluationRequest, sources: Donor[], navigation = false) {
    const validate = async () => {
      for (const source of new Map(sources.map((source) => [source.path, source])).values()) {
        if (!(await unchanged(source))) throw new EvaluationFailure("source-invalid");
      }
    };
    const beforeAttempt = () => {
      const pending = validationQueue.then(validate);
      validationQueue = pending.catch(() => {});
      return pending;
    };
    return evaluator.evaluate(request, { navigation, beforeAttempt });
  }
  let entriesSeen = 0;
  let stop = false;
  function issue(kind: string, count = 1, message?: string) {
    if (kind === "provider") providerFailure ??= message;
    issues.set(kind, (issues.get(kind) ?? 0) + count);
    if (["authentication", "request-limit", "cancelled", "interrupted"].includes(kind)) stop = true;
  }
  async function snapshot(path: string) {
    const result = await reader.readSnapshot(path);
    if (result.status === "issue") {
      issue(result.issue.kind);
      return;
    }
    if (result.status === "excluded") return;
    inspected.add(path);
    return result.snapshot;
  }
  async function score(
    items: Iterable<NavigationItem> | AsyncIterable<NavigationItem>,
    anchor: { path: string; classes: string[] } | undefined,
    consume: (item: NavigationItem, probability: number) => void,
  ) {
    const active = new Set<Promise<void>>();
    const queued: NavigationItem[][] = [];
    let failure: { error: unknown } | undefined;
    async function scoreGroup(group: NavigationItem[]): Promise<void> {
      if (stop || input.signal.aborted) return;
      let scores: Record<string, number>;
      try {
        const sources = group.flatMap((item) => donors.get(item) ?? []);
        if (anchor) sources.push(anchors.get(anchor)!);
        scores = await freshEvaluation(
          navigationRequest(input.query, group, anchor),
          sources,
          true,
        );
      } catch (error) {
        if (
          error instanceof EvaluationFailure &&
          (error.kind === "source-invalid" || (error.kind === "provider" && error.splitEligible)) &&
          group.length > 1
        ) {
          const middle = Math.ceil(group.length / 2);
          queued.push(group.slice(0, middle), group.slice(middle));
        } else if (!(error instanceof EvaluationFailure && error.kind === "source-invalid"))
          issue(
            error instanceof EvaluationFailure ? error.kind : "provider",
            1,
            error instanceof EvaluationFailure ? error.message : undefined,
          );
        return;
      }
      group.forEach((item, index) => consume(item, scores[`q${index}`]!));
    }
    function pump() {
      while (
        !failure &&
        active.size < stageWorkers &&
        queued.length &&
        !stop &&
        !input.signal.aborted
      ) {
        const group = queued.shift()!;
        const pending = scoreGroup(group)
          .catch((error: unknown) => {
            // Observe failures immediately, stop admission, and drain other workers
            // before propagating the original internal error to the caller.
            failure ??= { error };
          })
          .finally(() => {
            active.delete(pending);
            pump();
          });
        active.add(pending);
      }
    }
    async function submit(group: NavigationItem[]) {
      // Drain split work before admitting more source. Splits only partition
      // existing items, so recovery cannot amplify retained source bytes.
      while (!failure && (active.size >= stageWorkers || (queued.length && active.size)))
        await Promise.race(active);
      if (failure || stop || input.signal.aborted) return;
      queued.push(group);
      pump();
    }
    let batch: NavigationItem[] = [];
    try {
      for await (const item of items) {
        if (failure || stop || input.signal.aborted) break;
        if (
          Buffer.byteLength(JSON.stringify(navigationRequest(input.query, [item], anchor))) > 38_000
        ) {
          issue("request-size");
          continue;
        }
        if (
          batch.length &&
          (batch.length >= 128 ||
            Buffer.byteLength(
              JSON.stringify(navigationRequest(input.query, [...batch, item], anchor)),
            ) > 38_000)
        ) {
          await submit(batch);
          batch = [];
        }
        batch.push(item);
      }
      if (batch.length) await submit(batch);
    } catch (error) {
      failure ??= { error };
    } finally {
      while (active.size) await Promise.all(active);
    }
    if (failure) throw failure.error;
  }
  async function previewDirectory(path: string): Promise<DirectoryPreview | undefined> {
    const preview: DirectoryPreview = {
      entries: [],
      truncated: false,
      sampledFiles: 0,
      sampledDirectories: 0,
      sampledExtensions: {},
    };
    let cursor: string | undefined;
    let bytes = 0;
    try {
      do {
        const page = await reader.listPage(path, cursor);
        cursor = page.nextCursor;
        for (const entry of page.issues) issue(entry.kind);
        if (page.issues.length) return;
        for (const entry of page.entries) {
          const child = { name: basename(entry.path), kind: entry.kind };
          const size = Buffer.byteLength(JSON.stringify(child));
          if (preview.entries.length >= 64 || bytes + size > 4096) {
            preview.truncated = true;
            break;
          }
          preview.entries.push(child);
          bytes += size;
          if (entry.kind === "directory") preview.sampledDirectories++;
          else {
            preview.sampledFiles++;
            const extension = extname(entry.path) || "[no extension]";
            preview.sampledExtensions[extension] = (preview.sampledExtensions[extension] ?? 0) + 1;
          }
        }
        if (preview.truncated) break;
      } while (cursor && !stop);
      if (cursor) preview.truncated = true;
    } finally {
      if (cursor) await reader.closeCursor(cursor);
    }
    preview.entries.sort((a, b) => a.name.localeCompare(b.name));
    return preview;
  }
  async function withDirectoryContent(item: NavigationItem): Promise<NavigationItem> {
    const preview = {
      ...item.childPreview!,
      contentSamples: [] as NonNullable<DirectoryPreview["contentSamples"]>,
    };
    const sources: Donor[] = [];
    const children = preview.entries.filter((child) => child.kind === "file");
    const perFile = Math.max(80, Math.floor(16000 / Math.max(1, children.length)));
    for (const child of children) {
      if (stop) break;
      const snapshotValue = await snapshot(`${item.path}/${child.name}`);
      if (!snapshotValue || Buffer.byteLength(snapshotValue.source) > 1_000_000) continue;
      sources.push({ path: snapshotValue.path, contentHash: snapshotValue.contentHash });
      const source = snapshotValue.source;
      const part = Math.floor(perFile / 3);
      const offsets = [
        0,
        Math.max(0, Math.floor(source.length / 2) - Math.floor(part / 2)),
        Math.max(0, source.length - part),
      ];
      preview.contentSamples.push({
        name: child.name,
        truncated: source.length > perFile,
        source:
          source.length <= perFile
            ? source
            : offsets
                .map((start) => `[character offset ${start}]\n${source.slice(start, start + part)}`)
                .join("\n...\n"),
      });
    }
    while (
      Buffer.byteLength(JSON.stringify(preview)) > 28000 &&
      preview.contentSamples.some((sample) => sample.source.length > 80)
    ) {
      for (const sample of preview.contentSamples) {
        sample.source = sample.source.slice(
          0,
          Math.max(80, Math.floor(sample.source.length * 0.8)),
        );
        sample.truncated = true;
      }
    }
    return buffered({ ...item, childPreview: preview }, sources);
  }
  async function previewFile(source: Snapshot): Promise<FilePreview> {
    const bytes = Buffer.from(source.source);
    let text = new TextDecoder("utf8", { fatal: true }).decode(bytes.subarray(0, 16384), {
      stream: bytes.length > 16384,
    });
    let truncated = bytes.length > 16384;
    while (Buffer.byteLength(JSON.stringify(text)) > 24000) {
      let end = Math.floor(text.length * 0.75);
      const last = text.charCodeAt(end - 1);
      if (last >= 0xd800 && last <= 0xdbff) end--;
      text = text.slice(0, end);
      truncated = true;
    }
    const preview: FilePreview = {
      sizeBytes: bytes.length,
      extension: extname(source.path),
      text,
      previewBytes: Buffer.byteLength(text),
      truncated,
      range: "opening bytes",
      declarations: [],
      declarationIndexTruncated: false,
    };
    if (truncated && /\.pyi?$/.test(source.path) && bytes.length <= 1_000_000) {
      const sampled = await pythonPreview(source, input.query, 16384, input.signal);
      if (
        sampled?.truncated &&
        sampled.text &&
        Buffer.byteLength(sampled.text) <= 16384 &&
        Buffer.byteLength(JSON.stringify(sampled.text)) <= 24000
      ) {
        preview.text = sampled.text;
        preview.previewBytes = sampled.previewBytes;
        preview.range = "sampled source ranges";
      }
    }
    if (
      truncated &&
      /\.(?:pyi?|[cm]?[jt]s|[jt]sx)$/.test(source.path) &&
      bytes.length <= 1_000_000
    ) {
      const syntax = await inspect(source, {
        signal: input.signal,
        maxUnitBytes: Math.max(4, bytes.length),
      });
      preview.declarations = syntax.units
        .filter((unit) => !unit.partial)
        .map((unit) => ({ name: unit.name, ...unit.range }));
      while (preview.declarations.length && Buffer.byteLength(JSON.stringify(preview)) > 32000) {
        preview.declarations.pop();
        preview.declarationIndexTruncated = true;
      }
    }
    return preview;
  }
  async function discover(seeds: string[], anchor?: { path: string; classes: string[] }) {
    const directories = [...seeds];
    while (directories.length && !stop && entriesSeen < 100_000) {
      const level = directories.splice(0).map((path) => ({ path, depth: 0 }));
      const assessments = new WeakMap<NavigationItem, FilePreview>();
      async function* items(): AsyncGenerator<NavigationItem> {
        for (let index = 0; index < level.length && !stop; index++) {
          const current = level[index]!;
          if (entriesSeen >= 100_000) {
            issue("resource_limit");
            break;
          }
          if (visited.has(current.path)) continue;
          visited.add(current.path);
          const entries: DirectoryEntry[] = [];
          let cursor: string | undefined;
          try {
            do {
              const page = await reader.listPage(current.path, cursor);
              cursor = page.nextCursor;
              for (const entry of page.issues) issue(entry.kind);
              entries.push(...page.entries);
              if (
                entriesSeen + entries.length > 100_000 ||
                (cursor && entriesSeen + entries.length === 100_000)
              ) {
                issue("resource_limit");
                break;
              }
            } while (cursor && !stop);
          } finally {
            if (cursor) await reader.closeCursor(cursor);
          }
          for (const entry of entries.sort((a, b) => a.path.localeCompare(b.path))) {
            if (stop) break;
            if (entriesSeen++ >= 100_000) {
              issue("resource_limit");
              break;
            }
            if (entry.kind === "directory") {
              if (current.depth === 0) level.push({ path: entry.path, depth: 1 });
              else {
                const childPreview = await previewDirectory(entry.path);
                if (!childPreview) continue;
                const item: NavigationItem = { path: entry.path, kind: "directory", childPreview };
                yield anchor ? await withDirectoryContent(item) : item;
              }
            } else {
              const source = await snapshot(entry.path);
              if (!source) continue;
              const filePreview = await previewFile(source);
              if (Buffer.byteLength(source.source) > 1_000_000) {
                issue("resource_limit");
                const item = buffered({ path: entry.path, kind: "file", filePreview }, [source]);
                assessments.set(item, filePreview);
                yield item;
                continue;
              }
              const chunks = splitSource(source, 12_000);
              for (const chunk of chunks) {
                const text = sourceForUnit(source, chunk);
                const item = buffered(
                  {
                    path: entry.path,
                    kind: "file",
                    filePreview: {
                      sizeBytes: Buffer.byteLength(source.source),
                      extension: extname(entry.path),
                      text,
                      previewBytes: Buffer.byteLength(text),
                      truncated: chunks.length > 1,
                      range: "sampled source ranges",
                    },
                  },
                  [source],
                );
                assessments.set(item, filePreview);
                yield item;
              }
            }
          }
        }
      }
      await score(items(), anchor, (item, probability) => {
        if (item.kind === "directory") {
          if (probability > 0.5) directories.push(item.path);
          else if (!anchor) pruned.set(item.path, item);
        } else if (probability > 0.5) {
          const prior = candidates.get(item.path);
          if (!prior || probability > prior.score) {
            previews.set(item.path, assessments.get(item)!);
            candidates.set(item.path, {
              path: item.path,
              contentHash: donors.get(item)![0]!.contentHash,
              score: probability,
            });
          }
        }
      });
    }
    if (directories.length) issue("resource_limit");
  }
  function sortedCandidates() {
    return [...candidates.values()].sort(
      (a, b) => b.score - a.score || a.path.localeCompare(b.path),
    );
  }
  async function unchanged(candidate: { path: string; contentHash: string }) {
    const result = await reader.readSnapshot(candidate.path);
    if (result.status === "ok" && result.snapshot.contentHash === candidate.contentHash) {
      inspected.add(candidate.path);
      return result.snapshot;
    }
    issue(result.status === "issue" ? result.issue.kind : "changed");
    if (result.status === "issue" && result.issue.kind === "interrupted") return;
    const prior = files.get(candidate.path);
    if (prior)
      files.set(candidate.path, {
        ...prior,
        roles: [],
        priority: undefined,
        presentationExcerpts: [],
        selectedPresentationExcerpts: [],
        callLeads: [],
        presentationSelected: [],
        sourceDecisions: [],
        leads: [],
        selected: [],
        rendered: [],
        excerpts: [],
        sourceOmitted: true,
      });
  }

  async function parallel<T>(items: T[], work: (item: T) => Promise<void>) {
    let next = 0;
    const results = await Promise.allSettled(
      Array.from({ length: Math.min(stageWorkers, items.length) }, async () => {
        try {
          while (next < items.length && !stop && !input.signal.aborted) await work(items[next++]!);
        } catch (error) {
          stop = true;
          throw error;
        }
      }),
    );
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
  try {
    try {
      await discover(["."]);
      let anchor: { path: string; classes: string[] } | undefined;
      for (const candidate of sortedCandidates()) {
        if (candidate.score <= 0.5 || stop) break;
        const source = await unchanged(candidate);
        if (!source) continue;
        const size = Buffer.byteLength(source.source);
        const units = (
          await inspect(source, {
            signal: input.signal,
            maxParseBytes: Math.max(1, size),
            maxUnitBytes: Math.max(4, size),
          })
        ).units;
        const classes = [
          ...new Set(
            units
              .filter((unit) => unit.name.endsWith(".context"))
              .map((unit) => unit.name.split(".")[0]!),
          ),
        ];
        if (classes.length && Buffer.byteLength(JSON.stringify(classes)) < 4000) {
          anchor = { path: candidate.path, classes };
          anchors.set(anchor, candidate);
          break;
        }
      }
      if (anchor && !stop) {
        // Only one relationship reconsideration, anchored before new candidates are admitted.
        async function* relationships() {
          for (const item of pruned.values()) {
            if (stop) break;
            yield await withDirectoryContent(item);
          }
        }
        const seeds: string[] = [];
        await score(relationships(), anchor, (item, probability) => {
          if (probability > 0.5) seeds.push(item.path);
        });
        await discover(seeds, anchor);
      }
      const ordered = [...candidates.values()];
      // All admitted paths survive even if subsequent source inspection is unavailable.
      for (const candidate of ordered)
        files.set(candidate.path, {
          ...candidate,
          roles: [],
          leads: [],
          selected: [],
          rendered: [],
          excerpts: [],
          sourceOmitted: false,
        });
      const select = async (evidence?: () => Promise<Evidence[] | undefined>) =>
        parallel(ordered, async (candidate) => {
          const source = await unchanged(candidate);
          if (!source) return;
          if (Buffer.byteLength(source.source) > 1_000_000) {
            issue("source_inspection_limit");
            return;
          }
          const selection = await selectFile(
            source,
            input.query,
            candidate.score,
            {
              get requests() {
                return evaluator.requests;
              },
              evaluate: (request) => {
                const context = request.state as { selectedEvidence?: Evidence[] };
                return freshEvaluation(request, [
                  candidate,
                  ...(context.selectedEvidence ?? []).map((entry) => candidates.get(entry.path)!),
                ]);
              },
            },
            async () => {
              if (input.signal.aborted) throw new EvaluationFailure("cancelled");
              const current = await unchanged(candidate);
              if (input.signal.aborted) throw new EvaluationFailure("cancelled");
              if (!current) return null;
              return { evidence: await evidence?.() };
            },
            files.get(candidate.path),
            input.signal,
          );
          files.set(candidate.path, selection.file);
          declarations.set(candidate.path, selection.declarations);
          for (const entry of selection.issues)
            if (entry.kind !== "source-invalid")
              issue(entry.kind, entry.count, selection.providerFailure);
        });
      const selectEvidence = async () => {
        await select();
        const evidence: Evidence[] = [];
        // Donors follow selection completion order; concurrent completion can affect request context.
        for (const path of declarations.keys()) {
          const candidate = candidates.get(path)!;
          if (stop || input.signal.aborted) break;
          if (!files.get(candidate.path)!.excerpts.length) continue;
          // Context donors obey the same current eligibility/hash check as target files.
          if (!(await unchanged(candidate))) continue;
          evidence.push(
            ...files.get(candidate.path)!.excerpts.map((excerpt) => ({
              path: candidate.path,
              ...excerpt.range,
              source: excerpt.source,
            })),
          );
        }

        if (evidence.length && Buffer.byteLength(JSON.stringify(evidence)) <= 64_000 && !stop)
          await select(async () => {
            const current = new Set<string>();
            for (const path of new Set(evidence.map((entry) => entry.path))) {
              const candidate = candidates.get(path)!;
              if (await unchanged(candidate)) current.add(path);
            }
            const fresh = evidence.filter((entry) => current.has(entry.path));
            return fresh.length ? fresh : undefined;
          });
      };
      // File assessment reads only the discovery preview, so it runs alongside evidence selection.
      const assessments = new Map<string, { labels: string[]; priority: number }>();
      const assessFiles = () =>
        parallel(ordered, async (candidate) => {
          const source = await unchanged(candidate);
          if (!source) return;
          const preview = previews.get(candidate.path)!;
          try {
            const scores = await freshEvaluation(
              fileAssessmentRequest(input.query, candidate.path, preview),
              [candidate],
            );
            assessments.set(candidate.path, {
              labels: Object.keys(scores).filter(
                (role) => role !== "priority" && scores[role]! > 0.5,
              ),
              priority: scores.priority!,
            });
          } catch (error) {
            if (!(error instanceof EvaluationFailure && error.kind === "source-invalid"))
              issue(
                error instanceof EvaluationFailure ? error.kind : "provider",
                1,
                error instanceof EvaluationFailure ? error.message : undefined,
              );
          }
        });
      await Promise.all([selectEvidence(), assessFiles()]);
      await parallel(ordered, async (candidate) => {
        const file = files.get(candidate.path);
        if (!file || file.sourceOmitted) return;
        const snapshot = await unchanged(candidate);
        if (!snapshot) return;
        if (assessments.get(candidate.path)?.labels.includes("test")) {
          file.presentationExcerpts =
            file.selectedPresentationExcerpts ?? file.presentationExcerpts;
          file.presentationSelected = file.selected;
        }
        try {
          const context = await localCallContext(snapshot, file, input.signal);
          if (context && (await unchanged(candidate)) && files.get(candidate.path) === file)
            Object.assign(file, context);
        } catch (error) {
          if (input.signal.aborted) throw error;
          // Optional structural context cannot discard already selected evidence.
          issue("local-call-context");
        }
      });
      // Selection replaces file records, so assessments attach afterward; invalidated files keep none.
      for (const [path, assessment] of assessments) {
        const file = files.get(path)!;
        if (!file.sourceOmitted) {
          file.roles = assessment.labels;
          file.priority = assessment.priority;
        }
      }
      const testInputs = [];
      for (const candidate of ordered) {
        const file = files.get(candidate.path)!;
        if (file.sourceOmitted || !file.roles.includes("test")) continue;
        const snapshot = await unchanged(candidate);
        if (snapshot) testInputs.push({ snapshot, file });
      }
      try {
        const changes = await selectTestBodies(
          input.query,
          testInputs,
          {
            get requests() {
              return evaluator.requests;
            },
            evaluate: (request) => {
              const state = request.state as { candidates: Record<string, { path: string }> };
              return freshEvaluation(
                request,
                [...new Set(Object.values(state.candidates).map((c) => c.path))].map(
                  (path) => candidates.get(path)!,
                ),
              );
            },
          },
          input.signal,
        );
        let current = true;
        for (const item of testInputs) {
          if (
            !(await unchanged(candidates.get(item.snapshot.path)!)) ||
            files.get(item.snapshot.path) !== item.file
          )
            current = false;
        }
        if (current)
          for (const { file, ...presentation } of changes) Object.assign(file, presentation);
      } catch (error) {
        if (input.signal.aborted) throw input.signal.reason;
        issue(
          error instanceof EvaluationFailure ? error.kind : "test-body-selection",
          1,
          error instanceof EvaluationFailure ? error.message : undefined,
        );
      }
      if (issues.has("authentication") && !files.size)
        throw new EvaluationFailure("authentication");
    } catch (error) {
      if (
        !input.signal.aborted ||
        (error !== input.signal.reason && !(error instanceof Error && error.name === "AbortError"))
      )
        throw error;
      issue("cancelled");
    }
    // Cancellation can occur before the selection phase creates admitted-file records.
    for (const candidate of candidates.values())
      if (!files.has(candidate.path))
        files.set(candidate.path, {
          ...candidate,
          roles: [],
          leads: [],
          selected: [],
          rendered: [],
          excerpts: [],
          sourceOmitted: false,
        });
    const context = await repositoryContext(
      reader,
      sortedCandidates().map((candidate) => files.get(candidate.path)!),
      declarations,
      (path) => unchanged(candidates.get(path)!),
    );
    // File assessment may outlive the bytes it classified, for every language.
    for (const candidate of candidates.values()) await unchanged(candidate);
    return {
      root: reader.root,
      query: input.query,
      status: input.signal.aborted ? "interrupted" : issues.size ? "incomplete" : "complete",
      files: sortedCandidates().map((candidate) => files.get(candidate.path)!),
      repositoryContext: context,
      issues: [...issues].map(([kind, count]) => ({ kind, count })),
      warnings: evaluator.cacheIssues,
      providerFailure,
      counts: {
        requests: evaluator.requests,
        cacheHits: evaluator.cacheHits ?? 0,
        inspectedFiles: inspected.size,
      },
    };
  } finally {
    await reader.close();
  }
}
