import { expect, test } from "bun:test";
import { selectFile } from "../src/selection";
import { EvaluationFailure, type EvaluationRequest } from "../src/evaluator";
import type { Evaluator } from "../src/types";
import type { Declaration } from "../src/requests";

function evaluator(
  score: (declaration: Declaration, request: EvaluationRequest) => number,
): Evaluator {
  return {
    requests: 0,
    async evaluate(request) {
      const declarations = (request.state as { declarations: Declaration[] }).declarations;
      return Object.fromEntries(
        declarations.flatMap((declaration, index) => [
          [`q${index}`, score(declaration, request)],
          [`scope${index}`, 1],
          ...(request.questions[`ref${index}`] ? [[`ref${index}`, 0]] : []),
        ]),
      );
    },
  };
}

test("selected source and optional leads retain distinct meanings and exact original coordinates", async () => {
  const source =
    "// explanation\r\nexport function selected() {\r\n  return 'é';\r\n}\r\n" +
    "\r\n".repeat(10) +
    "export function lead() { return 0; }\r\n";
  const snapshot = { path: "example.ts", contentHash: "same snapshot", source };
  const result = await selectFile(
    snapshot,
    "behavior",
    0.9,
    evaluator((d) => (d.name === "selected" ? 0.8 : 0.4)),
  );
  expect(result.issues).toEqual([]);
  expect(result.file.selected).toEqual([{ startLine: 2, endLine: 4 }]);
  expect(result.file.leads.map((lead) => ({ name: lead.name, score: lead.score }))).toEqual([
    { name: "selected", score: 0.8 },
    { name: "lead", score: 0.4 },
  ]);
  expect(result.file.excerpts[0]!.source).toBe(source.split("\n").slice(0, 7).join("\n"));
  expect(result.file.excerpts.some((excerpt) => excerpt.source.includes("function lead"))).toBe(
    false,
  );
});

test("strict thresholds keep .context out of leads without conflating it with source", async () => {
  const source =
    "class Example {\n  alpha() { return 1; }\n  beta() { return 2; }\n  gamma() { return 3; }\n}\n";
  const result = await selectFile(
    { path: "thresholds.ts", contentHash: "x", source },
    "q",
    0.8,
    evaluator((d) =>
      d.name.endsWith(".context")
        ? 0.9
        : d.name.endsWith("alpha")
          ? 0.5
          : d.name.endsWith("beta")
            ? 0.25
            : 0.26,
    ),
  );
  expect(result.file.selected).toEqual([{ startLine: 1, endLine: 1 }]);
  expect(result.file.leads.map((lead) => lead.name)).toEqual(["Example.alpha", "Example.gamma"]);
});

test("valid contextual rejection retracts selection without promoting surrounding context", async () => {
  const method = (name: string) =>
    `    def ${name}(self):\n        a = 1\n        b = 2\n        c = 3\n        d = 4\n        e = 5\n        return a + b + c + d + e\n\n`;
  const source =
    "class Example:\n" + ["before", "target", "after", "unrelated", "later"].map(method).join("");
  const snapshot = { path: "example.py", contentHash: "python", source };
  const first = await selectFile(
    snapshot,
    "target behavior",
    0.9,
    evaluator((d) => (d.name === "Example.target" ? 0.9 : 0)),
  );
  expect(first.issues).toEqual([]);
  expect(first.file.selected).toEqual([{ startLine: 10, endLine: 16 }]);
  expect(first.file.excerpts[0]!.source).toContain("def before");
  expect(first.file.excerpts[0]!.source).toContain("def after");
  first.file.roles = ["implementation"];
  const evidence = [
    { path: "test_example.py", startLine: 1, endLine: 1, source: "Example.target()" },
  ];
  let calls = 0;
  const second = await selectFile(
    snapshot,
    "target behavior",
    0.9,
    evaluator((_d, request) => {
      calls++;
      expect((request.state as { selectedEvidence: unknown }).selectedEvidence).toEqual(evidence);
      expect(request.questions.ref0!.instructions).toContain(
        "exact symbol, fixture object, or event handler explicitly referenced",
      );
      return 0;
    }),
    async () => ({ evidence }),
    first.file,
  );
  expect(calls).toBeGreaterThan(0);
  expect(second.file.rendered).toEqual([{ startLine: 1, endLine: source.split("\n").length }]);
  expect(second.file.excerpts[0]!.source).toBe(source);
  expect(second.file.selected).toEqual([]);
  expect(second.file.roles).toEqual(["implementation"]);
});

