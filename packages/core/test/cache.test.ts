import { testIfDocker as test } from "../../../test/helpers/docker";
import { afterEach, expect, spyOn } from "bun:test";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
  chmod,
  mkdir,
  symlink,
  utimes,
} from "node:fs/promises";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEvaluationCache, type CacheInput } from "../src/cache";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function directory() {
  const root = await mkdtemp(join(tmpdir(), "jevgrep-cache-"));
  roots.push(root);
  return join(root, "cache");
}
const input = {
  namespace: {
    model: "jev",
    provider: "gateway",
    policyVersion: "policy1",
    promptVersion: "prompt1",
  },
  request: {
    state: {
      source: "SOURCE_SENTINEL private code",
      credential: "API_KEY_SENTINEL",
      path: "source.ts",
    },
    questions: ["question1", "question2"],
  },
} satisfies CacheInput;

test("exact requests reuse numeric answers without persisting source or credentials", async () => {
  const dir = await directory();
  const cache = createEvaluationCache({ directory: dir });
  expect(await cache.get(input)).toBeUndefined();
  await cache.put(input, { question1: 0.75, question2: 0 });
  expect(await cache.get(input)).toEqual({ question1: 0.75, question2: 0 });
  const names = await readdir(join(dir, "entries"));
  expect(names.every((name) => /^[a-f0-9]{64}\.json$/.test(name))).toBe(true);
  const saved = await readFile(join(dir, "entries", names[0]!), "utf8");
  expect(saved).not.toContain("SOURCE_SENTINEL");
  expect(saved).not.toContain("source.ts");
  expect(saved).not.toContain("API_KEY_SENTINEL");
  expect((await stat(join(dir, "entries", names[0]!))).mode & 0o777).toBe(0o600);
  expect((await stat(dir)).mode & 0o777).toBe(0o700);
  expect(cache.stats()).toEqual({ hits: 1, misses: 1, issues: [] });
});

test("source, path, query, ordered questions and namespace changes cannot reuse another request", async () => {
  const cache = createEvaluationCache({ directory: await directory() });
  await cache.put(input, { question1: 0.8 });
  const variants: CacheInput[] = [
    {
      ...input,
      request: {
        ...input.request,
        state: { ...input.request.state, source: "different same-size source" },
      },
    },
    {
      ...input,
      request: { ...input.request, state: { ...input.request.state, path: "other.ts" } },
    },
    { ...input, request: { ...input.request, questions: ["question2", "question1"] } },
    { ...input, request: { ...input.request, query: "different question" } },
    ...["model", "provider", "endpoint", "protocol", "policyVersion", "promptVersion"].map(
      (name) => ({
        ...input,
        namespace: { ...input.namespace, [name]: "changed" },
      }),
    ),
  ];
  for (const variant of variants) expect(await cache.get(variant)).toBeUndefined();
  expect(await cache.get(input)).toEqual({ question1: 0.8 });
});

test("TTL expiry and disabled caching are misses without filesystem side effects", async () => {
  let clock = 1000;
  const dir = await directory();
  const cache = createEvaluationCache({ directory: dir, ttlMs: 100, now: () => clock });
  await cache.put(input, { question1: 0.5 });
  clock = 1099;
  expect(await cache.get(input)).toEqual({ question1: 0.5 });
  clock = 1100;
  expect(await cache.get(input)).toBeUndefined();
  expect(cache.stats().issues).toEqual([]);
  const disabledDir = await directory();
  const disabled = createEvaluationCache({ directory: disabledDir, enabled: false });
  await disabled.put(input, { question1: 0.9 });
  expect(await disabled.get(input)).toBeUndefined();
  expect(await stat(disabledDir).catch(() => undefined)).toBeUndefined();
  const bypass = createEvaluationCache({
    directory: dir,
    enabled: false,
    ttlMs: 100,
    now: () => 1050,
  });
  expect(await bypass.get(input)).toBeUndefined();
  await bypass.clear();
  await bypass.clear();
  expect(await readdir(dir)).toEqual([]);
});

test("corrupt, incompatible and unreadable entries degrade to counted misses", async () => {
  const dir = await directory();
  const cache = createEvaluationCache({ directory: dir });
  await cache.put(input, { question1: 0.8 });
  const file = join(dir, "entries", (await readdir(join(dir, "entries")))[0]!);
  for (const contents of [
    "{broken",
    JSON.stringify({ schema: 1, createdAt: Date.now(), answers: { question1: "not numeric" } }),
    JSON.stringify({ schema: 100, createdAt: Date.now(), answers: { question1: 1 } }),
  ]) {
    await writeFile(file, contents);
    expect(await cache.get(input)).toBeUndefined();
  }
  await cache.put(input, { question1: 0.2 });
  await chmod(file, 0);
  try {
    expect(await cache.get(input)).toBeUndefined();
  } finally {
    await chmod(file, 0o600);
  }
  expect(cache.stats().issues).toEqual([
    { kind: "cache_corrupt", count: 3 },
    { kind: "cache_unavailable", count: 1 },
  ]);
  expect(await cache.get(input)).toEqual({ question1: 0.2 });
});

