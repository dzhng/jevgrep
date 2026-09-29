import { decodeProviderRequest, wireResponse } from "./helpers/provider";
import { routeProviderFetch } from "./fixtures/provider-route.mjs";
import { expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { testIfDocker } from "./helpers/docker";
import { retrieve } from "../packages/core/src/retrieve";
import { createEvaluator, EvaluationFailure } from "../packages/core/src/evaluator";

type Body = {
  state: {
    items?: Array<{ path: string; kind: string }>;
    relationAnchor?: unknown;
    preview?: unknown;
  };
  questions: Record<string, unknown>;
};
const query = "Find Anchor implementations and related backends";
testIfDocker("shallow lookahead classifies file previews before admitting files", async () => {
  const root = await mkdtemp(join(tmpdir(), "jg-folder-gate-"));
  try {
    for (const name of ["useful", "unrelated"]) {
      await mkdir(join(root, name));
      await writeFile(join(root, name, "handler.ts"), `export function ${name}() { return 1; }\n`);
    }
    const paths: string[] = [];
    const result = await retrieve(
      { root, query: "Find useful behavior", signal: new AbortController().signal },
      {
        requests: 0,
        async evaluate(request) {
          const items = (request.state as Body["state"]).items;
          if (items) paths.push(...items.map((item) => item.path));
          return Object.fromEntries(
            Object.keys(request.questions).map((key, index) => [
              key,
              items ? (items[index]!.path.startsWith("useful") ? 0.9 : 0.1) : 0.9,
            ]),
          );
        },
      },
    );
    expect(result.status).toBe("complete");
    expect(paths).toContain("unrelated/handler.ts");
    expect(result.files.map((file) => file.path)).not.toContain("unrelated/handler.ts");
    expect(result.files.map((file) => file.path)).toContain("useful/handler.ts");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
async function trajectory(
  root: string,
  reverseRelationCompletion = false,
  fault?: "split-once" | "split-exhausted" | "rate-limit",
) {
  const held: Array<{ path: string; response: Response; release: (response: Response) => void }> =
    [];
  const requests: Body[] = [];
  let failedGroup = false;
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = decodeProviderRequest(request, await request.json()) as Body;
      if (body.state.items || body.state.preview) requests.push(body);
      if (body.state.items && fault) {
        if (fault === "rate-limit")
          return Response.json(
            { error: { message: "fixture cooldown" } },
            { status: 429, headers: { "retry-after": "0" } },
          );
        if (
          (!failedGroup && body.state.items.length > 1) ||
          (fault === "split-exhausted" && body.state.items[0]?.path === "other.txt")
        ) {
          failedGroup = true;
          return Response.json(
            { error: { message: "fixture transient failure" } },
            { status: 503 },
          );
        }
      }
      const response = Response.json(
        wireResponse({
          answers: Object.fromEntries(
            Object.keys(body.questions).map((id, i) => {
              const item = body.state.items?.[i];
              const probability =
                item?.kind === "directory" && ["src", "tests"].includes(item.path)
                  ? 0.9
                  : item?.kind === "directory"
                    ? body.state.relationAnchor &&
                      item.path.split("/").some((segment) => segment.startsWith("related")) &&
                      !item.path.includes("-cap") &&
                      !item.path.includes("-escaped")
                      ? 0.9
                      : 0.5
                    : item?.path.startsWith("Anchor.")
                      ? 0.9
                      : 0.25;
              return [id, { type: "boolean", probability }];
            }),
          ),
        }),
      );
      if (
        reverseRelationCompletion &&
        body.state.relationAnchor &&
        body.state.items?.every((item) => item.kind === "directory")
      ) {
        return await new Promise<Response>((release) => {
          held.push({ path: body.state.items![0]!.path, response, release });
          if (held.length === 2) {
            const ordered = [...held].sort((a, b) => b.path.localeCompare(a.path));
            ordered[0]!.release(ordered[0]!.response);
            // Deliberately complete the later branch first, as an asynchronous provider can.
            setTimeout(() => ordered[1]!.release(ordered[1]!.response), 100);
          }
        });
      }
      return response;
    },
  });
  try {
    const signal = new AbortController().signal;
    const result = await retrieve(
      { root, query, signal },
      createEvaluator({
        provider: "vercel",
        apiKey: "fixture",
        fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
        signal,
      }),
    );
    if (fault) expect(result.status).toBe(fault === "split-once" ? "complete" : "incomplete");
    return requests;
  } finally {
    server.stop(true);
  }
}

testIfDocker(
  "hierarchical discovery batches files and revisits related directories",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-discovery-"));
    try {
      await writeFile(
        join(root, "Anchor.py"),
        "class Anchor:\n    def event(self):\n        return True\n",
      );
      // More than a filesystem page: batching must cross page and directory boundaries.
      for (let i = 0; i < 132; i++)
        await writeFile(join(root, `f${String(i).padStart(3, "0")}.txt`), `entry ${i}\n`);
      await writeFile(join(root, "long.txt"), "unicode 🙂 and newline\n".repeat(1600));
      for (const dir of [
        "src/related",
        "src/unrelated",
        "tests/unrelated",
        "src/related/deeper/related",
      ]) {
        await mkdir(join(root, dir), { recursive: true });
        await writeFile(
          join(root, dir, "a.py"),
          'class Other(Anchor):\n    label = "opening"\n' +
            "# middle marker 🙂\n".repeat(1100) +
            "# ending marker\n",
        );
        await writeFile(join(root, dir, "b.txt"), "ordinary content\n");
      }
      const actual = await trajectory(root);
      expect(actual.some((body) => body.state.relationAnchor)).toBe(true);
      const initial = actual.filter((body) => body.state.items && !body.state.relationAnchor);
      expect(initial.length).toBeGreaterThan(1);
      expect(JSON.stringify(initial)).not.toContain("contentSamples");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  120_000,
);

testIfDocker(
  "computed discovery preserves directory entry, metadata and escaped-sample caps",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-preview-caps-"));
    try {
      await writeFile(
        join(root, "Anchor.py"),
        "class Anchor:\n    def event(self):\n        return True\n",
      );
      for (const dir of ["src/related-entry-cap", "src/related-name-cap", "src/related-escaped"]) {
        await mkdir(join(root, dir), { recursive: true });
        for (let i = 0; i < 66; i++) {
          const stem = `f${String(i).padStart(3, "0")}`;
          const name = dir.endsWith("name-cap") ? stem + "x".repeat(110) + ".txt" : stem + ".txt";
          await writeFile(
            join(root, dir, name),
            dir.endsWith("escaped") ? '\"\\'.repeat(1000) : `entry ${i}\n`,
          );
        }
      }
      const actual = await trajectory(root);
      const serialized = JSON.stringify(actual);
      expect(serialized).toContain('"truncated":true');
      expect(serialized).toContain('"contentSamples"');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  120_000,
);

testIfDocker(
  "relationship discovery follows controlled provider completion order",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-completion-order-"));
    try {
      await writeFile(
        join(root, "Anchor.py"),
        "class Anchor:\n    def event(self):\n        return True\n",
      );
      for (const dir of ["src/relatedA", "src/relatedZ"]) {
        await mkdir(join(root, dir), { recursive: true });
        for (let i = 0; i < 30; i++)
          await writeFile(join(root, dir, `f${i}.txt`), '\"'.repeat(2000));
      }
      const actual = await trajectory(root, true);
      const descendant = actual.find((body) =>
        body.state.items?.[0]?.path.startsWith("src/relatedZ/"),
      );
      expect(descendant).toBeDefined();
      const firstDescendant = actual.find(
        (body) => body.state.relationAnchor && body.state.items?.[0]?.kind === "file",
      );
      expect(firstDescendant?.state.items?.[0]?.path.startsWith("src/relatedZ/")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  120_000,
);

for (const fault of ["split-once", "split-exhausted", "rate-limit"] as const) {
  testIfDocker(
    `navigation ${fault} reports the correct completion status`,
    async () => {
      const root = await mkdtemp(join(tmpdir(), "jg-navigation-fault-"));
      try {
        await writeFile(
          join(root, "Anchor.py"),
          "class Anchor:\n    def event(self):\n        return True\n",
        );
        await writeFile(join(root, "other.txt"), "ordinary source\n");
        await trajectory(root, false, fault);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    120_000,
  );
}

testIfDocker(
  "split halves append to the same queue and recovered parents do not mark incomplete",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-split-queue-"));
    try {
      for (const name of ["a", "b", "c", "d", "e"])
        await writeFile(join(root, `${name}.txt`), `${name} source\n`);
      for (const exhaustedLeaf of [false, true]) {
        const groups: string[][] = [];
        let requests = 0;
        const result = await retrieve(
          { root, query, signal: new AbortController().signal },
          {
            get requests() {
              return requests;
            },
            async evaluate(request, options) {
              requests++;
              const items = (request as unknown as Body).state.items;
              if (items) {
                expect(options?.navigation).toBe(true);
                groups.push(items.map((item) => item.path));
                if (items.length > 1) throw new EvaluationFailure("provider", true);
                if (exhaustedLeaf && items[0]!.path === "c.txt")
                  throw new EvaluationFailure("provider");
              }
              return Object.fromEntries(
                Object.keys(request.questions).map((id) => [id, items ? 0.9 : 0.25]),
              );
            },
          },
        );
        expect(groups).toEqual([
          ["a.txt", "b.txt", "c.txt", "d.txt", "e.txt"],
          ["a.txt", "b.txt", "c.txt"],
          ["d.txt", "e.txt"],
          ["a.txt", "b.txt"],
          ["c.txt"],
          ["d.txt"],
          ["e.txt"],
          ["a.txt"],
          ["b.txt"],
        ]);
        expect(result.status).toBe(exhaustedLeaf ? "incomplete" : "complete");
        expect(result.issues).toEqual(exhaustedLeaf ? [{ kind: "provider", count: 1 }] : []);
        expect(result.files.map((file) => file.path)).toEqual(
          exhaustedLeaf
            ? ["a.txt", "b.txt", "d.txt", "e.txt"]
            : ["a.txt", "b.txt", "c.txt", "d.txt", "e.txt"],
        );
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  120_000,
);

testIfDocker(
  "unavailable directory previews are skipped rather than classified as empty metadata",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-preview-unavailable-"));
    const blocked = join(root, "src/blocked");
    try {
      await writeFile(
        join(root, "Anchor.py"),
        "class Anchor:\n    def event(self):\n        return True\n",
      );
      await mkdir(blocked, { recursive: true });
      await writeFile(join(blocked, "implementation.py"), "def event(): return True\n");
      await chmod(blocked, 0);
      const actual = await trajectory(root);
      expect(JSON.stringify(actual)).not.toContain("src/blocked");
    } finally {
      await chmod(blocked, 0o700);
      await rm(root, { recursive: true, force: true });
    }
  },
  120_000,
);

for (const [extension, declaration] of [
  ["c", "int record_telemetry(void) { return 42; }"],
  ["ts", "export function run() { record_telemetry(); }"],
] as const) {
  testIfDocker(
    `${extension} negative preview does not trigger an exhaustive source scan`,
    async () => {
      const root = await mkdtemp(join(tmpdir(), "jg-late-source-"));
      try {
        await writeFile(
          join(root, `engine.${extension}`),
          "/* unrelated initialization details */\n".repeat(700) + `${declaration}\n`,
        );
        const signal = new AbortController().signal;
        const evaluator = createEvaluator({
          apiKey: "fixture",
          provider: "typesafe",
          signal,
          fetch: async (_input, init) => {
            const body = JSON.parse(String(init?.body)) as {
              state: { items?: Array<{ filePreview?: { text: string } }> };
              questions: Record<string, unknown>;
            };
            return Response.json({
              answers: Object.fromEntries(
                Object.keys(body.questions).map((id, i) => [
                  id,
                  {
                    type: "noul",
                    noul: body.state.items
                      ? body.state.items[i]?.filePreview?.text.includes("record_telemetry")
                        ? 0.9
                        : 0.1
                      : 0.9,
                  },
                ]),
              ),
            });
          },
        });
        const result = await retrieve(
          { root, query: "Find telemetry recording", signal },
          evaluator,
        );
        expect(result.status).toBe("complete");
        // The unseen declaration is intentionally not discovered after a negative
        // preview judgment. Completion describes the search, not exhaustive recall.
        expect(result.files.map((file) => file.path)).not.toContain(`engine.${extension}`);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    120_000,
  );
}

testIfDocker(
  "long queries can discover files whose complete preview does not fit",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "jg-long-query-"));
    try {
      await writeFile(
        join(root, "engine.c"),
        "/* padding padding padding */\n".repeat(530) +
          "int record_telemetry(void) { return 42; }\n",
      );
      const signal = new AbortController().signal;
      const evaluator = createEvaluator({
        apiKey: "fixture",
        provider: "typesafe",
        signal,
        fetch: async (_input, init) => {
          const body = JSON.parse(String(init?.body)) as { questions: Record<string, unknown> };
          return Response.json({
            answers: Object.fromEntries(
              Object.keys(body.questions).map((id) => [id, { type: "noul", noul: 0.9 }]),
            ),
          });
        },
      });
      const result = await retrieve(
        { root, query: "context ".repeat(2800) + "Find telemetry recording", signal },
        evaluator,
      );
      expect(result.status).toBe("complete");
      expect(
        result.files
          .find((file) => file.path === "engine.c")
          ?.excerpts.some((excerpt) => excerpt.source.includes("int record_telemetry(void)")),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  120_000,
);