test("provider failures retain successful groups and fatal failures stop subsequent groups", async () => {
  const source = Array.from({ length: 20 }, (_, i) => `function f${i}() { return ${i}; }\n`).join(
    "",
  );
  for (const kind of ["provider", "authentication", "request-limit", "cancelled"] as const) {
    let calls = 0;
    const fake: Evaluator = {
      requests: 0,
      async evaluate(request) {
        calls++;
        if (calls === 2) throw new EvaluationFailure(kind);
        return Object.fromEntries(Object.keys(request.questions).map((key) => [key, 0.9]));
      },
    };
    const result = await selectFile(
      { path: "many.ts", contentHash: "many", source },
      "q",
      0.9,
      fake,
    );
    expect(result.issues).toEqual([{ kind, count: 1 }]);
    expect(calls).toBe(kind === "provider" ? 3 : 2);
    expect(result.file.selected).toEqual(
      kind === "provider"
        ? [
            { startLine: 1, endLine: 8 },
            { startLine: 17, endLine: 20 },
          ]
        : [{ startLine: 1, endLine: 8 }],
    );
  }
});

test("partial giant lines stay byte-bounded and can be contextually rejected", async () => {
  const source = "é".repeat(18000) + "TARGET" + "z".repeat(75000) + "\n";
  const snapshot = { path: "large.txt", contentHash: "large", source };
  const first = await selectFile(
    snapshot,
    "TARGET",
    0.8,
    evaluator((_d, request) => {
      const context = (request.state as { source: string }).source;
      expect(Buffer.byteLength(context)).toBeLessThan(25000);
      return context.includes("TARGET") ? 0.9 : 0;
    }),
  );
  expect(first.file.selected).toEqual([
    { startLine: 1, endLine: 1, sourceByteStart: 24000, sourceByteEnd: 48000 },
  ]);
  const excerpt = first.file.excerpts[0]!;
  expect(excerpt.source).toBe(Buffer.from(source).subarray(24000, 48000).toString("utf8"));
  expect(excerpt).toMatchObject({ partial: true, sourceByteStart: 24000, sourceByteEnd: 48000 });
  const second = await selectFile(
    snapshot,
    "TARGET",
    0.8,
    evaluator(() => 0),
    async () => ({ evidence: [{ path: "other.txt", startLine: 1, endLine: 1, source: "TARGET" }] }),
    first.file,
  );
  expect(second.file.selected).toEqual([]);
  expect(second.file.excerpts).toEqual(first.file.excerpts);
});

test("malformed group answers stay unknown without discarding previous successes", async () => {
  const source =
    "function first() { return 1; }\n" + "\n".repeat(10) + "function second() { return 2; }\n";
  const snapshot = { path: "a.ts", contentHash: "same", source };
  const first = await selectFile(
    snapshot,
    "q",
    0.8,
    evaluator((d) => (d.name === "first" ? 0.9 : 0)),
  );
  const broken: Evaluator = {
    requests: 0,
    async evaluate() {
      return { q0: 0.9 };
    },
  };
  const second = await selectFile(
    snapshot,
    "q",
    0.8,
    broken,
    async () => ({ evidence: [{ path: "other.ts", startLine: 1, endLine: 1, source: "first()" }] }),
    first.file,
  );
  expect(second.issues).toEqual([{ kind: "provider", count: 1 }]);
  expect(second.file.selected).toEqual(first.file.selected);
  expect(second.file.excerpts[0]!.source).toBe(source.split("\n").slice(0, 7).join("\n"));
});

test("large-source requests include bounded opening and local context", async () => {
  const source =
    ("//" + "x".repeat(500) + "\n").repeat(40) + "function target() {\n  return 1;\n}\n";
  const lines = source.split("\n");
  let captured: EvaluationRequest | undefined;
  await selectFile(
    { path: "context.ts", contentHash: "context", source },
    "q",
    0.8,
    evaluator((_d, request) => {
      captured = request;
      return 0;
    }),
  );
  expect(captured!.state).toMatchObject({
    source: `Opening context:\n${lines.slice(0, 20).join("\n")}\nSource lines 33-44:\n${lines.slice(32, 44).join("\n")}`,
    declarations: [{ name: "target", startLine: 41, endLine: 43 }],
  });
});

test("previous evidence from changed bytes is discarded explicitly", async () => {
  const old = await selectFile(
    { path: "a.ts", contentHash: "old", source: "function old() {return 1;}\n" },
    "q",
    0.9,
    evaluator(() => 0.9),
  );
  const next = await selectFile(
    { path: "a.ts", contentHash: "new", source: "function next() {return 2;}\n" },
    "q",
    0.9,
    evaluator(() => 0),
    async () => ({ evidence: [] }),
    old.file,
  );
  expect(next.issues).toEqual([{ kind: "changed", count: 1 }]);
  expect(next.file.selected).toEqual([]);
  expect(next.file.leads).toEqual([]);
  expect(next.file.excerpts).toEqual([]);
});

