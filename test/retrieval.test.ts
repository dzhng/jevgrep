import { renderResult } from "../apps/cli/src/render";
import { routeProviderFetch } from "./fixtures/provider-route.mjs";
import { expect, spyOn } from "bun:test";
import { mkdtemp, mkdir, open, writeFile, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testIfDocker } from "./helpers/docker";
import { retrieve } from "../packages/core/src/retrieve";
import { createEvaluator, EvaluationFailure } from "../packages/core/src/evaluator";

testIfDocker(
  "hierarchical retrieval returns source from multiple files without uploading excluded data",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-tree-"));
    const sent: string[] = [];
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const body = (await request.json()) as {
          state: { items?: Array<{ path: string }> };
          questions: Record<string, unknown>;
        };
        sent.push(JSON.stringify(body));
        return Response.json({
          answers: Object.fromEntries(
            Object.keys(body.questions).map((id) => [id, { type: "noul", noul: 0.9 }]),
          ),
        });
      },
    });
    try {
      await mkdir(join(root, "src/deep"), { recursive: true });
      await writeFile(join(root, ".gitignore"), "skipped.ts\n");
      await writeFile(join(root, "skipped.ts"), "DO_NOT_UPLOAD_IGNORED");
      await writeFile(join(root, ".env"), "DO_NOT_UPLOAD_SECRET");
      await writeFile(
        join(root, "src/events.ts"),
        "export class Events { record(name:string) {return name;} }\n",
      );
      await writeFile(
        join(root, "src/deep/backend.ts"),
        "export function sendEvent(name:string) {return name;}\n",
      );
      await writeFile(join(root, "test.ts"), "export function testEvent() {return true;}\n");
      const signal = new AbortController().signal;
      const evaluator = createEvaluator({
        apiKey: "fixture",
        provider: "vercel",
        fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
        signal,
      });
      const result = await retrieve({ root, query: "research event recording", signal }, evaluator);
      expect(result.status).toBe("complete");
      expect(result.files.map((file) => file.path).sort()).toEqual([
        "src/deep/backend.ts",
        "src/events.ts",
        "test.ts",
      ]);
      expect(
        result.files
          .find((file) => file.path === "src/events.ts")
          ?.excerpts.some((excerpt) => excerpt.source.includes("record(name:string)")),
      ).toBe(true);
      expect(sent.join("\n")).not.toContain("DO_NOT_UPLOAD");
      expect(result.counts.requests).toBe(sent.length);
    } finally {
      server.stop(true);
      await rm(root, { recursive: true, force: true });
    }
  },
  120_000,
);

testIfDocker(
  "excluded paths are never uploaded or returned",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-exclude-"));
    const sent: string[] = [];
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const body = (await request.json()) as { questions: Record<string, unknown> };
        sent.push(JSON.stringify(body));
        return Response.json({
          answers: Object.fromEntries(
            Object.keys(body.questions).map((id) => [id, { type: "noul", noul: 0.9 }]),
          ),
        });
      },
    });
    try {
      await mkdir(join(root, "src/generated"), { recursive: true });
      await writeFile(
        join(root, "src/events.ts"),
        "export class Events { record(name:string) {return name;} }\n",
      );
      await writeFile(
        join(root, "src/events.test.ts"),
        'export const excludedTest = "DO_NOT_UPLOAD_TEST";\n',
      );
      await writeFile(
        join(root, "src/generated/client.ts"),
        'export const excludedClient = "DO_NOT_UPLOAD_GENERATED";\n',
      );
      const signal = new AbortController().signal;
      const evaluator = createEvaluator({
        apiKey: "fixture",
        provider: "vercel",
        fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
        signal,
      });
      const result = await retrieve(
        {
          root,
          query: "research event recording",
          policy: { exclude: ["*.test.ts", "src/generated/"] },
          signal,
        },
        evaluator,
      );
      expect(result.status).toBe("complete");
      expect(result.files.map((file) => file.path)).toEqual(["src/events.ts"]);
      expect(sent.join("\n")).not.toContain("DO_NOT_UPLOAD");
      expect(sent.join("\n")).not.toContain("generated");
    } finally {
      server.stop(true);
      await rm(root, { recursive: true, force: true });
    }
  },
  120_000,
);

