import { routeProviderFetch } from "./fixtures/provider-route.mjs";
import { expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { testIfDocker } from "./helpers/docker";
import { retrieve } from "../packages/core/src/retrieve";
import { createEvaluator } from "../packages/core/src/evaluator";
import { createEvaluationCache } from "../packages/core/src/cache";

testIfDocker(
  "queued navigation never uploads source excluded after the first wave",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-queued-freshness-"));
    const releases: Array<() => void> = [];
    let uploads = 0;
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const body = (await request.json()) as any;
        if (JSON.stringify(body).includes("QUEUED_SENTINEL")) {
          uploads++;
          if (uploads <= 8)
            await new Promise<void>((resolve) => {
              releases.push(resolve);
              if (releases.length === 8)
                void writeFile(join(root, ".ignore"), "large-*.txt\n").then(() =>
                  releases.forEach((release) => release()),
                );
            });
        }
        return Response.json({
          answers: Object.fromEntries(
            Object.keys(body.questions).map((id) => [id, { type: "noul", noul: 0.1 }]),
          ),
        });
      },
    });
    try {
      for (let i = 0; i < 48; i++)
        await writeFile(join(root, `large-${i}.txt`), "QUEUED_SENTINEL line\n".repeat(800));
      const signal = new AbortController().signal;
      const result = await retrieve(
        { root, query: "sentinel", signal },
        createEvaluator({
          apiKey: "fixture",
          concurrency: 8,
          provider: "vercel",
          fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
          signal,
        }),
      );
      expect(uploads).toBe(8);
      expect(result.status).toBe("incomplete");
    } finally {
      releases.forEach((release) => release());
      server.stop(true);
      await rm(root, { recursive: true, force: true });
    }
  },
  120_000,
);

for (const mutation of ["ignored", "changed"] as const)
  testIfDocker(
    `final excerpts are invalidated when ${mutation} during role evaluation`,
    async () => {
      const root = await mkdtemp(join(tmpdir(), "jg-final-freshness-"));
      let role = false;
      const server = Bun.serve({
        port: 0,
        async fetch(request) {
          const body = (await request.json()) as any;
          if (body.questions.implementation) {
            role = true;
            await writeFile(
              join(root, mutation === "ignored" ? ".ignore" : "a.ts"),
              mutation === "ignored" ? "a.ts\n" : "export function replaced() { return 2; }\n",
            );
          }
          return Response.json({
            answers: Object.fromEntries(
              Object.keys(body.questions).map((id) => [id, { type: "noul", noul: 0.9 }]),
            ),
          });
        },
      });
      try {
        await writeFile(
          join(root, "a.ts"),
          'export function selected() { return "STALE_SENTINEL"; }\n',
        );
        const signal = new AbortController().signal;
        const result = await retrieve(
          { root, query: "selected", signal },
          createEvaluator({
            apiKey: "fixture",
            provider: "vercel",
            fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
            signal,
          }),
        );
        expect(role).toBe(true);
        expect(result.status).toBe("incomplete");
        expect(result.files[0]?.excerpts).toEqual([]);
        expect(result.files[0]?.sourceOmitted).toBe(true);
      } finally {
        server.stop(true);
        await rm(root, { recursive: true, force: true });
      }
    },
    120_000,
  );

testIfDocker(
  "navigation HTTP retry revalidates its buffered source",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-retry-freshness-"));
    let uploads = 0;
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const body = (await request.json()) as any;
        if (JSON.stringify(body).includes("RETRY_SENTINEL")) {
          uploads++;
          await writeFile(join(root, ".ignore"), "a.txt\n");
          return Response.json({ error: "temporary unavailable" }, { status: 503 });
        }
        throw new Error("Unexpected request");
      },
    });
    try {
      await writeFile(join(root, "a.txt"), "RETRY_SENTINEL\n");
      const signal = new AbortController().signal;
      const result = await retrieve(
        { root, query: "retry", signal },
        createEvaluator({
          apiKey: "fixture",
          provider: "vercel",
          fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
          signal,
        }),
      );
      expect(uploads).toBe(1);
      expect(result.status).toBe("incomplete");
    } finally {
      server.stop(true);
      await rm(root, { recursive: true, force: true });
    }
  },
  120_000,
);

