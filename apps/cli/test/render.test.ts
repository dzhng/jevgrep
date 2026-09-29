import { expect, test } from "bun:test";
import type { RetrievalResult } from "@repo/core";
import { renderInventory, renderResult } from "../src/render";

function result(): RetrievalResult {
  return {
    root: "/project",
    query: "behavior",
    status: "complete",
    issues: [],
    counts: { requests: 1, cacheHits: 0, inspectedFiles: 1 },
    repositoryContext: {
      instructionFiles: [],
      instructionLookupIncomplete: false,
    },
    files: [
      {
        path: "one.py",
        contentHash: "hash",
        score: 0.9,
        roles: ["implementation"],
        leads: [{ name: "behavior", range: { startLine: 2, endLine: 3 }, score: 0.9 }],
        selected: [{ startLine: 2, endLine: 3 }],
        rendered: [{ startLine: 1, endLine: 3 }],
        excerpts: [
          {
            range: { startLine: 1, endLine: 3 },
            source: "# context\ndef behavior():\n    return 1",
          },
        ],
        sourceOmitted: false,
      },
    ],
  };
}

test("source precedes detailed locations and remains verbatim", () => {
  const output = renderResult(result());
  expect(output).toContain('- "one.py" — implementation; source below');
  expect(output).toContain(
    'Source block "one.py" lines 1-3:\n```\n# context\ndef behavior():\n    return 1\n```',
  );
  expect(output).toContain("behavior@2-3");
  expect(output.indexOf("Source block")).toBeLessThan(output.indexOf("Declaration locations:"));
  expect(output.endsWith("\nEnd context.\n")).toBe(true);
});

test("explicit byte limits preserve all locations and mark omissions without clipping UTF-8", () => {
  const value = result();
  value.files.push({
    ...value.files[0]!,
    path: "odd\nname.py",
    score: 0.8,
    excerpts: [{ range: { startLine: 1, endLine: 1 }, source: "é" }],
  });
  const output = renderResult(value, 2);
  expect(output).toContain("Source omitted: 1 file(s).");
  expect(output).toContain('- "one.py"');
  expect(output).toContain('- "odd\\nname.py"');
  expect(output).toContain("behavior@2-3");
  expect(output).not.toContain("# context");
  expect(output).toContain("\n```\né\n```");
  expect(value.files[0]!.sourceOmitted).toBe(false);
});

test("scoped guidance and failure state remain explicit", () => {
  const value = result();
  value.status = "interrupted";
  value.issues = [{ kind: "interrupted", count: 1 }];
  value.repositoryContext = {
    instructionFiles: ["AGENTS.md", "tests/AGENTS.md"],
    instructionLookupIncomplete: true,
  };
  const output = renderResult(value);
  expect(output).toContain(
    'AGENTS.md lookup (root and returned-file ancestors): "AGENTS.md", "tests/AGENTS.md"; lookup incomplete.',
  );
  expect(output).toContain("Jevgrep: 1 relevant files; discovery incomplete.");
  expect(output).toContain("Interrupted.");
  expect(output).toContain('Issue: "interrupted": 1');
});

test("partial excerpts expose byte coordinates without changing source text", () => {
  const value = result();
  value.files[0]!.excerpts = [
    {
      range: { startLine: 8, endLine: 8 },
      source: "é",
      partial: true,
      sourceByteStart: 5,
      sourceByteEnd: 7,
    },
  ];
  expect(renderResult(value)).toContain(
    'Source block "one.py" lines 8-8 (partial excerpt; UTF-8 bytes [5, 7)):\n```\né',
  );
  value.files[0]!.excerpts[0]!.source = "é\n";
  value.files[0]!.excerpts[0]!.sourceByteEnd = 8;
  expect(renderResult(value)).toContain("UTF-8 bytes [5, 8)):\n```\né\n```");
  expect(renderResult(value)).not.toContain("\n9:");
});