testIfDocker(
  "newly ignored evidence is withheld from follow-up requests and returned excerpts",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-ignore-change-"));
    const followups: Array<{ path?: string; selectedEvidence?: Array<{ path: string }> }> = [];
    let sawFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      sawFirst = resolve;
    });
    let calls = 0;
    try {
      await writeFile(
        join(root, "a.ts"),
        'export function firstEvent() {return "WITHHOLD_AFTER_IGNORE";}\n',
      );
      await writeFile(join(root, "b.ts"), "export function secondEvent() {return true;}\n");
      const result = await retrieve(
        { root, query: "event behavior", signal: new AbortController().signal },
        {
          get requests() {
            return calls;
          },
          async evaluate(request) {
            calls++;
            const state = request.state as {
              path?: string;
              declarations?: unknown;
              selectedEvidence?: Array<{ path: string }>;
            };
            if (state.declarations && !state.selectedEvidence) {
              if (state.path === "a.ts") sawFirst();
              if (state.path === "b.ts") {
                await first;
                await writeFile(join(root, ".ignore"), "a.ts\n");
              }
            }
            if (state.selectedEvidence) followups.push(state);
            return Object.fromEntries(
              Object.keys(request.questions).map((id) => [id, /^q\d+$/.test(id) ? 0.8 : 0.9]),
            );
          },
        },
      );
      expect(followups.length).toBeGreaterThan(0);
      expect(
        followups.some((request) => request.selectedEvidence?.some((file) => file.path === "a.ts")),
      ).toBe(false);
      expect(result.status).toBe("incomplete");
      expect(result.files.find((file) => file.path === "a.ts")?.excerpts).toEqual([]);
      expect(result.files.find((file) => file.path === "a.ts")?.sourceOmitted).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  120_000,
);