for (const phase of ["selection", "role"] as const)
  testIfDocker(
    `${phase} HTTP retries withhold newly excluded source`,
    async () => {
      const root = await mkdtemp(join(tmpdir(), "jg-phase-retry-"));
      let uploads = 0;
      const server = Bun.serve({
        port: 0,
        async fetch(request) {
          const body = (await request.json()) as any;
          const targeted =
            phase === "role" ? !!body.questions.implementation : !!body.state.declarations;
          if (targeted) {
            uploads++;
            await writeFile(join(root, ".ignore"), "a.ts\n");
            return Response.json({ error: "temporary unavailable" }, { status: 503 });
          }
          return Response.json({
            answers: Object.fromEntries(
              Object.keys(body.questions).map((id) => [id, { type: "noul", noul: 0.9 }]),
            ),
          });
        },
      });
      try {
        await writeFile(
          join(root, "a.ts"),
          'export function selected() { return "PHASE_SENTINEL"; }\n',
        );
        const signal = new AbortController().signal;
        const result = await retrieve(
          { root, query: "selected", signal },
          createEvaluator({
            apiKey: "fixture",
            provider: "vercel",
            fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
            signal,
          }),
        );
        expect(uploads).toBe(1);
        expect(result.status).toBe("incomplete");
        expect(result.files[0]?.excerpts).toEqual([]);
      } finally {
        server.stop(true);
        await rm(root, { recursive: true, force: true });
      }
    },
    120_000,
  );

for (const size of [2, 4])
  testIfDocker(
    `split navigation retries retain healthy donors from ${size} items`,
    async () => {
      const root = await mkdtemp(join(tmpdir(), "jg-split-freshness-"));
      const uploads: string[][] = [];
      const server = Bun.serve({
        port: 0,
        async fetch(request) {
          const body = (await request.json()) as any;
          uploads.push(body.state.items.map((item: any) => item.path));
          if (uploads.length === 1) {
            await writeFile(join(root, ".ignore"), "a.txt\n");
            return Response.json({ error: "temporary unavailable" }, { status: 503 });
          }
          return Response.json({
            answers: Object.fromEntries(
              Object.keys(body.questions).map((id) => [id, { type: "noul", noul: 0.1 }]),
            ),
          });
        },
      });
      try {
        await writeFile(join(root, "a.txt"), "EXCLUDED_SPLIT_SENTINEL\n");
        for (const name of ["b.txt", "c.txt", "d.txt"].slice(0, size - 1))
          await writeFile(join(root, name), "healthy source\n");
        const signal = new AbortController().signal;
        const result = await retrieve(
          { root, query: "selected", signal },
          createEvaluator({
            apiKey: "fixture",
            provider: "vercel",
            fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
            signal,
          }),
        );
        expect(uploads).toEqual(
          size === 2
            ? [["a.txt", "b.txt"], ["b.txt"]]
            : [["a.txt", "b.txt", "c.txt", "d.txt"], ["c.txt", "d.txt"], ["b.txt"]],
        );
        expect(result.status).toBe("incomplete");
      } finally {
        server.stop(true);
        await rm(root, { recursive: true, force: true });
      }
    },
    120_000,
  );

for (const donor of ["sample", "anchor"] as const)
  testIfDocker(
    `relationship retry revalidates its ${donor} donor`,
    async () => {
      const root = await mkdtemp(join(tmpdir(), "jg-relation-freshness-"));
      let relationships = 0;
      const server = Bun.serve({
        port: 0,
        async fetch(request) {
          const body = (await request.json()) as any;
          if (body.state.relationAnchor) {
            relationships++;
            expect(JSON.stringify(body)).toContain("RELATION_SENTINEL");
            await writeFile(
              join(root, ".ignore"),
              donor === "sample" ? "deep/nested/sample.ts\n" : "anchor.ts\n",
            );
            return Response.json({ error: "temporary unavailable" }, { status: 503 });
          }
          return Response.json({
            answers: Object.fromEntries(
              Object.keys(body.questions).map((id, index) => [
                id,
                {
                  type: "noul",
                  noul:
                    body.state.items?.[index]?.kind === "file" ||
                    body.state.items?.[index]?.path === "deep"
                      ? 0.9
                      : 0.1,
                },
              ]),
            ),
          });
        },
      });
      try {
        await mkdir(join(root, "deep/nested"), { recursive: true });
        await writeFile(
          join(root, "anchor.ts"),
          "export class Anchor {\n method() { return 1; }\n}\n",
        );
        await writeFile(
          join(root, "deep/nested/sample.ts"),
          'export class Child extends Anchor { method() { return "RELATION_SENTINEL"; } }\n',
        );
        const signal = new AbortController().signal;
        const result = await retrieve(
          { root, query: "selected", signal },
          createEvaluator({
            apiKey: "fixture",
            provider: "vercel",
            fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
            signal,
          }),
        );
        expect(relationships).toBe(1);
        expect(result.status).toBe("incomplete");
      } finally {
        server.stop(true);
        await rm(root, { recursive: true, force: true });
      }
    },
    120_000,
  );

