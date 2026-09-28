import assert from "node:assert/strict";
import { selectFile } from "../packages/core/src/selection";

// Compare the same fixture across revisions. This measures scheduling under
// fixed request latency, not provider performance or whole-search throughput.
const snapshot = {
  path: "bench.ts",
  contentHash: "bench",
  source: Array.from({ length: 80 }, (_, i) => `function f${i}() { return ${i}; }\n`).join(""),
};
for (let trial = 1; trial <= 4; trial++) {
  let calls = 0;
  const start = performance.now();
  const result = await selectFile(snapshot, "q", 0.9, {
    requests: 0,
    async evaluate(request) {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return Object.fromEntries(Object.keys(request.questions).map((key) => [key, 0.9]));
    },
  });
  const elapsedMs = performance.now() - start;
  assert.equal(calls, 10);
  assert.deepEqual(result.file.selected, [{ startLine: 1, endLine: 80 }]);
  assert.deepEqual(result.issues, []);
  console.log(JSON.stringify({ trial, declarations: 80, requestDelayMs: 25, elapsedMs, calls }));
}