testIfDocker(
  "admitted text replaced with binary is incomplete rather than a healthy empty excerpt",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-binary-change-"));
    let calls = 0;
    try {
      await writeFile(join(root, "event.ts"), "export function event() {return true;}\n");
      const result = await retrieve(
        { root, query: "event behavior", signal: new AbortController().signal },
        {
          get requests() {
            return calls;
          },
          async evaluate(request) {
            calls++;
            const state = request.state as { items?: unknown[] };
            if (state.items) await writeFile(join(root, "event.ts"), Buffer.from([0, 1, 2]));
            return Object.fromEntries(Object.keys(request.questions).map((id) => [id, 0.9]));
          },
        },
      );
      expect(result.status).toBe("incomplete");
      expect(result.issues.some((issue) => issue.kind === "changed")).toBe(true);
      expect(result.files[0]?.path).toBe("event.ts");
      expect(result.files[0]?.excerpts).toEqual([]);
      expect(result.files[0]?.sourceOmitted).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

testIfDocker(
  "donors ignored during follow-up are absent from later evaluation requests",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-followup-change-"));
    let calls = 0;
    let changed = false;
    let staleUploads = 0;
    let followups = 0;
    try {
      for (let index = 0; index < 12; index++) {
        await writeFile(
          join(root, `${index}.ts`),
          `export function record${index}() {return true;}\n`,
        );
      }
      const result = await retrieve(
        { root, query: "record behavior", signal: new AbortController().signal },
        {
          get requests() {
            return calls;
          },
          async evaluate(request, policy) {
            await policy?.beforeAttempt?.();
            calls++;
            const state = request.state as { selectedEvidence?: Array<{ path: string }> };
            if (state.selectedEvidence) {
              followups++;
              if (followups > 1 && state.selectedEvidence.some((entry) => entry.path === "0.ts"))
                staleUploads++;
              if (!changed) {
                changed = true;
                await writeFile(join(root, ".ignore"), "0.ts\n");
              }
            }
            return Object.fromEntries(
              Object.keys(request.questions).map((id) => [id, /^q\d+$/.test(id) ? 0.8 : 0.9]),
            );
          },
        },
      );
      expect(changed).toBe(true);
      expect(followups).toBeGreaterThan(1);
      expect(staleUploads).toBe(0);
      expect(result.status).toBe("incomplete");
      expect(result.files.find((file) => file.path === "0.ts")?.excerpts).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

testIfDocker("an aborted evaluator cannot return a previously cached answer", async () => {
  const { createEvaluationCache } = await import("../packages/core/src/cache");
  const directory = await mkdtemp(join(tmpdir(), "jg-cache-abort-"));
  const controller = new AbortController();
  let calls = 0;
  const server = Bun.serve({
    port: 0,
    fetch() {
      calls++;
      return Response.json({ answers: { q: { type: "noul", noul: 0.8 } } });
    },
  });
  try {
    const evaluator = createEvaluator({
      apiKey: "fixture",
      provider: "vercel",
      fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
      signal: controller.signal,
      cache: createEvaluationCache({ directory }),
    });
    const request = {
      state: "test",
      questions: { q: { type: "boolean" as const, instructions: "Relevant?" } },
    };
    expect(await evaluator.evaluate(request)).toEqual({ q: 0.8 });
    expect(await evaluator.evaluate(request)).toEqual({ q: 0.8 });
    expect(evaluator.cacheHits).toBe(1);
    controller.abort();
    await expect(evaluator.evaluate(request)).rejects.toMatchObject({ kind: "cancelled" });
    expect(calls).toBe(1);
  } finally {
    server.stop(true);
    await rm(directory, { recursive: true, force: true });
  }
});

testIfDocker(
  "a file excluded during declaration selection is not uploaded in later groups",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-group-change-"));
    let declarations = 0;
    try {
      await writeFile(
        join(root, "events.ts"),
        Array.from({ length: 400 }, (_, i) => `export function event${i}() {return true;}\n`).join(
          "",
        ),
      );
      const result = await retrieve(
        { root, query: "event behavior", signal: new AbortController().signal },
        {
          requests: 0,
          async evaluate(request) {
            const state = request.state as { declarations?: unknown[] };
            if (state.declarations) {
              declarations++;
              if (declarations === 1) await writeFile(join(root, ".ignore"), "events.ts\n");
            }
            return Object.fromEntries(Object.keys(request.questions).map((id) => [id, 0.9]));
          },
        },
      );
      expect(declarations).toBe(1);
      expect(result.status).toBe("incomplete");
      expect(result.files[0]?.excerpts).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

testIfDocker(
  "cancellation between declaration groups preserves already selected source",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-partial-cancel-"));
    const controller = new AbortController();
    let groups = 0;
    try {
      await writeFile(
        join(root, "events.ts"),
        Array.from({ length: 400 }, (_, i) => `export function event${i}() {return ${i};}\n`).join(
          "",
        ),
      );
      const result = await retrieve(
        { root, query: "event behavior", signal: controller.signal },
        {
          requests: 0,
          async evaluate(request) {
            if ((request.state as { declarations?: unknown[] }).declarations) {
              groups++;
              controller.abort();
            }
            return Object.fromEntries(Object.keys(request.questions).map((id) => [id, 0.9]));
          },
        },
      );
      expect(result.status).toBe("interrupted");
      expect(groups).toBe(1);
      const source = result.files
        .flatMap((file) => file.excerpts.map((excerpt) => excerpt.source))
        .join("\n");
      expect(source).toContain("function event0");
      expect(source).not.toContain("function event399");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

testIfDocker(
  "file priority reaches stdout without changing relevance or excluding background documents",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-priority-"));
    const roles: Array<{ query: string; path: string; preview: { text: string } }> = [];
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const body = (await request.json()) as {
          state: {
            query: string;
            path: string;
            preview?: { text: string };
            items?: Array<{ path: string }>;
          };
          questions: Record<string, unknown>;
        };
        if (body.state.preview) roles.push(body.state as (typeof roles)[number]);
        const design = body.state.query.includes("design");
        return Response.json({
          answers: Object.fromEntries(
            Object.keys(body.questions).map((id, index) => [
              id,
              {
                type: "noul",
                noul:
                  id === "priority"
                    ? body.state.path.startsWith("specs/") === design
                      ? 0.95
                      : 0.1
                    : body.state.items
                      ? body.state.items[index]!.path.startsWith("specs/")
                        ? 0.99
                        : 0.7
                      : 0.9,
              },
            ]),
          ),
        });
      },
    });
    try {
      await mkdir(join(root, "src"));
      await mkdir(join(root, "specs"));
      await writeFile(
        join(root, "src/events.ts"),
        "export function record(name: string) { return name; }",
      );
      await writeFile(
        join(root, "specs/events.md"),
        "# Event design\nA plan for recording event names.",
      );
      for (const query of [
        "How does event recording work?",
        "Explain the event recording design plan",
      ]) {
        const signal = new AbortController().signal;
        const evaluator = createEvaluator({
          provider: "vercel",
          apiKey: "fixture",
          signal,
          fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
        });
        const value = await retrieve({ root, query, signal }, evaluator);
        expect(value.status).toBe("complete");
        expect(value.files.find((file) => file.path === "specs/events.md")!.score).toBe(0.99);
        const output = renderResult(value);
        const expected = query.includes("design")
          ? ["specs/events.md", "src/events.ts"]
          : ["src/events.ts", "specs/events.md"];
        expect(output.indexOf(`- "${expected[0]}"`)).toBeLessThan(
          output.indexOf(`- "${expected[1]}"`),
        );
        expect(output.indexOf(`Source block "${expected[0]}"`)).toBeLessThan(
          output.indexOf(`Source block "${expected[1]}"`),
        );
        expect(value.files.every((file) => !file.roles.includes("priority"))).toBe(true);
      }
      expect(
        roles.some(
          (state) => state.path === "specs/events.md" && state.preview.text.includes("A plan"),
        ),
      ).toBe(true);
    } finally {
      server.stop(true);
      await rm(root, { recursive: true, force: true });
    }
  },
  120_000,
);

testIfDocker(
  "test-body provider failure retains evidence and its diagnostic",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-test-body-failure-"));
    try {
      await writeFile(
        join(root, "test_behavior.py"),
        "import pytest\ndef test_behavior():\n    assert True\n",
      );
      const result = await retrieve(
        { root, query: "behavior tests", signal: new AbortController().signal },
        {
          requests: 0,
          async evaluate(request) {
            if (Object.hasOwn(request.state as object, "candidates"))
              throw new EvaluationFailure(
                "provider",
                false,
                undefined,
                "HTTP 503: fixture test selection unavailable",
              );
            return Object.fromEntries(Object.keys(request.questions).map((id) => [id, 0.95]));
          },
        },
      );
      expect(result.status).toBe("incomplete");
      expect(result.files[0]?.path).toBe("test_behavior.py");
      const output = renderResult(result);
      expect(output).toContain("def test_behavior():");
      expect(output).toContain("HTTP 503: fixture test selection unavailable");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  30_000,
);

testIfDocker(
  "terminal refinement failures stop later files without discarding first-pass evidence",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-refinement-stop-"));
    try {
      for (const path of ["a.ts", "b.ts", "c.ts"])
        await writeFile(join(root, path), "export function event() { return true; }\n");
      let followups = 0;
      const result = await retrieve(
        { root, query: "event", signal: new AbortController().signal },
        {
          requests: 0,
          async evaluate(request) {
            if ((request.state as { selectedEvidence?: unknown }).selectedEvidence) {
              followups++;
              throw new EvaluationFailure("authentication");
            }
            return Object.fromEntries(Object.keys(request.questions).map((id) => [id, 0.8]));
          },
        },
      );
      expect(followups).toBe(1);
      expect(result.status).toBe("incomplete");
      expect(result.files).toHaveLength(3);
      expect(result.files.every((file) => file.selected.length > 0)).toBe(true);
      expect(result.issues).toContainEqual({ kind: "authentication", count: 1 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

testIfDocker(
  "unparseable generated files do not fail the search or other files' parsing",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-unparseable-"));
    try {
      await mkdir(join(root, "src"), { recursive: true });
      await writeFile(
        join(root, "src/nested.ts"),
        "export const x = " + "(".repeat(20_000) + "1" + ")".repeat(20_000) + ";\n",
      );
      await writeFile(join(root, "src/generated.py"), "value = " + "1+".repeat(100_000) + "1\n");
      await writeFile(
        join(root, "src/events.py"),
        "class Events:\n    def record(self, name):\n        return name\n",
      );
      await writeFile(
        join(root, "src/events.ts"),
        "export class Events {\n  record(name: string) {\n    return name;\n  }\n}\n",
      );
      const result = await retrieve(
        { root, query: "event recording", signal: new AbortController().signal },
        {
          requests: 0,
          async evaluate(request) {
            return Object.fromEntries(Object.keys(request.questions).map((id) => [id, 0.9]));
          },
        },
      );
      expect(result.status).toBe("complete");
      const leads = (path: string) =>
        result.files.find((file) => file.path === path)?.leads.map((lead) => lead.name);
      // Healthy files keep declaration parsing; unparseable ones fall back to text.
      expect(leads("src/events.py")).toContain("Events.record");
      expect(leads("src/events.ts")).toContain("Events.record");
      for (const path of ["src/nested.ts", "src/generated.py"])
        expect(result.files.find((file) => file.path === path)?.excerpts.length).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  120_000,
);

testIfDocker(
  "retrieval reads an unchanged file once and still invalidates an edited candidate",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-reuse-"));
    const realNow = Date.now;
    // Fixture files must look older than the reader's recent-change guard.
    const clock = spyOn(Date, "now").mockImplementation(() => realNow() + 10_000);
    const source =
      "// REUSE_SENTINEL\n" +
      Array.from({ length: 20 }, (_, i) => `export function event${i}() {return ${i};}\n`).join("");
    const events = join(root, "events.ts");
    let reads = 0;
    let restoreRead = () => {};
    try {
      await writeFile(events, source);
      await writeFile(join(root, "other.ts"), "export function otherEvent() {return true;}\n");
      // Two writes can share a coarse clock tick; pin the first mtime so the edit is observable.
      await utimes(events, 0, 0);
      const probe = await open(events);
      const prototype = Object.getPrototypeOf(probe);
      const originalRead = prototype.read;
      await probe.close();
      const spy = spyOn(prototype, "read").mockImplementation(async function (
        this: unknown,
        ...args: unknown[]
      ) {
        const result = await originalRead.apply(this, args);
        if (result.buffer.subarray(0, result.bytesRead).toString().includes("REUSE_SENTINEL"))
          reads++;
        return result;
      });
      restoreRead = () => spy.mockRestore();
      const search = (edit: boolean) => {
        let edited = false;
        return retrieve(
          { root, query: "event behavior", signal: new AbortController().signal },
          {
            requests: 0,
            async evaluate(request, policy) {
              await policy?.beforeAttempt?.();
              const state = request.state as { declarations?: unknown[]; path?: string };
              if (edit && !edited && state.declarations && state.path === "events.ts") {
                edited = true;
                await writeFile(events, source.replace("return 0;", "return 9;"));
              }
              return Object.fromEntries(Object.keys(request.questions).map((id) => [id, 0.9]));
            },
          },
        );
      };
      const healthy = await search(false);
      expect(healthy.status).toBe("complete");
      expect(healthy.files.find((file) => file.path === "events.ts")?.excerpts.length).toBe(1);
      // Discovery, both selection passes, every freshness check and final output share one read.
      expect(reads).toBe(1);
      const changed = await search(true);
      expect(changed.status).toBe("incomplete");
      expect(changed.issues).toContainEqual({ kind: "changed", count: expect.any(Number) });
      expect(changed.files.find((file) => file.path === "events.ts")).toMatchObject({
        excerpts: [],
        sourceOmitted: true,
      });
    } finally {
      restoreRead();
      clock.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  },
);

testIfDocker(
  "cross-file evidence order does not depend on which file finishes selection first",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-donor-order-"));
    try {
      // Twenty declarations need three groups; one declaration needs one.
      await writeFile(
        join(root, "many.ts"),
        Array.from({ length: 20 }, (_, i) => `export function many${i}() {return ${i};}\n`).join(
          "",
        ),
      );
      await writeFile(join(root, "few.ts"), "export function few() {return 0;}\n");
      const donorOrders = async (slow: string) => {
        const orders: string[][] = [];
        await retrieve(
          { root, query: "event behavior", signal: new AbortController().signal },
          {
            requests: 0,
            async evaluate(request, policy) {
              await policy?.beforeAttempt?.();
              const state = request.state as {
                path?: string;
                declarations?: unknown[];
                selectedEvidence?: Array<{ path: string }>;
              };
              // Delay one file's first pass so it finishes selection after the other.
              if (state.declarations && !state.selectedEvidence && state.path === slow)
                await new Promise((resolve) => setTimeout(resolve, 50));
              if (state.selectedEvidence)
                orders.push([...new Set(state.selectedEvidence.map((entry) => entry.path))]);
              return Object.fromEntries(Object.keys(request.questions).map((id) => [id, 0.9]));
            },
          },
        );
        return orders;
      };
      for (const slow of ["few.ts", "many.ts"]) {
        const orders = await donorOrders(slow);
        expect(orders.length).toBeGreaterThan(0);
        // Fewer declaration groups first, as sequential selection used to finish them.
        for (const order of orders) expect(order).toEqual(["few.ts", "many.ts"]);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

for (const [layout, source, expected] of [
  ["class header", "export class Widget {\n  context() { return 1; }\n}\n", 1],
  ["member named context only", "export class Widget { context() { return 1; } }\n", 0],
] as const)
  testIfDocker(`relationship anchoring follows class structure: ${layout}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-anchor-"));
    let relationships = 0;
    try {
      await mkdir(join(root, "pkg/sub"), { recursive: true });
      await writeFile(join(root, "widget.ts"), source);
      await writeFile(
        join(root, "pkg/sub/child.ts"),
        "export class Child extends Widget { context() { return 2; } }\n",
      );
      await retrieve(
        { root, query: "widget context", signal: new AbortController().signal },
        {
          requests: 0,
          async evaluate(request) {
            const state = request.state as {
              relationAnchor?: unknown;
              items?: Array<{ kind: string }>;
            };
            if (state.relationAnchor) relationships++;
            return Object.fromEntries(
              Object.keys(request.questions).map((id, index) => [
                id,
                state.items ? (state.items[index]?.kind === "file" ? 0.9 : 0.1) : 0.9,
              ]),
            );
          },
        },
      );
      expect(relationships).toBe(expected);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

testIfDocker(
  "a large declaration index keeps its longest prefix that fits the preview",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-declaration-index-"));
    try {
      const count = 3000;
      await writeFile(
        join(root, "client.ts"),
        Array.from(
          { length: count },
          (_, i) => `export function op${i}(a: number) { return a + ${i}; }\n`,
        ).join(""),
      );
      const previews: Array<{ declarations?: unknown[]; declarationIndexTruncated?: boolean }> = [];
      await retrieve(
        { root, query: "op behavior", signal: new AbortController().signal },
        {
          requests: 0,
          async evaluate(request) {
            const state = request.state as {
              items?: Array<{ filePreview?: (typeof previews)[number] }>;
            };
            for (const item of state.items ?? [])
              if (item.filePreview) previews.push(item.filePreview);
            return Object.fromEntries(Object.keys(request.questions).map((id) => [id, 0.1]));
          },
        },
      );
      const preview = previews[0]!;
      const kept = preview.declarations!.length;
      expect(preview.declarationIndexTruncated).toBe(true);
      expect(kept).toBeGreaterThan(0);
      expect(kept).toBeLessThan(count);
      expect(preview.declarations).toEqual(
        Array.from({ length: kept }, (_, i) => ({
          name: `op${i}`,
          startLine: i + 1,
          endLine: i + 1,
        })),
      );
      // The index keeps the longest prefix: one more declaration would not fit.
      expect(Buffer.byteLength(JSON.stringify(preview))).toBeLessThanOrEqual(32000);
      const longer = {
        ...preview,
        declarations: [
          ...preview.declarations!,
          { name: `op${kept}`, startLine: kept + 1, endLine: kept + 1 },
        ],
      };
      expect(Buffer.byteLength(JSON.stringify(longer))).toBeGreaterThan(32000);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