test("concurrent writers publish complete answers and clear permits later fresh writes", async () => {
  const dir = await directory();
  const caches = [
    createEvaluationCache({ directory: dir }),
    createEvaluationCache({ directory: dir }),
  ];
  await Promise.all(
    caches.map((cache, index) => cache.put(input, { question1: index, question2: 1 - index })),
  );
  const value = await caches[0]!.get(input);
  expect([
    { question1: 0, question2: 1 },
    { question1: 1, question2: 0 },
  ]).toContainEqual(value);
  await Promise.all([
    caches[0]!.clear(),
    caches[1]!.put(input, { question1: 0.5 }),
    caches[0]!.get(input),
  ]);
  await caches[1]!.put(input, { question1: 0.25 });
  expect(await caches[0]!.get(input)).toEqual({ question1: 0.25 });
  await caches[0]!.clear();
  await caches[0]!.clear();
  expect(await caches[1]!.get(input)).toBeUndefined();
});

test("byte bounds retain valid entries and oversized answers bypass persistence visibly", async () => {
  const dir = await directory();
  const cache = createEvaluationCache({ directory: dir, maxBytes: 180 });
  for (let index = 0; index < 8; index++)
    await cache.put({ ...input, request: { index } }, { question1: index / 8 });
  const names = await readdir(join(dir, "entries"));
  let bytes = 0;
  for (const name of names) {
    const file = join(dir, "entries", name);
    bytes += (await stat(file)).size;
    expect(JSON.parse(await readFile(file, "utf8")).answers.question1).toBeGreaterThanOrEqual(0);
  }
  expect(bytes).toBeLessThanOrEqual(180);
  expect(bytes).toBeGreaterThan(0);
  await cache.put(input, { ["large".repeat(100)]: 1 });
  expect(await cache.get(input)).toBeUndefined();
  expect(cache.stats().issues).toEqual([{ kind: "cache_limit", count: 1 }]);
});