testIfDocker(
  "additional-selection HTTP retry revalidates cross-file evidence donors",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-evidence-retry-"));
    let attempts = 0;
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const body = (await request.json()) as any;
        if (
          body.state.path === "b.ts" &&
          body.state.selectedEvidence?.some((entry: any) => entry.path === "a.ts")
        ) {
          attempts++;
          await writeFile(join(root, ".ignore"), "a.ts\n");
          return Response.json({ error: "temporary unavailable" }, { status: 503 });
        }
        return Response.json({
          answers: Object.fromEntries(
            Object.keys(body.questions).map((id) => [
              id,
              { type: "noul", noul: /^q\d+$/.test(id) ? 0.8 : 0.9 },
            ]),
          ),
        });
      },
    });
    try {
      await writeFile(join(root, "a.ts"), 'export function first() { return "DONOR_SENTINEL"; }\n');
      await writeFile(join(root, "b.ts"), "export function second() { return first(); }\n");
      const signal = new AbortController().signal;
      const result = await retrieve(
        { root, query: "selected", signal },
        createEvaluator({
          apiKey: "fixture",
          provider: "vercel",
          fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
          signal,
        }),
      );
      expect(attempts).toBe(1);
      expect(result.status).toBe("incomplete");
      expect(result.files.find((file) => file.path === "a.ts")?.excerpts).toEqual([]);
      expect(result.files.find((file) => file.path === "b.ts")?.excerpts.length).toBeGreaterThan(0);
    } finally {
      server.stop(true);
      await rm(root, { recursive: true, force: true });
    }
  },
  120_000,
);

testIfDocker("cached navigation revalidates source after cache lookup", async () => {
  const root = await mkdtemp(join(tmpdir(), "jg-cache-freshness-"));
  const directory = await mkdtemp(join(tmpdir(), "jg-cache-answers-"));
  const cache = createEvaluationCache({ directory });
  const signal = new AbortController().signal;
  let calls = 0;
  const requestFetch: typeof fetch = async (_input, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    return Response.json({
      answers: Object.fromEntries(
        Object.keys(body.questions).map((id) => [id, { type: "noul", noul: 0.9 }]),
      ),
    });
  };
  try {
    await writeFile(join(root, "sample.txt"), "CACHE_FRESHNESS_SENTINEL");
    const initial = await retrieve(
      { root, query: "sentinel", signal },
      createEvaluator({
        provider: "vercel",
        apiKey: "fixture",
        signal,
        cache,
        fetch: requestFetch,
      }),
    );
    expect(initial.files.some((file) => file.path === "sample.txt")).toBe(true);
    const before = calls;
    let changed = false;
    const result = await retrieve(
      { root, query: "sentinel", signal },
      createEvaluator({
        provider: "vercel",
        apiKey: "fixture",
        signal,
        fetch: requestFetch,
        cache: {
          ...cache,
          get: async (input) => {
            const answer = await cache.get(input);
            if (answer && !changed) {
              await writeFile(join(root, ".ignore"), "sample.txt\n");
              changed = true;
            }
            return answer;
          },
        },
      }),
    );
    expect(changed).toBe(true);
    expect(result.files).toEqual([]);
    expect(calls).toBe(before);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(directory, { recursive: true, force: true });
  }
});
