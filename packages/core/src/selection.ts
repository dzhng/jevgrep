import { EvaluationFailure } from "./evaluator";
import { evidenceRequest, type Evidence } from "./requests";
import {
  inspect,
  pythonNeighborhood,
  sourceForUnit,
  splitSource,
  type Range,
  type SourceUnit,
} from "./source";
import type { Evaluator, FileEvidence, ReadingLead, EvidenceRange } from "./types";

import type { Snapshot } from "./filesystem";
type Span = { start: number; end: number };
const sourceUnitBytes = 24_000;
export type SelectionResult = {
  file: FileEvidence;
  declarations: Array<Pick<SourceUnit, "name" | "range">>;
  issues: Array<{ kind: string; count: number }>;
  providerFailure?: string;
};

function mergeSpans(spans: Span[]): Span[] {
  const merged: Span[] = [];
  for (const span of spans
    .filter((span) => span.end > span.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = merged.at(-1);
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}

/** The bounded follow-up expands prior context once more; positive selections retain separate provenance. */
export async function selectFile(
  snapshot: Snapshot,
  query: string,
  score: number,
  evaluator: Evaluator,
  prepare?: () => Promise<{ evidence?: Evidence[] } | null>,
  previous?: FileEvidence,
  signal?: AbortSignal,
): Promise<SelectionResult> {
  const issues = new Map<string, number>();
  let providerFailure: string | undefined;
  const warn = (kind: string) => issues.set(kind, (issues.get(kind) ?? 0) + 1);
  if (
    previous &&
    (previous.path !== snapshot.path || previous.contentHash !== snapshot.contentHash)
  ) {
    warn("changed");
    previous = undefined;
  }
  const lines = snapshot.source.split("\n"),
    bytes = Buffer.from(snapshot.source),
    offsets = [0];
  for (const line of lines)
    offsets.push(Math.min(bytes.length, offsets.at(-1)! + Buffer.byteLength(line) + 1));
  function spanForRange(range: EvidenceRange): Span {
    return {
      start: range.sourceByteStart ?? offsets[range.startLine - 1]!,
      end: range.sourceByteEnd ?? offsets[range.endLine]!,
    };
  }
  function lineAt(byte: number) {
    let low = 0,
      high = lines.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (offsets[middle]! <= byte) low = middle;
      else high = middle;
    }
    return low + 1;
  }
  function rangeForSpan(span: Span): EvidenceRange {
    const startLine = lineAt(span.start),
      endLine = lineAt(Math.max(span.start, span.end - 1));
    return {
      startLine,
      endLine,
      ...(span.start !== offsets[startLine - 1] || span.end !== offsets[endLine]
        ? { sourceByteStart: span.start, sourceByteEnd: span.end }
        : {}),
    };
  }
  function partialLine(unit: SourceUnit) {
    return (
      unit.sourceByteStart !== (offsets[unit.range.startLine - 1] ?? bytes.length) ||
      unit.sourceByteEnd !== (offsets[unit.range.endLine] ?? bytes.length)
    );
  }
  const giantLine = lines.some((line) => Buffer.byteLength(line) > sourceUnitBytes);
  const syntax = await inspect(snapshot, {
    signal,
    maxUnitBytes: giantLine ? sourceUnitBytes : Math.max(sourceUnitBytes, bytes.length),
  });
  // Giant lines retain byte coordinates; ordinary fallback uses complete-source line fragments.
  let units = syntax.units;
  if (!giantLine && (syntax.mode === "text" || units.every((unit) => unit.partial))) {
    units = splitSource(snapshot, 3000).map((unit) => ({
      ...unit,
      range: {
        ...unit.range,
        endLine: lineAt(Math.max(unit.sourceByteStart, unit.sourceByteEnd - 1)),
      },
    }));
  }
  if (!giantLine)
    units = units.flatMap((unit) => {
      if (
        Buffer.byteLength(lines.slice(unit.range.startLine - 1, unit.range.endLine).join("\n")) <=
        sourceUnitBytes
      )
        return [unit];
      const blocks: SourceUnit[] = [];
      for (let start = unit.range.startLine; start <= unit.range.endLine; start += 16) {
        const end = Math.min(unit.range.endLine, start + 15);
        blocks.push({
          id: `${unit.name}:${start}:${end}`,
          name: unit.name,
          range: { startLine: start, endLine: end },
          sourceByteStart: offsets[start - 1]!,
          sourceByteEnd: offsets[end]!,
          partial: true,
        });
      }
      return blocks;
    });
  const selectedCoordinates: Range[] = [];
  const selected: Span[] = (previous?.selected ?? []).map(spanForRange);
  const sourceDecisions = new Map<string, { range: EvidenceRange; score: number }>();
  for (const decision of previous?.sourceDecisions ?? []) {
    const span = spanForRange(decision.range);
    sourceDecisions.set(`${span.start}:${span.end}`, decision);
  }
  const contextSpans: Span[] = (previous?.rendered ?? []).map(spanForRange);
  const leads = new Map<string, ReadingLead>();
  function addLead(lead: ReadingLead) {
    const key = JSON.stringify([lead.name, lead.range]);
    leads.set(key, lead);
  }
  for (const lead of previous?.leads ?? []) addLead({ ...lead, range: { ...lead.range } });
  const groups: SourceUnit[][] = [];
  let pending: SourceUnit[] = [];
  for (const unit of units) {
    if (
      pending.length &&
      (pending.length >= 128 ||
        Buffer.byteLength(
          lines.slice(pending[0]!.range.startLine - 1, unit.range.endLine).join("\n"),
        ) > 42000)
    ) {
      groups.push(pending);
      pending = [];
    }
    pending.push(unit);
  }
  if (pending.length) groups.push(pending);
  let invalidated = false;
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex]!;
    try {
      const prepared = prepare ? await prepare() : {};
      if (prepared === null) {
        invalidated = true;
        selected.length = 0;
        selectedCoordinates.length = 0;
        contextSpans.length = 0;
        leads.clear();
        break;
      }
      const first = Math.max(1, group[0]!.range.startLine - 8),
        last = Math.min(lines.length, group.at(-1)!.range.endLine + 8);
      const oversizedContext = [...lines.slice(0, 20), ...lines.slice(first - 1, last)].some(
        (line) => Buffer.byteLength(line) > sourceUnitBytes,
      );
      // Line-only windows cannot describe a partial giant line; send only the parser's bounded byte spans.
      const context =
        group.some(partialLine) || oversizedContext
          ? group
              .map(
                (unit) =>
                  `Source lines ${unit.range.startLine}-${unit.range.endLine}; source bytes ${unit.sourceByteStart}-${unit.sourceByteEnd}:\n${sourceForUnit(snapshot, unit)}`,
              )
              .join("\n")
          : bytes.length <= 16000
            ? snapshot.source
            : `Opening context:\n${lines.slice(0, 20).join("\n")}\nSource lines ${first}-${last}:\n${lines.slice(first - 1, last).join("\n")}`;
      const request = evidenceRequest(
        query,
        snapshot.path,
        context,
        group.map((unit) => ({ name: unit.name, ...unit.range })),
        prepared.evidence,
      );
      // Shared evidence contributes to the state limit as well as local source.
      if (group.length > 1 && Buffer.byteLength(JSON.stringify(request.state)) > 80_000) {
        const middle = Math.ceil(group.length / 2);
        groups.splice(groupIndex, 1, group.slice(0, middle), group.slice(middle));
        groupIndex--;
        continue;
      }
      const answers = await evaluator.evaluate(request);
      const values = group.map((unit, index) => {
        const values = [
          answers[`q${index}`],
          answers[`scope${index}`],
          ...(prepared.evidence !== undefined ? [answers[`ref${index}`]] : []),
        ];
        if (
          values.some(
            (value) =>
              typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1,
          )
        )
          throw new EvaluationFailure("provider");
        return { unit, value: Math.max(Math.min(values[0]!, values[1]!), values[2] ?? 0) };
      });
      for (const { unit, value } of values) {
        const decisionSpan = { start: unit.sourceByteStart, end: unit.sourceByteEnd };
        sourceDecisions.set(`${decisionSpan.start}:${decisionSpan.end}`, {
          range: rangeForSpan(decisionSpan),
          score: value,
        });
        // Only a valid contextual rejection retracts an earlier selection.
        // Failed or unprocessed groups retain their previous source spans.
        if (prepared.evidence !== undefined && value <= 0.5) {
          const start = unit.sourceByteStart,
            end = unit.sourceByteEnd;
          const retained = selected.flatMap((span) => {
            if (span.end <= start || span.start >= end) return [span];
            return [
              ...(span.start < start ? [{ start: span.start, end: start }] : []),
              ...(span.end > end ? [{ start: end, end: span.end }] : []),
            ];
          });
          selected.splice(0, selected.length, ...retained);
        }
        if (value > 0.5) {
          const span = { start: unit.sourceByteStart, end: unit.sourceByteEnd };
          selected.push(span);
          contextSpans.push(span);
          if (!partialLine(unit)) selectedCoordinates.push(unit.range);
        }
        if (value > 0.25 && !unit.name.endsWith(".context"))
          addLead({
            name: unit.name,
            range: partialLine(unit)
              ? rangeForSpan({ start: unit.sourceByteStart, end: unit.sourceByteEnd })
              : unit.range,
            score: value,
          });
      }
    } catch (error) {
      if (!(error instanceof EvaluationFailure)) throw error;
      warn(error.kind);
      if (error.kind === "provider") providerFailure ??= error.message;
      if (error.kind !== "provider") break;
    }
  }
  const chosen = mergeSpans(selected),
    wholeRanges: Range[] = [...selectedCoordinates],
    rendered: Span[] = [];
  for (const span of mergeSpans(contextSpans)) {
    const range = rangeForSpan(span);
    if (range.sourceByteStart !== undefined) rendered.push(span);
    else wholeRanges.push(range);
  }
  let neighborhood: Range[] = [];
  try {
    if (wholeRanges.length) neighborhood = await pythonNeighborhood(snapshot, wholeRanges, signal);
  } catch (error) {
    if (
      !signal?.aborted ||
      (error !== signal.reason && !(error instanceof Error && error.name === "AbortError"))
    )
      throw error;
    warn("cancelled");
  }
  function excerptsFor(ranges: Range[], rendered: Span[]) {
    const windows = ranges.map((range) => ({
      startLine: Math.max(1, range.startLine - 3),
      endLine: Math.min(lines.length, range.endLine + 3),
    }));
    for (const window of windows) {
      let changed = true;
      while (changed) {
        changed = false;
        for (const comment of syntax.comments) {
          const before =
            comment.endLine < window.startLine &&
            lines.slice(comment.endLine, window.startLine - 1).every((line) => !line.trim());
          const after =
            comment.startLine > window.endLine &&
            lines.slice(window.endLine, comment.startLine - 1).every((line) => !line.trim());
          if (
            (comment.startLine <= window.endLine && comment.endLine >= window.startLine) ||
            before ||
            after
          ) {
            const start = Math.min(window.startLine, comment.startLine),
              end = Math.max(window.endLine, comment.endLine);
            if (start !== window.startLine || end !== window.endLine) {
              window.startLine = start;
              window.endLine = end;
              changed = true;
            }
          }
        }
      }
      let segmentStart = offsets[window.startLine - 1]!;
      for (let line = window.startLine; line <= window.endLine; line++) {
        const start = offsets[line - 1]!,
          end = offsets[line]!;
        // An adjacent selected declaration must not accidentally include an unselected giant line.
        if (end - start > sourceUnitBytes) {
          rendered.push({ start: segmentStart, end: start });
          for (const span of chosen)
            if (span.start < end && span.end > start)
              rendered.push({ start: Math.max(span.start, start), end: Math.min(span.end, end) });
          segmentStart = end;
        }
      }
      rendered.push({ start: segmentStart, end: offsets[window.endLine]! });
    }
    const output = mergeSpans(rendered);
    function renderedRange(span: Span): EvidenceRange {
      const range = rangeForSpan(span);
      // A trailing empty line has no byte interval, but remains part of a line-based window.
      if (
        range.sourceByteStart === undefined &&
        span.end === bytes.length &&
        windows.some((window) => window.endLine === lines.length)
      )
        range.endLine = lines.length;
      return range;
    }
    return {
      rendered: output.map(renderedRange),
      excerpts: output.map((span) => {
        const range = renderedRange(span),
          partial = range.sourceByteStart !== undefined;
        return {
          range,
          source: partial
            ? bytes.subarray(span.start, span.end).toString("utf8")
            : lines.slice(range.startLine - 1, range.endLine).join("\n"),
          ...(partial
            ? { sourceByteStart: span.start, sourceByteEnd: span.end, partial: true }
            : {}),
        };
      }),
    };
  }
  const expanded = excerptsFor([...wholeRanges, ...neighborhood], rendered);
  // Presentation can be stricter without narrowing evidence sent to Jev.
  const displayed = mergeSpans(
    [...sourceDecisions.values()]
      .filter((decision) => decision.score > 0.7)
      .map((decision) => spanForRange(decision.range))
      .flatMap((span) =>
        chosen.flatMap((selectedSpan) => {
          const start = Math.max(span.start, selectedSpan.start);
          const end = Math.min(span.end, selectedSpan.end);
          return start < end ? [{ start, end }] : [];
        }),
      ),
  );
  function presentationFor(spans: typeof chosen) {
    const selectedRanges = spans.map(rangeForSpan);
    const ownerHeaders = new Map<string, Range>();
    for (const unit of syntax.units) {
      if (!spans.some((span) => span.start < unit.sourceByteEnd && span.end > unit.sourceByteStart))
        continue;
      for (const header of unit.ownerHeaders ?? []) {
        const byteLength = offsets[header.endLine]! - offsets[header.startLine - 1]!;
        if (byteLength <= sourceUnitBytes)
          ownerHeaders.set(`${header.startLine}:${header.endLine}`, header);
      }
    }
    return excerptsFor(
      [
        ...selectedRanges.filter((range) => range.sourceByteStart === undefined),
        ...ownerHeaders.values(),
      ],
      spans.filter((span) => rangeForSpan(span).sourceByteStart !== undefined),
    );
  }
  const presentation = presentationFor(displayed);
  const file: FileEvidence = {
    path: snapshot.path,
    contentHash: snapshot.contentHash,
    score,
    roles: [...(previous?.roles ?? [])],
    leads: [...leads.values()],
    selected: chosen.map(rangeForSpan),
    rendered: expanded.rendered,
    excerpts: expanded.excerpts,
    presentationExcerpts: presentation.excerpts,
    selectedPresentationExcerpts: presentationFor(chosen).excerpts,
    presentationSelected: displayed.map(rangeForSpan),
    sourceDecisions: [...sourceDecisions.values()],
    sourceOmitted: invalidated,
  };
  return {
    file,
    declarations: units.map(({ name, range }) => ({ name, range })),
    issues: [...issues].map(([kind, count]) => ({ kind, count })),
    providerFailure,
  };
}