test("clear removes an abandoned detached generation even when no active entries remain", async () => {
  const dir = await directory();
  const detached = join(dir, ".cleared-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  await mkdir(detached, { recursive: true });
  await writeFile(join(detached, "old.json"), "old answer");
  const cache = createEvaluationCache({ directory: dir });
  await cache.clear();
  expect(await readdir(dir)).toEqual([]);
});

test("unavailable or symlinked cache locations never throw or modify the target", async () => {
  const target = await directory();
  await mkdir(target, { recursive: true });
  await writeFile(join(target, "sentinel"), "DO_NOT_TOUCH");
  const alias = await directory();
  await symlink(target, alias);
  const cache = createEvaluationCache({ directory: alias });
  expect(await cache.get(input)).toBeUndefined();
  await cache.put(input, { question1: 1 });
  await cache.clear();
  expect(await readFile(join(target, "sentinel"), "utf8")).toBe("DO_NOT_TOUCH");
  expect(await readdir(target)).toEqual(["sentinel"]);
  expect(cache.stats().issues).toEqual([{ kind: "cache_unavailable", count: 3 }]);
});

test("writes below the byte budget amortize entry censuses", async () => {
  const dir = await directory();
  const cache = createEvaluationCache({ directory: dir });
  await cache.put(input, { question1: 0.5 });
  const probe = spyOn(fs, "lstat");
  try {
    for (let index = 0; index < 20; index++)
      await cache.put({ ...input, request: { index } }, { question1: index / 20 });
    const entryStats = probe.mock.calls.filter(([path]) => String(path).endsWith(".json"));
    expect(entryStats.length).toBe(0);
    expect(await cache.get({ ...input, request: { index: 19 } })).toEqual({ question1: 0.95 });
  } finally {
    probe.mockRestore();
  }
});

test("external publishers and replaced generations are reconciled before further writes", async () => {
  const dir = await directory();
  const cache = createEvaluationCache({ directory: dir, maxBytes: 180 });
  await cache.put(input, { question1: 0.5 });
  const external = createEvaluationCache({ directory: dir });
  for (let index = 0; index < 4; index++)
    await external.put({ ...input, request: { index } }, { question1: 0.25 });
  await cache.put(input, { question1: 0.75 });
  const sizes = await Promise.all(
    (await readdir(join(dir, "entries"))).map(
      async (name) => (await stat(join(dir, "entries", name))).size,
    ),
  );
  expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThanOrEqual(180);
  await external.clear();
  await cache.put(input, { question1: 1 });
  expect(await cache.get(input)).toEqual({ question1: 1 });
});

test("periodic maintenance catches in-place growth and removes abandoned publications", async () => {
  const dir = await directory();
  const pending = join(dir, "entries", ".pending-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  await mkdir(join(dir, "entries"), { recursive: true });
  await writeFile(pending, "unfinished");
  let clock = Date.now();
  const cache = createEvaluationCache({ directory: dir, maxBytes: 180, now: () => clock });
  await cache.put(input, { question1: 0.5 });
  expect(await readFile(pending, "utf8")).toBe("unfinished");
  const name = (await readdir(join(dir, "entries"))).find((name) => name.endsWith(".json"))!;
  // Neither of these in-place changes alters the entries directory metadata.
  await writeFile(join(dir, "entries", name), "x".repeat(400));
  await utimes(pending, new Date(0), new Date(0));
  clock += 60_001;
  await cache.put({ ...input, request: { next: true } }, { question1: 0.75 });
  const names = await readdir(join(dir, "entries"));
  expect(names).not.toContain(name);
  expect(names).not.toContain(pending.split("/").at(-1)!);
  expect(await cache.get({ ...input, request: { next: true } })).toEqual({ question1: 0.75 });
});

test("saturated cache leaves room for several writes after eviction", async () => {
  const dir = await directory();
  const now = () => 1000;
  const answers = { question1: 0.5 };
  const bytes = Buffer.byteLength(JSON.stringify({ schema: 1, createdAt: now(), answers }));
  const maxBytes = bytes * 100;
  const cache = createEvaluationCache({ directory: dir, maxBytes, now });
  for (let index = 0; index < 101; index++)
    await cache.put({ ...input, request: { index } }, answers);
  const probe = spyOn(fs, "lstat");
  try {
    for (let index = 101; index < 106; index++)
      await cache.put({ ...input, request: { index } }, answers);
    expect(probe.mock.calls.filter(([path]) => String(path).endsWith(".json")).length).toBe(0);
    for (let index = 101; index < 106; index++)
      expect(await cache.get({ ...input, request: { index } })).toEqual(answers);
  } finally {
    probe.mockRestore();
  }
  const sizes = await Promise.all(
    (await readdir(join(dir, "entries"))).map(
      async (name) => (await stat(join(dir, "entries", name))).size,
    ),
  );
  expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(maxBytes);
});

test("eviction headroom still permits one entry as large as the cache budget", async () => {
  const now = () => 1000;
  const maxBytes = Buffer.byteLength(
    JSON.stringify({ schema: 1, createdAt: now(), answers: { question1: 0.5 } }),
  );
  const cache = createEvaluationCache({ directory: await directory(), maxBytes, now });
  await cache.put(input, { question1: 0.4 });
  await cache.put(input, { question1: 0.5 });
  expect(await cache.get(input)).toEqual({ question1: 0.5 });
});

test("incomplete censuses do not evict below the budget", async () => {
  const dir = await directory();
  const now = () => 1000;
  const answers = { question1: 0.5 };
  const bytes = Buffer.byteLength(JSON.stringify({ schema: 1, createdAt: now(), answers }));
  const cache = createEvaluationCache({ directory: dir, maxBytes: bytes * 100, now });
  for (let index = 0; index < 95; index++)
    await cache.put({ ...input, request: { index } }, answers);
  const names = await readdir(join(dir, "entries"));
  const broken = join(dir, "entries", names[0]!);
  const original = fs.lstat;
  const probe = spyOn(fs, "lstat").mockImplementation((...args) => {
    if (String(args[0]) === broken)
      return Promise.reject(Object.assign(new Error("fixture I/O failure"), { code: "EIO" }));
    return original(...args);
  });
  try {
    const fresh = createEvaluationCache({ directory: dir, maxBytes: bytes * 100, now });
    await fresh.put({ ...input, request: { index: 95 } }, answers);
    const remaining = await readdir(join(dir, "entries"));
    expect(remaining.length).toBe(96);
    for (const name of names) expect(remaining).toContain(name);
    expect(fresh.stats().issues.some((issue) => issue.kind === "cache_unavailable")).toBe(true);
  } finally {
    probe.mockRestore();
  }
});