test("scope excludes analogous code while a concrete reference can recover it", async () => {
  const snapshot = {
    path: "helper.ts",
    contentHash: "fixed",
    source: "export function helper() { return 1; }\n",
  };
  const fake: Evaluator = {
    requests: 0,
    async evaluate(request) {
      return { q0: 0.95, scope0: 0.1, ...(request.questions.ref0 ? { ref0: 0.9 } : {}) };
    },
  };
  const first = await selectFile(snapshot, "target behavior", 0.9, fake);
  expect(first.file.selected).toEqual([]);
  const second = await selectFile(
    snapshot,
    "target behavior",
    0.9,
    fake,
    async () => ({
      evidence: [{ path: "target.ts", startLine: 1, endLine: 1, source: "helper()" }],
    }),
    first.file,
  );
  expect(second.file.selected).toEqual([{ startLine: 1, endLine: 1 }]);
  expect(second.file.presentationExcerpts?.[0]?.source).toContain("export function helper()");
});

test("declaration groups overlap while preserving source-order evidence", async () => {
  const source = Array.from({ length: 16 }, (_, i) => `function f${i}() { return ${i}; }\n`).join(
    "",
  );
  const snapshot = { path: "parallel.ts", contentHash: "parallel", source };
  const expected = await selectFile(
    snapshot,
    "q",
    0.9,
    evaluator(() => 0.9),
  );
  let releaseFirst!: () => void;
  const secondStarted = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const completed: string[] = [];
  const concurrent: Evaluator = {
    requests: 0,
    async evaluate(request) {
      const first = (request.state as { declarations: Declaration[] }).declarations[0]!.name;
      if (first === "f0") await secondStarted;
      else releaseFirst();
      completed.push(first);
      return Object.fromEntries(Object.keys(request.questions).map((key) => [key, 0.9]));
    },
  };
  const actual = await selectFile(snapshot, "q", 0.9, concurrent);
  expect(completed).toEqual(["f8", "f0"]);
  expect(actual).toEqual(expected);
  expect(actual.file.leads.map((lead) => lead.name)).toEqual(
    Array.from({ length: 16 }, (_, i) => `f${i}`),
  );
  expect(actual.file.sourceDecisions?.map((decision) => decision.range.startLine)).toEqual(
    Array.from({ length: 16 }, (_, i) => i + 1),
  );
}, 1000);

test("preparation invalidation discards in-flight positives and previous evidence", async () => {
  const source = Array.from({ length: 16 }, (_, i) => `function f${i}() { return ${i}; }\n`).join(
    "",
  );
  const snapshot = { path: "stale.ts", contentHash: "stale", source };
  const previous = (
    await selectFile(
      snapshot,
      "q",
      0.9,
      evaluator(() => 0.9),
    )
  ).file;
  let started!: () => void;
  const active = new Promise<void>((resolve) => {
    started = resolve;
  });
  let finish!: () => void;
  const invalidation = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let preparations = 0;
  const result = await selectFile(
    snapshot,
    "q",
    0.9,
    {
      requests: 0,
      async evaluate(request) {
        started();
        await invalidation;
        return Object.fromEntries(Object.keys(request.questions).map((key) => [key, 0.9]));
      },
    },
    async () => {
      if (++preparations === 1) return {};
      await active;
      finish();
      return null;
    },
    previous,
  );
  expect(result.file.sourceOmitted).toBe(true);
  expect(result.file.selected).toEqual([]);
  expect(result.file.rendered).toEqual([]);
  expect(result.file.sourceDecisions).toEqual([]);
  expect(result.file.leads).toEqual([]);
  expect(result.file.excerpts).toEqual([]);
});

for (const kind of ["authentication", "cancelled"] as const)
  test(`${kind} stops admission and drains active groups before returning`, async () => {
    const source = Array.from({ length: 80 }, (_, i) => `function f${i}() { return ${i}; }\n`).join(
      "",
    );
    let started = 0;
    let completed = 0;
    let release!: () => void;
    const fullWave = new Promise<void>((resolve) => {
      release = resolve;
    });
    const result = await selectFile(
      { path: "terminal.ts", contentHash: "terminal", source },
      "q",
      0.9,
      {
        requests: 0,
        async evaluate(request) {
          const index = started++;
          if (started === 4) release();
          await fullWave;
          if (index === 0) throw new EvaluationFailure(kind);
          // Let the fatal outcome propagate before already-started work finishes.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          completed++;
          return Object.fromEntries(Object.keys(request.questions).map((key) => [key, 0.9]));
        },
      },
    );
    expect(started).toBe(4);
    expect(completed).toBe(3);
    expect(result.issues).toEqual([{ kind, count: 1 }]);
    expect(result.file.selected).toEqual([]);
  });

test("one preparation invalidation prevents duplicate side effects from queued groups", async () => {
  const source = Array.from({ length: 40 }, (_, i) => `function f${i}() { return ${i}; }\n`).join(
    "",
  );
  let invalidations = 0;
  const result = await selectFile(
    { path: "excluded.ts", contentHash: "excluded", source },
    "q",
    0.9,
    evaluator(() => {
      throw new Error("Excluded source must not be evaluated");
    }),
    async () => {
      await Promise.resolve();
      invalidations++;
      return null;
    },
  );
  expect(invalidations).toBe(1);
  expect(result.file.sourceOmitted).toBe(true);
  expect(result.file.selected).toEqual([]);
});
