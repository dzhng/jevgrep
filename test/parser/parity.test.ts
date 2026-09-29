import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runParser } from "../../packages/core/src/parser.ts";
const reference = (helper: string, input: string) => {
  const result = spawnSync(
    "python3",
    ["-I", fileURLToPath(new URL(`./reference/python/${helper}.py`, import.meta.url))],
    { input, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};
test("Python declaration, preview, neighborhood and inherited-call outputs match the frozen helpers", async () => {
  const sources = [
    'def target():\n    ("' +
      "long docs ".repeat(100) +
      '" # comment\n     "rest")\n    return "implementation"\n',
    '@decorator\nclass Café:\n    """doc"""\n    @property\n    def first(self):\n        return "🙂"\n    def second(self):\n        return 2\n',
    'class Root:\n    def helper(self):\n        return "🙂"\nclass Child(Root):\n    def target(self):\n        return self.helper()\n',
    'class Root:\n    def helper(self): pass\nclass Child(Unknown, Root):\n    def target(self: "Child"):\n        return self.helper()\n',
    "class A:\n    def target(self):\n        if True:\n            return 1\n            # trailing\n    # class tail\n",
    'def target(): "docs"; return "🙂 implementation"\n',
    'def K():\n    ("""long docs""")\n    return "🙂 implementation"\n',
    "class Root:\n    def helper(self): pass\nclass Child(Root):\n    def target(self):\n        with context() as self:\n            return self.helper()\n",
  ];
  for (const base of sources)
    for (const ending of ["\n", "\r\n"]) {
      const source = (base + "# padding\n".repeat(200)).replaceAll("\n", ending);
      for (const helper of ["inspect", "neighborhood", "calls", "preview"] as const) {
        const input =
          helper === "inspect"
            ? source
            : JSON.stringify(
                helper === "preview"
                  ? { path: "x.py", text: source, query: "target first K", budget: 600 }
                  : {
                      source,
                      ranges: [
                        {
                          startLine: base.trimEnd().split("\n").length,
                          endLine: base.trimEnd().split("\n").length,
                        },
                      ],
                    },
              );
        assert.deepEqual(
          await runParser(helper, input),
          reference(helper, input),
          `${helper}: ${base}`,
        );
      }
    }
});
