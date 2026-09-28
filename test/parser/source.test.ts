import { test } from "node:test";
import assert from "node:assert/strict";
import { inspect, sourceForUnit, splitSource } from "../../packages/core/src/source.ts";

test("Python preserves decorators, class context and nested declarations", async () => {
  const source =
    '# module\n@decorator\nclass Café:\n    """docs"""\n    value = 1\n    @property\n    def first(self):\n        def nested():\n            return "é"\n        return nested()\n\n    class Inner:\n        def method(self):\n            pass\n    tail = 2\n';
  const result = await inspect({ path: "sample.py", contentHash: "fixture", source });
  assert.equal(result.mode, "python");
  assert.deepEqual(
    result.units.map(({ name, range }) => ({ name, ...range })),
    [
      { name: "Café.context", startLine: 2, endLine: 5 },
      { name: "Café.first", startLine: 6, endLine: 10 },
      { name: "Café.context", startLine: 11, endLine: 11 },
      { name: "Café.Inner.context", startLine: 12, endLine: 12 },
      { name: "Café.Inner.method", startLine: 13, endLine: 14 },
      { name: "Café.context", startLine: 15, endLine: 15 },
    ],
  );
  assert.deepEqual(result.comments, [{ startLine: 1, endLine: 1 }]);
});

test("syntax errors and unsupported source fall back without losing source lines", async () => {
  for (const [path, source, reason] of [
    ["bad.py", "def broken(:\n  return 2\n", "syntax"],
    ["bad.ts", "const = ;", "syntax"],
    ["readme.md", "éé\r\nnext\r\nlast", "unsupported"],
  ]) {
    const result = await inspect(
      { path: path!, source: source!, contentHash: "fixture" },
      { maxUnitBytes: 8 },
    );
    assert.equal(result.mode, "text");
    assert.equal(result.fallback, reason);
    assert.equal(result.units[0]!.range.startLine, 1);
    assert.equal(result.units.at(-1)!.range.endLine, source!.split("\n").length);
  }
});

test("TypeScript syntax fallback retains block-comment ranges and exact source bytes", async () => {
  const source =
    "/*\n" + ("comment " + "x".repeat(70) + "\n").repeat(100) + "*/\nconst broken = ;\n";
  const snapshot = { path: "broken.ts", source, contentHash: "fixture" };
  const result = await inspect(snapshot, { maxUnitBytes: 3000 });
  assert.equal(result.mode, "text");
  assert.equal(result.fallback, "syntax");
  assert.deepEqual(result.comments, [{ startLine: 1, endLine: 102 }]);
  const { sourceForUnit } = await import("../../packages/core/src/source.ts");
  assert.equal(result.units.map((unit) => sourceForUnit(snapshot, unit)).join(""), source);
});

test("oversized Unicode lines are losslessly split into bounded byte spans", async () => {
  const source = "é漢🙂".repeat(10) + "\r\nend";
  const result = await inspect(
    { path: "large.txt", source, contentHash: "fixture" },
    { maxUnitBytes: 16 },
  );
  const bytes = Buffer.from(source);
  const pieces = result.units.map((unit) =>
    bytes.subarray(unit.sourceByteStart, unit.sourceByteEnd),
  );
  assert.ok(pieces.every((piece) => piece.length <= 16));
  assert.equal(
    pieces.map((piece) => new TextDecoder("utf-8", { fatal: true }).decode(piece)).join(""),
    source,
  );
  assert.ok(result.units.every((unit) => unit.partial));
});

test("selected methods add only their class header and small immediate neighbors", async () => {
  const { pythonNeighborhood } = await import("../../packages/core/src/source.ts");
  const source =
    'class Example:\n    """context"""\n    def first(self):\n        pass\n    @decorator\n    def middle(self):\n        pass\n    def last(self):\n        pass\n';
  assert.deepEqual(
    await pythonNeighborhood({ path: "example.py", source, contentHash: "fixture" }, [
      { startLine: 6, endLine: 7 },
    ]),
    [
      { startLine: 1, endLine: 2 },
      { startLine: 3, endLine: 4 },
      { startLine: 8, endLine: 9 },
    ],
  );
});

