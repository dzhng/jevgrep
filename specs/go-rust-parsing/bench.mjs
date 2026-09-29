import { ChildProcess, execFileSync } from "node:child_process";
const [module, language, countText] = process.argv.slice(2),
  count = Number(countText);
if (!module || !["go", "rust"].includes(language) || !Number.isSafeInteger(count) || count < 1)
  throw new Error("Use a source module path, go or rust, and a positive function count");
let child;
const emit = ChildProcess.prototype.emit;
ChildProcess.prototype.emit = function (event, ...args) {
  if (event === "spawn") child = this;
  return emit.call(this, event, ...args);
};
const source =
  (language === "go" ? "package sample\n" : "") +
  Array.from({ length: count }, (_, i) =>
    language === "go"
      ? `func target_${i}() string { return "marker_${i}_🙂" }\n`
      : `fn target_${i}() -> &'static str { "marker_${i}_🙂" }\n`,
  ).join("");
const snapshot = { source, path: language === "go" ? "x.go" : "x.rs", contentHash: "fixture" };
const t = performance.now();
const { inspect, sourceForUnit } = await import(module);
const result = await inspect(snapshot);
const cold = performance.now() - t;
const warm = [];
for (let i = 0; i < 10; i++) {
  const start = performance.now();
  await inspect({ ...snapshot });
  warm.push(performance.now() - start);
}
const marker = `"marker_${Math.floor(count / 2)}_🙂"`;
const unit = result.units.find((u) => sourceForUnit(snapshot, u).includes(marker));
if (!unit) throw Error("Target source missing");
console.log(
  JSON.stringify({
    language,
    count,
    cold_ms: cold,
    warm_ms: warm,
    units: result.units.length,
    target_unit_bytes: Buffer.byteLength(sourceForUnit(snapshot, unit)),
    worker_rss_kib: child
      ? Number(
          execFileSync("ps", ["-o", "rss=", "-p", String(child.pid)], { encoding: "utf8" }).trim(),
        )
      : null,
  }),
);
