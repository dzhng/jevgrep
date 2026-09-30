import { testIfDocker as test } from "../../../test/helpers/docker";
import { afterEach, expect } from "bun:test";
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

test("byte bounds count allocated blocks, evict the oldest answers and reject oversized ones", async () => {
  let clock = Date.now();
  const budget = 3 * 4096 + 100;
  const dir = await directory();
  const cache = createEvaluationCache({ directory: dir, maxBytes: budget, now: () => clock });
  for (let index = 0; index < 8; index++) {
    clock += 1000;
    await cache.put({ ...input, request: { index } }, { question1: index / 8 });
  }
  const names = await readdir(join(dir, "entries"));
  let allocatedBytes = 0;
  for (const name of names) {
    const file = join(dir, "entries", name);
    const info = await stat(file);
    allocatedBytes += Math.max(Math.ceil(info.size / 4096) * 4096, info.blocks * 512);
    expect(JSON.parse(await readFile(file, "utf8")).answers.question1).toBeGreaterThanOrEqual(0);
  }
  expect(allocatedBytes).toBeLessThanOrEqual(budget);
  expect(names.length).toBeGreaterThan(0);
  expect(await cache.get({ ...input, request: { index: 7 } })).toEqual({ question1: 7 / 8 });
  expect(await cache.get({ ...input, request: { index: 0 } })).toBeUndefined();
  await cache.put(input, { ["large".repeat(3000)]: 1 });
  expect(await cache.get(input)).toBeUndefined();
  expect(cache.stats().issues).toEqual([{ kind: "cache_limit", count: 1 }]);
});

test("sweeps run at most hourly across processes and remove expired and abandoned files", async () => {
  const minute = 60 * 1000;
  const start = Date.now();
  let clock = start;
  const dir = await directory();
  const entries = join(dir, "entries");
  const options = { directory: dir, ttlMs: 45 * minute, now: () => clock };
  const writer = createEvaluationCache(options);
  await writer.put({ ...input, request: { index: 0 } }, { question1: 0 });
  const [expired] = await readdir(entries);
  clock = start + 50 * minute;
  const abandoned = ".pending-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const hoursAgo = (clock - 120 * minute) / 1000;
  await writeFile(join(entries, abandoned), "partial");
  await utimes(join(entries, abandoned), hoursAgo, hoursAgo);
  for (let index = 1; index <= 3; index++)
    await writer.put({ ...input, request: { index } }, { question1: index });
  // Neither later writes nor another process within the hour rescan the directory.
  const early = createEvaluationCache(options);
  await early.put({ ...input, request: { index: 4 } }, { question1: 4 });
  expect(await readdir(entries)).toEqual(expect.arrayContaining([expired, abandoned]));
  expect(await writer.get({ ...input, request: { index: 0 } })).toBeUndefined();
  clock = start + 70 * minute;
  const late = createEvaluationCache(options);
  await late.put({ ...input, request: { index: 5 } }, { question1: 5 });
  const remaining = await readdir(entries);
  expect(remaining).toHaveLength(5);
  expect(remaining).not.toContain(expired);
  expect(remaining).not.toContain(abandoned);
  expect(await late.get({ ...input, request: { index: 1 } })).toEqual({ question1: 1 });
  expect([writer, early, late].flatMap((cache) => cache.stats().issues)).toEqual([]);
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