test("TS/JS uses original source coordinates, comments, and decorator-bearing members", async () => {
  const source =
    '/** header */\r\nexport class Box {\r\n  // getter\r\n  @trace\r\n  get value() { return "🙂"; }\r\n}\r\n';
  const result = await inspect({ path: "box.ts", source, contentHash: "fixture" });
  assert.equal(result.mode, "typescript");
  assert.deepEqual(
    result.units.map(({ name, range }) => ({ name, ...range })),
    [
      { name: "Box.context", startLine: 2, endLine: 3 },
      { name: "Box.value", startLine: 4, endLine: 5 },
    ],
  );
  assert.deepEqual(result.comments, [
    { startLine: 1, endLine: 1 },
    { startLine: 3, endLine: 3 },
  ]);
});

test("syntax outside reference Python 3.11 falls back across inspection, preview and neighbors", async () => {
  const { pythonNeighborhood, pythonPreview, sourceForUnit } =
    await import("../../packages/core/src/source.ts");
  for (const source of [
    'def target():\n    print "old"\n',
    'def target():\n    exec "x=1" in globals(), locals()\n',
    "try:\n    pass\nexcept Exception, e:\n    pass\n",
    'raise Error, "message", traceback\n',
    "value = left <> right\n",
    "value = 123L\n",
    "value = 0xFFl\n",
    "value = 0755\n",
    "value = 0_1\n",
    "value = `expression`\n",
    'value = ur"text"\n',
    'value = rU"text"\n',
    "def target((first, second)):\n    return first\n",
    "def target((first, second)=(1, 2)):\n    return first\n",
    "value = lambda (first, second): first\n",
    "type Alias = int\n",
    "def target[T](value: T):\n    return value\n",
    'value = f"{mapping["key"]}"\n',
    "value = f\"{'\\n'}\"\n",
    'value = f"""{value # comment\n}"""\n',
    'value = f"{(value +\n other)}"\n',
    "value = f'{1:{mapping['width']}}'\n",
    "value = f'{1:{\"\\n\"}}'\n",
  ]) {
    const snapshot = {
      path: "old.py",
      source: source + "# padding\n".repeat(60),
      contentHash: "fixture",
    };
    const result = await inspect(snapshot);
    assert.equal(result.mode, "text", source);
    assert.equal(result.fallback, "syntax", source);
    assert.equal(
      result.units.map((unit) => sourceForUnit(snapshot, unit)).join(""),
      snapshot.source,
    );
    assert.deepEqual(
      await pythonNeighborhood(snapshot, [{ startLine: 1, endLine: 2 }]),
      [],
      source,
    );
    const preview = await pythonPreview(snapshot, "target", 512);
    assert.equal(preview.parseUnavailable, true, source);
    assert.equal(preview.matchedDeclarations, 0, source);
  }
});

test("Python 3 equivalents and Python 2-looking strings remain parsed", async () => {
  for (const source of [
    'print("old")\n',
    "print >> stream, value\n",
    "print +1\nprint [1,2]\n",
    "value = f\"{mapping['key']}\"\n",
    'value = f"""{mapping["key"]}"""\n',
    'value = f"""{(value +\n other)}"""\n',
    "value = f\"{'#value'}\"\n",
    "value = f'{1:\\\n}'\n",
    "type = int\ndef target(value: int):\n    return value\n",
    'exec("x=1", globals(), locals())\n',
    "try:\n    pass\nexcept Exception as e:\n    pass\n",
    "try:\n    pass\nexcept (TypeError, ValueError):\n    pass\n",
    'raise Error("message") from cause\n',
    "raise (Error, value)\n",
    "value = 0o755 + 0xFF + 0b11 + 000 + 0_0\n",
    'value = u"text" + r"raw" + rb"bytes".decode()\n',
    "def target(value=[a for (a,b) in pairs]):\n    return value\n",
    "for (a,b) in pairs:\n    pass\n",
    '# print "old"; exec "x"; 123L\ntext = "ur\\\"text\\\" <> `value`"\n',
  ]) {
    const result = await inspect({ path: "modern.py", source, contentHash: "fixture" });
    assert.equal(result.mode, "python", source);
  }
});

