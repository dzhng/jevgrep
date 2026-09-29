import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ChildProcess } from "node:child_process";
const [language = "python", countText = "100"] = process.argv.slice(2),
  count = Number(countText);
if (!["python", "typescript"].includes(language) || !Number.isSafeInteger(count) || count < 1)
  throw new Error("Use python or typescript and a positive declaration count");
let child;
const emit = ChildProcess.prototype.emit;
ChildProcess.prototype.emit = function (event, ...args) {
  if (event === "spawn") child = this;
  return emit.call(this, event, ...args);
};
const source = Array.from({ length: count }, (_, i) =>
  language === "python"
    ? `def target_${i}(value):\n    # original 🙂 bytes\n    return value + ${i}\n`
    : `export function target_${i}(value: number) {\n // original 🙂 bytes\n return value + ${i};\n}\n`,
).join("\n");
const snapshot = {
  source,
  path: language === "python" ? "fixture.py" : "fixture.ts",
  contentHash: "fixture",
};
const start = performance.now();
const { inspect } = await import("../../packages/core/src/source.ts");
const before = performance.now();
const result = await inspect(snapshot);
const after = performance.now();
const warm = [];
for (let i = 0; i < 10; i++) {
  const t = performance.now();
  await inspect({ ...snapshot });
  warm.push(performance.now() - t);
}
const digest = createHash("sha256").update(JSON.stringify(result)).digest("hex");
let workerRSSKiB = null;
if (child?.pid) {
  const status = await readFile(`/proc/${child.pid}/status`, "utf8");
  workerRSSKiB = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1]);
}
console.log(
  JSON.stringify({
    language,
    count,
    sourceBytes: Buffer.byteLength(source),
    importMs: before - start,
    firstInspectMs: after - before,
    coldTotalMs: after - start,
    warmMs: warm,
    outputHash: digest,
    parentMaxRSSKiB: process.resourceUsage().maxRSS,
    workerRSSKiB,
  }),
);