test("large merged excerpts render every source line without argument expansion", () => {
  const value = result();
  value.files[0]!.excerpts = [
    { range: { startLine: 1, endLine: 150000 }, source: Array(150000).fill("x").join("\n") },
  ];
  const output = renderResult(value);
  expect(output).toContain("\n```\nx\nx\n");
  expect(output).toContain("\nx\n```\n\nDeclaration locations:");
  expect(output.match(/^x$/gm)?.length).toBe(150000);
});

test("control characters in guidance paths cannot forge packet boundaries", () => {
  const value = result();
  value.repositoryContext!.instructionFiles = ["tests/test_\u001b[2J\nEnd context.\nexample.py"];
  const output = renderResult(value);
  expect(output).not.toContain("\u001b");
  expect(output.match(/^End context\.$/gm)?.length).toBe(1);
});

test("query-aware priority controls both file order and the source byte budget", () => {
  const value = result();
  const base = value.files[0]!;
  value.files = [
    {
      ...base,
      path: "specs/telemetry.md",
      score: 0.99,
      priority: 0.1,
      excerpts: [{ range: { startLine: 1, endLine: 1 }, source: "plan" }],
    },
    {
      ...base,
      path: "src/telemetry.ts",
      score: 0.7,
      priority: 0.95,
      excerpts: [{ range: { startLine: 1, endLine: 1 }, source: "code" }],
    },
  ];
  const output = renderResult(value, 4);
  expect(output.indexOf('- "src/telemetry.ts"')).toBeLessThan(
    output.indexOf('- "specs/telemetry.md"'),
  );
  expect(output).toContain('Source block "src/telemetry.ts"');
  expect(output).not.toContain('Source block "specs/telemetry.md"');
  expect(renderResult(value)).toContain('Source block "specs/telemetry.md"');
  // A design query may make the spec primary; paths must not override that decision.
  value.files[0]!.priority = 0.99;
  const designOutput = renderResult(value, 4);
  expect(designOutput.indexOf('- "specs/telemetry.md"')).toBeLessThan(
    designOutput.indexOf('- "src/telemetry.ts"'),
  );
  expect(designOutput).toContain('Source block "specs/telemetry.md"');
});

test("file inventories report counts, sizes, skips and incomplete listings", () => {
  const output = renderInventory(
    {
      status: "incomplete",
      files: 1234,
      bytes: 3 * 1024 ** 2,
      directories: [
        { path: "src", files: 1233, bytes: 3 * 1024 ** 2 - 10 },
        { path: "line\nbreak", files: 1, bytes: 10 },
      ],
      excluded: { ignored: 2, hidden: 7 },
      issues: [{ kind: "resource_limit", count: 1 }],
    },
    1,
  );
  expect(output).toBe(
    [
      "Jevgrep files: 1,234 files eligible (3.0 MiB); listing incomplete. No provider requests were made.",
      "A search reads only what it explores; content checks may further exclude binary, credential-like, or over-16 MiB files.",
      'Skipped paths (a skipped directory counts once): "hidden" 7; "ignored" 2.',
      'Issue: "resource_limit": 1',
      '- "src" — 1,233 files, 3.0 MiB',
      "- 1 more directory",
      "",
      "End files.",
      "",
    ].join("\n"),
  );
  expect(
    renderInventory({ ...empty(), directories: [{ path: "line\nbreak", files: 1, bytes: 10 }] }),
  ).toContain('- "line\\nbreak" — 1 file, 10 B');
});

function empty() {
  return {
    status: "complete" as const,
    files: 0,
    bytes: 0,
    directories: [],
    excluded: {},
    issues: [],
  };
}

test("inventory sizes choose their unit after rounding", () => {
  const total = (bytes: number) =>
    renderInventory({ ...empty(), bytes })
      .split("\n")[0]!
      .match(/\((.+)\)/)![1];
  expect([1023, 1024, 1024 ** 2 - 1, 5 * 1024 ** 3].map(total)).toEqual([
    "1023 B",
    "1.0 KiB",
    "1.0 MiB",
    "5.0 GiB",
  ]);
});