test("trailing Python comments stay separate from AST declaration ends", async () => {
  const source = "class A:\n    def x(self):\n        pass\n    # tail\n";
  const result = await inspect({ path: "a.py", source, contentHash: "fixture" });
  assert.deepEqual(
    result.units.map(({ name, range }) => ({ name, ...range })),
    [
      { name: "A.context", startLine: 1, endLine: 1 },
      { name: "A.x", startLine: 2, endLine: 3 },
    ],
  );
  assert.deepEqual(result.comments, [{ startLine: 4, endLine: 4 }]);
});

test("an f-string expression is implementation, not a Python docstring", async () => {
  const { pythonPreview } = await import("../../packages/core/src/source.ts");
  const source = 'def target():\n    f"compute {value}"\n    return 2\n' + "# filler\n".repeat(120);
  const preview = await pythonPreview(
    { path: "a.py", source, contentHash: "fixture" },
    "target",
    600,
  );
  assert.ok(
    preview.spans.some(
      (span) => span.basis === "query-named implementation" && span.startLine === 2,
    ),
  );
});

test("parse ceiling still returns complete bounded text without losing CRLF", async () => {
  const { sourceForUnit } = await import("../../packages/core/src/source.ts");
  const source = 'def example():\r\n    return "🙂"\r\n';
  const snapshot = { path: "big.py", source, contentHash: "fixture" };
  const result = await inspect(snapshot, { maxParseBytes: 12, maxUnitBytes: 8 });
  assert.equal(result.fallback, "size");
  assert.equal(result.mode, "text");
  assert.equal(result.units.map((unit) => sourceForUnit(snapshot, unit)).join(""), source);
  assert.ok(result.units.every((unit) => Buffer.byteLength(sourceForUnit(snapshot, unit)) <= 8));
});

test("query previews skip parenthesized Python docstrings", async () => {
  const { pythonPreview } = await import("../../packages/core/src/source.ts");
  const source =
    'def target():\n    ("""' +
    "docs ".repeat(250) +
    '""")\n    return "IMPORTANT"\n' +
    "# filler\n".repeat(400);
  const result = await pythonPreview(
    { path: "a.py", source, contentHash: "fixture" },
    "target",
    600,
  );
  assert.ok(
    result.spans.some(
      (span) =>
        span.basis === "query-named implementation" &&
        span.startLine === 3 &&
        span.text.includes("IMPORTANT"),
    ),
  );
});

test("Python identifiers match normalized query names without changing source", async () => {
  const { pythonPreview } = await import("../../packages/core/src/source.ts");
  const source =
    "# opening\n".repeat(40) + 'def K():\n    return "important"\n' + "# filler\n".repeat(100);
  const snapshot = { path: "a.py", source, contentHash: "fixture" };
  assert.equal((await inspect(snapshot)).units[0]!.name, "K");
  for (const query of ["K", "K"]) {
    const result = await pythonPreview(snapshot, query, 600);
    assert.equal(result.matchedDeclarations, 1);
    assert.ok(
      result.spans.some(
        (span) => span.basis === "query-named implementation" && span.text.includes("important"),
      ),
    );
  }
});

test("empty Python suites fall back instead of crashing query previews", async () => {
  const { pythonPreview } = await import("../../packages/core/src/source.ts");
  const source = "def f():\n" + "\n".repeat(700),
    snapshot = { path: "a.py", source, contentHash: "fixture" };
  const result = await pythonPreview(snapshot, "f", 600);
  assert.equal(result.parseUnavailable, true);
  assert.equal(result.matchedDeclarations, 0);
  assert.equal((await inspect(snapshot)).mode, "text");
});

test("TypeScript source units preserve embedded comments verbatim", async () => {
  const source =
    'function x() {\n // end\n}\nconst x = /*important*/ 1;\nconst url="https://example.test";\nconst regexp=/https?:\\/\\//;\n';
  const snapshot = { path: "comments.ts", source, contentHash: "fixture" };
  const result = await inspect(snapshot);
  const { sourceForUnit } = await import("../../packages/core/src/source.ts");
  assert.equal(
    sourceForUnit(snapshot, result.units[0]!),
    source.split("\n").slice(0, 3).join("\n") + "\n",
  );
});

