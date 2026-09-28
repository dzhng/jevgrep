import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { retrieve } from "../packages/core/src/retrieve";

// Offline workload: all-negative answers isolate discovery from selection/model quality.
const root = await mkdtemp(join(tmpdir(), "jg-discovery-bench-"));
const requests: string[] = [];
let firstRequestMs: number | undefined;
try {
  for (let i = 0; i < 160; i++)
    await writeFile(
      join(root, `${String(i).padStart(3, "0")}.txt`),
      `source ${i} é漢🙂\n`.repeat(i % 3 === 0 ? 1500 : 30),
    );
  const start = performance.now();
  const result = await retrieve(
    { root, query: "absent behavior", signal: new AbortController().signal },
    {
      get requests() {
        return requests.length;
      },
      async evaluate(request, policy) {
        await policy?.beforeAttempt?.();
        firstRequestMs ??= performance.now() - start;
        requests.push(JSON.stringify(request));
        return Object.fromEntries(Object.keys(request.questions).map((id) => [id, 0.1]));
      },
    },
  );
  if (result.status !== "complete" || result.files.length)
    throw new Error("Unexpected discovery result");
  console.log(
    JSON.stringify({
      files: 160,
      requests: requests.length,
      requestSha256: createHash("sha256").update(JSON.stringify(requests)).digest("hex"),
      firstRequestMs,
      elapsedMs: performance.now() - start,
      maxRssKiB: process.resourceUsage().maxRSS,
    }),
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
