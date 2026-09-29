import { test } from "node:test";
import assert from "node:assert/strict";
import { runParser } from "../../packages/core/src/parser.ts";
const source = (body) => "class Base:\n    def helper(self): return 1\nclass Child(Base):\n" + body;
test("parenthesized calls and receivers retain inherited-method reading leads", async () => {
  for (const call of ["(self).helper()", "(self.helper)()", "((self).helper)()"])
    assert.deepEqual(
      await runParser(
        "calls",
        JSON.stringify({
          source: source(`    def target(self):\n        return ${call}\n`),
          ranges: [{ startLine: 5, endLine: 5 }],
        }),
      ),
      [
        {
          caller: "Child.target",
          name: "Base.helper",
          startLine: 2,
          endLine: 2,
          unknownEarlierBases: [],
          ownerHeader: { startLine: 1, endLine: 1 },
        },
      ],
      call,
    );
});
test("comments inside parentheses preserve inherited-method reading leads", async () => {
  for (const call of [
    "(\n            # receiver\n            self\n        ).helper()",
    "(\n            # callee\n            self.helper\n        )()",
  ]) {
    const input = source(`    def target(self):\n        return ${call}\n`).replace(
      "Child(Base)",
      "Child(\n    # base\n    (Base)\n)",
    );
    assert.deepEqual(
      await runParser(
        "calls",
        JSON.stringify({ source: input, ranges: [{ startLine: 4, endLine: 20 }] }),
      ),
      [
        {
          caller: "Child.target",
          name: "Base.helper",
          startLine: 2,
          endLine: 2,
          unknownEarlierBases: [],
          ownerHeader: { startLine: 1, endLine: 1 },
        },
      ],
    );
  }
});
test("selecting a multiline call's opening line retains its inherited-method lead", async () => {
  const input = source("    def target(self):\n        return self.helper(\n        )\n");
  assert.deepEqual(
    await runParser(
      "calls",
      JSON.stringify({ source: input, ranges: [{ startLine: 5, endLine: 5 }] }),
    ),
    [
      {
        caller: "Child.target",
        name: "Base.helper",
        startLine: 2,
        endLine: 2,
        unknownEarlierBases: [],
        ownerHeader: { startLine: 1, endLine: 1 },
      },
    ],
  );
  assert.deepEqual(
    await runParser(
      "calls",
      JSON.stringify({ source: input, ranges: [{ startLine: 6, endLine: 6 }] }),
    ),
    [],
  );
});
test("writing an instance attribute preserves inherited self-call leads", async () => {
  const calls = await runParser(
    "calls",
    JSON.stringify({
      source: source("    def target(self):\n        self.x = 1\n        return self.helper()\n"),
      ranges: [{ startLine: 6, endLine: 6 }],
    }),
  );
  assert.deepEqual(calls, [
    {
      caller: "Child.target",
      name: "Base.helper",
      startLine: 2,
      endLine: 2,
      unknownEarlierBases: [],
      ownerHeader: { startLine: 1, endLine: 1 },
    },
  ]);
});
test("a keyword-rest argument named self is not an instance receiver", async () => {
  assert.deepEqual(
    await runParser(
      "calls",
      JSON.stringify({
        source: source("    def target(**self):\n        return self.helper()\n"),
        ranges: [{ startLine: 5, endLine: 5 }],
      }),
    ),
    [],
  );
});
test("rebinding self suppresses leads while Unicode receiver identifiers normalize", async () => {
  for (const statement of [
    "self = other",
    "self, x = pair",
    "for self in things: pass",
    "with context() as self: pass",
  ]) {
    assert.deepEqual(
      await runParser(
        "calls",
        JSON.stringify({
          source: source(
            `    def target(self):\n        ${statement}\n        return self.helper()\n`,
          ),
          ranges: [{ startLine: 6, endLine: 6 }],
        }),
      ),
      [],
    );
  }
  const result = await runParser(
    "calls",
    JSON.stringify({
      source: source("    def target(ſelf):\n        return ſelf.helper()\n"),
      ranges: [{ startLine: 5, endLine: 5 }],
    }),
  );
  assert.equal(result[0].name, "Base.helper");
});
test("keyword-only self and rebound receiver names do not create inherited-call leads", async () => {
  const examples = [
    "    def target(*, self):\n        return self.helper()\n",
    "    def target(self):\n        import module as self\n        return self.helper()\n",
    "    def target(self):\n        try: pass\n        except Error as self: return self.helper()\n",
    "    def target(self):\n        match value:\n            case self: return self.helper()\n",
  ];
  for (const body of examples)
    assert.deepEqual(
      await runParser(
        "calls",
        JSON.stringify({ source: source(body), ranges: [{ startLine: 4, endLine: 12 }] }),
      ),
      [],
      body,
    );
});
test("parenthesized local base names still resolve inherited methods", async () => {
  const result = await runParser(
    "calls",
    JSON.stringify({
      source: source("    def target(self): return self.helper()\n").replace(
        "Child(Base)",
        "Child((Base))",
      ),
      ranges: [{ startLine: 4, endLine: 4 }],
    }),
  );
  assert.equal(result[0]?.name, "Base.helper");
});