test("same-named classes retain their own structural headers", async () => {
  for (const [path, source] of [
    [
      "same.py",
      "class Same:\n    def first(self): pass\n\nclass Same:\n    def second(self): pass\n",
    ],
    ["same.ts", "class Same {\n  first() {}\n}\nclass Same {\n  second() {}\n}\n"],
  ]) {
    const result = await inspect({ path: path!, source: source!, contentHash: "fixture" });
    assert.deepEqual(result.units.find((unit) => unit.name === "Same.first")?.ownerHeaders, [
      { startLine: 1, endLine: 1 },
    ]);
    assert.deepEqual(result.units.find((unit) => unit.name === "Same.second")?.ownerHeaders, [
      { startLine: 4, endLine: 4 },
    ]);
  }
});

test("fragment extraction keeps source encoding allocation linear in source size", () => {
  const source = "é漢🙂 source line\r\n".repeat(2_000);
  const snapshot = { path: "wide.txt", contentHash: "fixture", source };
  const originalFrom = Buffer.from;
  let encodedBytes = 0;
  // This global Buffer.from probe must remain in a non-concurrent test.
  // Count allocation at the runtime boundary, including splitting and extraction.
  Buffer.from = ((...args: Parameters<typeof Buffer.from>) => {
    if (typeof args[0] === "string") encodedBytes += Buffer.byteLength(args[0]);
    return Reflect.apply(originalFrom, Buffer, args);
  }) as typeof Buffer.from;
  try {
    const pieces = splitSource(snapshot, 1_000).map((unit) => sourceForUnit(snapshot, unit));
    assert.equal(pieces.join(""), source);
    assert.ok(encodedBytes <= Buffer.byteLength(source) * 2, `encoded ${encodedBytes} bytes`);
  } finally {
    Buffer.from = originalFrom;
  }
});

test("cached fragments preserve exact bytes and coordinates across line endings", async () => {
  for (const source of ["", "é漢🙂", "é漢🙂\n", "é漢🙂\r\nlast", "é漢🙂".repeat(8_000)]) {
    const snapshot = { path: "text.txt", contentHash: "fixture", source };
    const first = splitSource(snapshot, 16);
    assert.deepEqual(splitSource(snapshot, 16), first);
    assert.equal(first.map((unit) => sourceForUnit(snapshot, unit)).join(""), source);
    const parsed = await inspect(snapshot, { maxUnitBytes: 16 });
    assert.equal(parsed.units.map((unit) => sourceForUnit(snapshot, unit)).join(""), source);
    if (source) {
      assert.equal(first[0]!.sourceByteStart, 0);
      assert.equal(first.at(-1)!.sourceByteEnd, Buffer.byteLength(source));
      assert.equal(first.at(-1)!.range.endLine, source.split("\n").length);
    }
  }
});

test("snapshot identity reuse never returns bytes from another or mutated source", async () => {
  const snapshot = { path: "same.txt", contentHash: "fixture", source: "old\nsource" };
  const oldUnits = splitSource(snapshot, 4);
  assert.equal(oldUnits.map((unit) => sourceForUnit(snapshot, unit)).join(""), snapshot.source);
  const other = { ...snapshot, source: "é漢🙂\r\nnew" };
  assert.equal(
    splitSource(other, 4)
      .map((unit) => sourceForUnit(other, unit))
      .join(""),
    other.source,
  );
  snapshot.source = "changed\n🙂";
  const changedUnits = (await inspect(snapshot, { maxUnitBytes: 4 })).units;
  assert.equal(changedUnits.map((unit) => sourceForUnit(snapshot, unit)).join(""), snapshot.source);
  assert.equal(
    splitSource(snapshot, 4)
      .map((unit) => sourceForUnit(snapshot, unit))
      .join(""),
    snapshot.source,
  );
  assert.equal(
    splitSource(other, 4)
      .map((unit) => sourceForUnit(other, unit))
      .join(""),
    other.source,
  );
});
