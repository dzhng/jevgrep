import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, opendir, rename, rm, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue | undefined };
export type CacheInput = {
  request: JsonValue;
  namespace: { model: string; provider: string; policyVersion: string; [key: string]: string };
};
export type CacheAnswers = Record<string, number>;
export type CacheIssue = "cache_unavailable" | "cache_corrupt" | "cache_limit";
export type CacheOptions = {
  /** CLI owns XDG resolution; this directory contains only Jevgrep cache data. */
  directory: string;
  enabled?: boolean;
  ttlMs?: number;
  maxBytes?: number;
  now?: () => number;
};
const schema = 1;
const entryName = /^[a-f0-9]{64}\.json$/;
const pendingName = /^\.pending-[a-f0-9-]+$/;

function validAnswers(value: unknown): value is CacheAnswers {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((answer) => typeof answer === "number" && Number.isFinite(answer))
  );
}
function missing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** Answer-only, best-effort storage; the evaluator must validate success before calling put. */
export function createEvaluationCache(options: CacheOptions) {
  const directory = resolve(options.directory);
  const entries = join(directory, "entries");
  const enabled = options.enabled !== false;
  const ttlMs = options.ttlMs ?? 7 * 24 * 60 * 60 * 1000;
  const maxBytes = options.maxBytes ?? 256 * 1024 * 1024;
  const now = options.now ?? Date.now;
  if (
    !Number.isSafeInteger(ttlMs) ||
    ttlMs <= 0 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0
  )
    throw new Error("Invalid cache limits");
  const maxEntryBytes = Math.min(maxBytes, 1024 * 1024);
  const issues = new Map<CacheIssue, number>();
  let hits = 0,
    misses = 0;
  function warn(kind: CacheIssue) {
    issues.set(kind, (issues.get(kind) ?? 0) + 1);
  }
  function key(input: CacheInput) {
    // Preserve request/question ordering. Only this digest, never the serialized request, reaches disk.
    return createHash("sha256")
      .update(JSON.stringify([schema, input.namespace, input.request]))
      .digest("hex");
  }
  async function checkDirectory(path: string, create: boolean) {
    if (create) await mkdir(path, { recursive: true, mode: 0o700 });
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error("Cache path is not a directory");
    if (create && (info.mode & 0o777) !== 0o700) await chmod(path, 0o700);
  }
  async function prepare(create: boolean) {
    await checkDirectory(directory, create);
    await checkDirectory(entries, create);
  }
  async function get(input: CacheInput): Promise<CacheAnswers | undefined> {
    if (!enabled) {
      misses++;
      return undefined;
    }
    let handle;
    try {
      await prepare(false);
      handle = await open(
        join(entries, `${key(input)}.json`),
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
      );
      const info = await handle.stat();
      if (!info.isFile() || info.size > maxEntryBytes) {
        warn("cache_corrupt");
        misses++;
        return undefined;
      }
      const buffer = Buffer.allocUnsafe(maxEntryBytes + 1);
      let length = 0;
      while (length < buffer.length) {
        const result = await handle.read(buffer, length, buffer.length - length, null);
        if (!result.bytesRead) break;
        length += result.bytesRead;
      }
      if (length > maxEntryBytes) {
        warn("cache_corrupt");
        misses++;
        return undefined;
      }
      let value;
      try {
        value = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length)),
        );
      } catch {
        warn("cache_corrupt");
        misses++;
        return undefined;
      }
      if (
        value?.schema !== schema ||
        typeof value.createdAt !== "number" ||
        !Number.isFinite(value.createdAt) ||
        !validAnswers(value.answers)
      ) {
        warn("cache_corrupt");
        misses++;
        return undefined;
      }
      const age = now() - value.createdAt;
      if (age < 0 || age >= ttlMs) {
        misses++;
        return undefined;
      }
      hits++;
      return value.answers;
    } catch (error) {
      if (!missing(error)) warn("cache_unavailable");
      misses++;
      return undefined;
    } finally {
      try {
        await handle?.close();
      } catch {
        warn("cache_unavailable");
      }
    }
  }
  async function remove(path: string) {
    try {
      await unlink(path);
    } catch (error) {
      if (!missing(error)) throw error;
    }
  }
  async function trim() {
    // Streaming retention bounds memory even with many tiny entries. Eviction is deliberately not LRU.
    let retainedBytes = 0;
    const scan = await opendir(entries);
    for await (const entry of scan) {
      if (!entryName.test(entry.name) && !pendingName.test(entry.name)) continue;
      const path = join(entries, entry.name);
      try {
        const info = await lstat(path);
        if (!info.isFile() || info.isSymbolicLink()) continue;
        if (pendingName.test(entry.name)) {
          // Abandoned publications after a crash must not accumulate forever; current writes get an hour.
          if (Date.now() - info.mtimeMs > 60 * 60 * 1000) await remove(path);
          continue;
        }
        if (retainedBytes + info.size > maxBytes) await remove(path);
        else retainedBytes += info.size;
      } catch (error) {
        if (!missing(error)) warn("cache_unavailable");
      }
    }
  }
  async function cleanupDetached() {
    const scan = await opendir(directory);
    for await (const entry of scan) {
      if (!/^\.cleared-[a-f0-9-]+$/.test(entry.name)) continue;
      try {
        await rm(join(directory, entry.name), { recursive: true, force: true });
      } catch (error) {
        if (!missing(error)) warn("cache_unavailable");
      }
    }
  }
  async function put(input: CacheInput, answers: CacheAnswers): Promise<void> {
    if (!enabled) return;
    let temporary: string | undefined;
    let handle;
    try {
      if (!validAnswers(answers)) {
        warn("cache_corrupt");
        return;
      }
      const payload = JSON.stringify({ schema, createdAt: now(), answers });
      if (Buffer.byteLength(payload) > maxEntryBytes) {
        warn("cache_limit");
        return;
      }
      const destination = join(entries, `${key(input)}.json`);
      await prepare(true);
      await cleanupDetached();
      temporary = join(entries, `.pending-${randomUUID()}`);
      handle = await open(
        temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
        0o600,
      );
      await handle.writeFile(payload);
      await handle.close();
      handle = undefined;
      await rename(temporary, destination);
      temporary = undefined;
      await trim();
    } catch {
      warn("cache_unavailable");
    } finally {
      try {
        await handle?.close();
      } catch {
        warn("cache_unavailable");
      }
      if (temporary) {
        try {
          await remove(temporary);
        } catch {
          warn("cache_unavailable");
        }
      }
    }
  }
  async function clear(): Promise<void> {
    // Detach the current generation atomically. Later writers create a new one; no global lock or pause.
    const detached = join(directory, `.cleared-${randomUUID()}`);
    try {
      await checkDirectory(directory, false);
      try {
        await checkDirectory(entries, false);
        await rename(entries, detached);
      } catch (error) {
        if (!missing(error)) throw error;
      }
      await cleanupDetached();
    } catch (error) {
      if (!missing(error)) warn("cache_unavailable");
    }
  }
  function stats() {
    return { hits, misses, issues: [...issues].map(([kind, count]) => ({ kind, count })) };
  }
  return { get, put, clear, stats };
}
export type EvaluationCache = ReturnType<typeof createEvaluationCache>;
