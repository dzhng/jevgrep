import { test } from "node:test";
import assert from "node:assert/strict";
import { inspect, sourceForUnit } from "../../packages/core/src/source.ts";

test("Go selects named methods and preserves declaration groups and Unicode bytes", async () => {
  const source =
    "package sample\r\nconst (\r\n First = iota\r\n Second\r\n)\r\ntype Box[T any] struct { value T }\r\nfunc (b *Box[T]) Read() T {\r\n // 🙂\r\n return b.value\r\n}\r\n";
  const snapshot = { path: "sample.go", source, contentHash: "fixture" };
  const result = await inspect(snapshot);
  assert.equal(result.mode, "go");
  const method = result.units.find((unit) => unit.name === "Box[T].Read");
  assert.ok(method);
  assert.equal(sourceForUnit(snapshot, method), source.split("\r\n").slice(6).join("\r\n"));
  const group = result.units.find((unit) => unit.name === "First, Second");
  assert.ok(group);
  assert.equal(sourceForUnit(snapshot, group), "const (\r\n First = iota\r\n Second\r\n)\r\n");
});

test("Rust methods retain module, impl, attribute and original source context", async () => {
  const source =
    '#![allow(dead_code)]\r\n#[cfg(feature = "demo")]\r\nmod inner {\r\n #![allow(unused)]\r\n struct Box;\r\n #[cfg(feature = "demo")]\r\n impl Box {\r\n  /// Reads the value.\r\n  #[inline]\r\n  pub fn read(&self) -> &str { "🙂" }\r\n }\r\n}\r\n';
  const snapshot = { path: "sample.rs", source, contentHash: "fixture" };
  const result = await inspect(snapshot);
  assert.equal(result.mode, "rust");
  const method = result.units.find((unit) => unit.name === "inner.Box.read");
  assert.ok(method);
  assert.deepEqual(method.ownerHeaders, [
    { startLine: 1, endLine: 1 },
    { startLine: 2, endLine: 3 },
    { startLine: 4, endLine: 4 },
    { startLine: 6, endLine: 7 },
  ]);
  assert.equal(
    sourceForUnit(snapshot, method),
    '  /// Reads the value.\r\n  #[inline]\r\n  pub fn read(&self) -> &str { "🙂" }\r\n',
  );
});

test("Rust comments between attributes and declarations retain the attributes", async () => {
  const source =
    '#[cfg(feature = "demo")]\n// builds only with demo\nmod inner {\n #[inline]\n // useful method\n pub fn read() {}\n}\n';
  const snapshot = { path: "sample.rs", source, contentHash: "fixture" };
  const result = await inspect(snapshot);
  const method = result.units.find((unit) => unit.name === "inner.read");
  assert.ok(method);
  assert.deepEqual(method.ownerHeaders, [{ startLine: 1, endLine: 3 }]);
  assert.equal(
    sourceForUnit(snapshot, method),
    " #[inline]\n // useful method\n pub fn read() {}\n",
  );
});

test("Rust attributes do not attach the previous declaration's trailing comment", async () => {
  const source =
    "fn earlier() {} // about earlier\n#[inline]\n// about target\npub fn target() {}\n";
  const snapshot = { path: "sample.rs", source, contentHash: "fixture" };
  const result = await inspect(snapshot);
  const target = result.units.find((unit) => unit.name === "target");
  assert.ok(target);
  assert.equal(sourceForUnit(snapshot, target), "#[inline]\n// about target\npub fn target() {}\n");
});

test("declaration labels cover grouped Go names and Rust traits, foreign items and macros", async () => {
  for (const [path, source, names] of [
    [
      "sample.go",
      "package x\nconst Alpha, Beta = 1, 2\ntype (\n Alias = string\n Value struct{}\n)\nvar First, Second int\nvar (\n Third int\n Fourth = 1\n)\nfunc K() {}\nfunc K() {}\n",
      ["Alpha, Beta", "Alias, Value", "First, Second", "Third, Fourth", "K", "K"],
    ],
    [
      "sample.rs",
      'mod inner {\n pub trait View {\n fn show(&self);\n }\n}\nextern "C" {\n fn foreign();\n static VALUE: u8;\n}\nmacro_rules! make { () => {} }\nfn K() {}\nfn K() {}\n',
      ["inner.View.show", "foreign", "VALUE", "make", "K", "K"],
    ],
  ] as const) {
    const result = await inspect({ path, source, contentHash: "fixture" });
    for (const name of names)
      assert.ok(
        result.units.some((unit) => unit.name === name),
        name,
      );
  }
});

test("Go/Rust syntax and size fallbacks preserve every Unicode source byte", async () => {
  for (const [path, source, options, reason] of [
    ["bad.go", "package x\nfunc broken( { 🙂\n", { maxUnitBytes: 8 }, "syntax"],
    ["bad.rs", "fn broken( { 🙂\n", { maxUnitBytes: 8 }, "syntax"],
    [
      "big.go",
      'package x\nfunc target() string { return "🙂" }\r\n',
      { maxParseBytes: 1, maxUnitBytes: 8 },
      "size",
    ],
    ["big.rs", 'fn target() -> &str { "🙂" }\r\n', { maxParseBytes: 1, maxUnitBytes: 8 }, "size"],
  ] as const) {
    const snapshot = { path, source, contentHash: "fixture" };
    const result = await inspect(snapshot, options);
    assert.equal(result.fallback, reason);
    assert.equal(result.units.map((unit) => sourceForUnit(snapshot, unit)).join(""), source);
    assert.ok(result.units.every((unit) => Buffer.byteLength(sourceForUnit(snapshot, unit)) <= 8));
  }
});
