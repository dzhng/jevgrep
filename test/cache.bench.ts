// Run: bash scripts/test-docker.sh bun test/cache.bench.ts
// Compare identical fixtures across revisions; this excludes provider latency.
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEvaluationCache } from "../packages/core/src/cache";

if (process.env.JEVGREP_TEST_IN_DOCKER !== "1") throw new Error("Run inside the test container");
for (const count of [1000, 10000]) {
  const directory = await mkdtemp(join(tmpdir(), "cache-perf-"));
  try {
    await mkdir(join(directory, "entries"));
    const payload = JSON.stringify({ schema: 1, createdAt: Date.now(), answers: { q: 0.5 } });
    for (let i = 0; i < count; i++)
      await writeFile(
        join(directory, "entries", `${i.toString(16).padStart(64, "0")}.json`),
        payload,
      );
    const cache = createEvaluationCache({ directory });
    const times: number[] = [];
    for (let i = 0; i < 21; i++) {
      const start = performance.now();
      await cache.put(
        {
          namespace: { model: "fixture", provider: "fixture", policyVersion: "1" },
          request: { i },
        },
        { q: 0.5 },
      );
      times.push(performance.now() - start);
    }
    if (cache.stats().issues.length) throw new Error("Benchmark cache writes failed");
    const rest = times.slice(1).sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        entries: count,
        firstMs: times[0],
        next20MedianMs: rest[10],
        totalMs: times.reduce((a, b) => a + b),
      }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
