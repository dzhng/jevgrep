import { splitSource, sourceForUnit } from "../../packages/core/src/source.ts";
import assert from "node:assert/strict";
for (const size of [100_000, 1_000_000]) {
  const source = "é漢🙂 some source line\r\n".repeat(Math.ceil(size / 29));
  const times = [];
  let pieces;
  for (let i = 0; i < 12; i++) {
    const snapshot = { path: "source.txt", contentHash: "fixture", source };
    const start = performance.now();
    pieces = splitSource(snapshot, 12_000).map((unit) => sourceForUnit(snapshot, unit));
    const elapsed = performance.now() - start;
    assert.equal(pieces.join(""), source);
    if (i >= 3) times.push(elapsed);
  }
  times.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      bytes: Buffer.byteLength(source),
      fragments: pieces.length,
      medianMs: times[4],
      minMs: times[0],
      maxMs: times.at(-1),
    }),
  );
}
