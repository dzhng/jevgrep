import { createHash, randomUUID } from "node:crypto";
import { constants, type BigIntStats, type Dir } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import ignore, { type Ignore } from "ignore";

/** These independent switches broaden only their named exclusion category. */
export type FilesystemPolicy = {
  hidden?: boolean;
  noIgnore?: boolean;
  includeDependencies?: boolean;
  includeSensitive?: boolean;
  /** Root-relative gitignore patterns that only narrow eligibility; repository rules cannot re-admit them. */
  exclude?: readonly string[];
};
export type Snapshot = Readonly<{ path: string; contentHash: string; source: string }>;
export type FilesystemIssue = {
  kind: "unreadable" | "changed" | "resource_limit" | "interrupted";
  path: string;
};
type Excluded = { status: "excluded"; reason: string };
type Issue = { status: "issue"; issue: FilesystemIssue };
export type SnapshotResult = { status: "ok"; snapshot: Snapshot } | Excluded | Issue;
export type DirectoryEntry = { path: string; kind: "file" | "directory"; bytes?: number };
export type DirectoryPage = {
  entries: DirectoryEntry[];
  /** Per-reason counts of entries this page skipped; a skipped directory counts once. */
  excluded: Record<string, number>;
  nextCursor?: string;
  issues: FilesystemIssue[];
};

/** Exact default name policy. Dot paths require hidden independently of the other switches. */
export const filesystemDefaults = Object.freeze({
  dependencyDirectories: [
    "node_modules",
    "vendor",
    "venv",
    ".venv",
    ".tox",
    "__pycache__",
    "dist",
    "build",
    "coverage",
    "target",
    ".next",
    ".nuxt",
    ".turbo",
  ] as readonly string[],
  sensitiveNames: [
    "credentials",
    "credentials.json",
    "secrets.json",
    "secrets.yaml",
    "secrets.yml",
    "id_rsa",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
    ".netrc",
    ".npmrc",
    ".pypirc",
  ] as readonly string[],
  sensitiveSuffixes: [".pem", ".key", ".p12", ".pfx"] as readonly string[],
  pageSize: 128,
  maxOpenDirectories: 64,
  maxFileBytes: 16 * 1024 * 1024,
  maxIgnoreBytes: 1024 * 1024,
  /** Source bytes of earlier snapshots retained for identity-checked reuse. */
  maxReusableBytes: 32 * 1024 * 1024,
});
export type FilesystemOptions = {
  root: string;
  policy?: FilesystemPolicy;
  /** Absolute credential/cache locations beyond the default XDG locations. Always excluded. */
  protectedPaths?: readonly string[];
  limits?: Partial<
    Pick<
      typeof filesystemDefaults,
      "pageSize" | "maxOpenDirectories" | "maxFileBytes" | "maxIgnoreBytes" | "maxReusableBytes"
    >
  >;
  signal?: AbortSignal;
  /** Wall-clock milliseconds, compared with file timestamps; injectable for tests. */
  now?: () => number;
};
/** Timestamps are coarse on some filesystems (two seconds on FAT). A write in the same tick as a
 * read can leave a file's identity unchanged, so only a file whose last change is older than this
 * margin at the start of its read can later be recognized by identity alone. */
const recentChangeNs = 3_000_000_000n;

type Scope = { directory: string; git?: Ignore; search?: Ignore };
type Eligible = {
  status: "eligible";
  path: string;
  absolute: string;
  stat: BigIntStats;
  ancestors: Array<{ path: string; stat: BigIntStats }>;
};
type Eligibility = Eligible | Excluded | Issue;
type Cursor = { directory: string; handle: Dir; identity: Eligible };
const excluded = (reason: string): Excluded => ({ status: "excluded", reason });
const issue = (kind: FilesystemIssue["kind"], path: string): Issue => ({
  status: "issue",
  issue: { kind, path },
});
function same(a: BigIntStats, b: BigIntStats) {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.size === b.size &&
    a.mtimeNs === b.mtimeNs &&
    a.ctimeNs === b.ctimeNs
  );
}
function within(root: string, path: string) {
  const rel = relative(root, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
function errorKind(error: unknown): FilesystemIssue["kind"] {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP" ? "changed" : "unreadable";
}
function isSensitive(name: string) {
  const lower = name.toLowerCase();
  return (
    lower === ".env" ||
    lower.startsWith(".env.") ||
    filesystemDefaults.sensitiveNames.includes(lower) ||
    filesystemDefaults.sensitiveSuffixes.some((suffix) => lower.endsWith(suffix))
  );
}

/** One invocation-scoped owner for eligibility, metadata reads, enumeration and content snapshots. */
export async function createFilesystem(options: FilesystemOptions) {
  const root = await realpath(resolve(options.root));
  const rootStat = await lstat(root, { bigint: true });
  if (!rootStat.isDirectory()) throw new Error("Search root must be a directory");
  const policy = Object.freeze({ ...options.policy });
  const excludeRules = policy.exclude?.length ? ignore().add(policy.exclude) : undefined;
  const limits = { ...filesystemDefaults, ...options.limits };
  for (const name of [
    "pageSize",
    "maxOpenDirectories",
    "maxFileBytes",
    "maxIgnoreBytes",
    "maxReusableBytes",
  ] as const) {
    if (!Number.isSafeInteger(limits[name]) || limits[name] < 1)
      throw new Error(`Invalid filesystem limit: ${name}`);
  }
  const now = options.now ?? (() => Date.now());
  const protectedPaths = await Promise.all(
    [
      join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "jevgrep"),
      join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "jevgrep"),
      ...(options.protectedPaths ?? []),
    ].map(async (path) => {
      const absolute = resolve(path);
      try {
        return await realpath(absolute);
      } catch {
        return absolute;
      }
    }),
  );
  const cursors = new Map<string, Cursor>();
  let closed = false;
  let openingDirectories = 0;

  function pathName(path: string) {
    if (isAbsolute(path)) return undefined;
    const absolute = resolve(root, path);
    return within(root, absolute)
      ? { absolute, path: relative(root, absolute).split(sep).join("/") }
      : undefined;
  }
  function stopped(path: string): Issue | undefined {
    return closed || options.signal?.aborted ? issue("interrupted", path) : undefined;
  }
  function hardExcluded(path: string) {
    return (
      path.split(sep).includes(".git") ||
      protectedPaths.some((protectedPath) => within(protectedPath, path))
    );
  }
  async function stable(identity: Eligible) {
    for (const ancestor of identity.ancestors) {
      const current = await lstat(ancestor.path, { bigint: true });
      // Child modifications legitimately change a directory's timestamps; its identity must stay fixed.
      if (
        !current.isDirectory() ||
        current.dev !== ancestor.stat.dev ||
        current.ino !== ancestor.stat.ino
      )
        return false;
    }
    return (
      same(identity.stat, await lstat(identity.absolute, { bigint: true })) &&
      (await realpath(identity.absolute)) === identity.absolute
    );
  }
  async function readBytes(
    identity: Eligible,
    ceiling: number,
  ): Promise<{ status: "ok"; bytes: Buffer } | Issue> {
    const interrupted = stopped(identity.path);
    if (interrupted) return interrupted;
    if (identity.stat.size > BigInt(ceiling)) return issue("resource_limit", identity.path);
    let handle;
    try {
      // NONBLOCK prevents a concurrent replacement with a FIFO from hanging the process.
      handle = await open(
        identity.absolute,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      const before = await handle.stat({ bigint: true });
      if (!before.isFile() || !same(identity.stat, before)) return issue("changed", identity.path);
      const chunks: Buffer[] = [];
      let total = 0;
      while (true) {
        const interruption = stopped(identity.path);
        if (interruption) return interruption;
        const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, ceiling - total + 1));
        const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
        if (!bytesRead) break;
        total += bytesRead;
        if (total > ceiling) return issue("resource_limit", identity.path);
        chunks.push(chunk.subarray(0, bytesRead));
      }
      if (!same(before, await handle.stat({ bigint: true })) || !(await stable(identity)))
        return issue("changed", identity.path);
      return { status: "ok", bytes: Buffer.concat(chunks, total) };
    } catch (error) {
      return issue(errorKind(error), identity.path);
    } finally {
      await handle?.close();
    }
  }
  // Search-local reuse; eviction only requires reparsing, never changes eligibility.
  const ruleCache = new Map<string, { stat: BigIntStats; rules: Ignore }>();
  async function ruleFile(directory: string, name: string): Promise<Ignore | Issue | undefined> {
    const absolute = join(directory, name);
    try {
      const stat = await lstat(absolute, { bigint: true });
      if (!stat.isFile() || stat.isSymbolicLink()) {
        ruleCache.delete(absolute);
        return undefined;
      }
      const cached = ruleCache.get(absolute);
      if (cached && same(cached.stat, stat)) {
        if (
          !(await stable({
            status: "eligible",
            path: relative(root, absolute),
            absolute,
            stat,
            ancestors: [],
          }))
        )
          return issue("changed", relative(root, absolute));
        ruleCache.delete(absolute);
        ruleCache.set(absolute, cached);
        return cached.rules;
      }
      const bytes = await readBytes(
        { status: "eligible", path: relative(root, absolute), absolute, stat, ancestors: [] },
        limits.maxIgnoreBytes,
      );
      if (bytes.status === "issue") return bytes;
      try {
        const rules = ignore().add(new TextDecoder("utf-8", { fatal: true }).decode(bytes.bytes));
        ruleCache.delete(absolute);
        ruleCache.set(absolute, { stat, rules });
        if (ruleCache.size > 64) ruleCache.delete(ruleCache.keys().next().value!);
        return rules;
      } catch {
        return issue("unreadable", relative(root, absolute));
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        ruleCache.delete(absolute);
        return undefined;
      }
      return issue(errorKind(error), relative(root, absolute));
    }
  }
  async function eligibility(input: string, allowMissing = false): Promise<Eligibility> {
    const named = pathName(input);
    if (!named) return excluded("outside_root");
    const interruption = stopped(named.path);
    if (interruption) return interruption;
    if (hardExcluded(named.absolute)) return excluded("protected");
    const components = named.path ? named.path.split("/") : [];
    const scopes: Scope[] = [];
    const ancestors: Eligible["ancestors"] = [];
    let directory = root;
    try {
      const currentRoot = await lstat(root, { bigint: true });
      if (
        !currentRoot.isDirectory() ||
        currentRoot.ino !== rootStat.ino ||
        currentRoot.dev !== rootStat.dev
      )
        return issue("changed", named.path);
      if (!components.length) return { status: "eligible", ...named, stat: currentRoot, ancestors };
      ancestors.push({ path: root, stat: currentRoot });
      for (let index = 0; index < components.length; index++) {
        if (!policy.noIgnore) {
          if (directory !== root) {
            try {
              const git = await lstat(join(directory, ".git"));
              if (git.isDirectory() || git.isFile()) for (const scope of scopes) delete scope.git;
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT")
                return issue(errorKind(error), named.path);
            }
          }
          const git = await ruleFile(directory, ".gitignore");
          if (git && "status" in git) return git;
          const search = await ruleFile(directory, ".ignore");
          if (search && "status" in search) return search;
          scopes.push({ directory, git, search });
        }
        const name = components[index]!;
        const absolute = join(directory, name);
        if (hardExcluded(absolute)) return excluded("protected");
        if (!policy.hidden && name.startsWith(".")) return excluded("hidden");
        if (!policy.includeSensitive && isSensitive(name)) return excluded("sensitive_name");
        const stat = await lstat(absolute, { bigint: true });
        if (stat.isSymbolicLink()) return excluded("symlink");
        if (!stat.isDirectory() && !stat.isFile()) return excluded("special_file");
        if (
          stat.isDirectory() &&
          !policy.includeDependencies &&
          filesystemDefaults.dependencyDirectories.includes(name)
        )
          return excluded("dependency");
        let ignored = false;
        for (const scope of scopes) {
          const candidate =
            relative(scope.directory, absolute).split(sep).join("/") +
            (stat.isDirectory() ? "/" : "");
          for (const matcher of [scope.git, scope.search]) {
            if (!matcher) continue;
            const result = matcher.test(candidate);
            if (result.ignored) ignored = true;
            else if (result.unignored) ignored = false;
          }
        }
        if (ignored) return excluded("ignored");
        const rootRelative = components.slice(0, index + 1).join("/");
        if (excludeRules?.ignores(rootRelative + (stat.isDirectory() ? "/" : "")))
          return excluded("exclude_pattern");
        if (index === components.length - 1)
          return { status: "eligible", ...named, stat, ancestors };
        if (!stat.isDirectory()) return excluded("not_directory");
        ancestors.push({ path: absolute, stat });
        directory = absolute;
      }
      return excluded("outside_root");
    } catch (error) {
      if (allowMissing && (error as NodeJS.ErrnoException).code === "ENOENT")
        return excluded("missing");
      return issue(errorKind(error), named.path);
    }
  }
  async function lookupFile(path: string) {
    const result = await eligibility(path, true);
    if (result.status !== "eligible") return result;
    return result.stat.isFile() ? { status: "file" as const } : excluded("not_file");
  }
  type Reusable = { snapshot: Snapshot; stat: BigIntStats; bytes: number };
  // Trusted earlier reads, least recently used first; bounded by source bytes.
  const reusable = new Map<string, Reusable>();
  let reusableBytes = 0;
  function forget(path: string) {
    const entry = reusable.get(path);
    if (!entry) return;
    reusable.delete(path);
    reusableBytes -= entry.bytes;
  }
  function retain(path: string, entry: Reusable) {
    forget(path);
    if (entry.bytes > limits.maxReusableBytes) return;
    reusable.set(path, entry);
    reusableBytes += entry.bytes;
    for (const [oldest, value] of reusable) {
      if (reusableBytes <= limits.maxReusableBytes) break;
      reusable.delete(oldest);
      reusableBytes -= value.bytes;
    }
  }
  /** Compares identity without reading bytes. Opening, unlike lstat alone, revalidates attributes
   * that network filesystems cache between clients. */
  async function sameFile(identity: Eligible, known: BigIntStats) {
    if (!same(known, identity.stat) || stopped(identity.path) !== undefined) return false;
    let handle;
    try {
      handle = await open(
        identity.absolute,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      const current = await handle.stat({ bigint: true });
      return current.isFile() && same(known, current);
    } catch {
      return false;
    } finally {
      await handle?.close();
    }
  }
  /** Eligibility is evaluated on every call. With `reuse`, a file whose identity (device, inode,
   * size, modification and change times) matches a trusted earlier read returns that snapshot
   * instead of being reread and rehashed; any other file is read again. */
  async function readSnapshot(
    path: string,
    options: { reuse?: boolean } = {},
  ): Promise<SnapshotResult> {
    const started = BigInt(Math.floor(now())) * 1_000_000n;
    const admitted = await eligibility(path);
    if (admitted.status !== "eligible") {
      const named = pathName(path);
      if (named) forget(named.path);
      return admitted;
    }
    if (!admitted.stat.isFile()) {
      forget(admitted.path);
      return excluded("not_file");
    }
    const known = reusable.get(admitted.path);
    if (options.reuse && known && (await sameFile(admitted, known.stat))) {
      reusable.delete(admitted.path);
      reusable.set(admitted.path, known);
      return { status: "ok", snapshot: known.snapshot };
    }
    forget(admitted.path);
    const read = await readBytes(admitted, limits.maxFileBytes);
    if (read.status !== "ok") return read;
    const current = await eligibility(path);
    if (current.status !== "eligible") return current;
    if (!same(admitted.stat, current.stat)) return issue("changed", admitted.path);
    if (/[\x00-\x08\x0b\x0e-\x1f\x7f]/.test(read.bytes.toString("latin1")))
      return excluded("binary");
    let source: string;
    try {
      source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(read.bytes);
    } catch {
      return excluded("invalid_utf8");
    }
    if (!policy.includeSensitive && /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/.test(source))
      return excluded("private_key");
    const snapshot = Object.freeze({
      path: admitted.path,
      source,
      contentHash: createHash("sha256").update(read.bytes).digest("hex"),
    });
    const { mtimeNs, ctimeNs } = admitted.stat;
    if ((mtimeNs > ctimeNs ? mtimeNs : ctimeNs) + recentChangeNs < started)
      retain(admitted.path, { snapshot, stat: admitted.stat, bytes: read.bytes.length });
    return { status: "ok", snapshot };
  }
  async function discard(token: string) {
    const cursor = cursors.get(token);
    cursors.delete(token);
    if (cursor) await cursor.handle.close();
  }
  /** Consume a cursor serially; closeCursor releases a deliberately pruned directory without draining it. */
  async function listPage(path = ".", token?: string): Promise<DirectoryPage> {
    const entries: DirectoryEntry[] = [];
    const excluded: Record<string, number> = {};
    const issues: FilesystemIssue[] = [];
    const named = pathName(path);
    if (!named) return { entries, excluded, issues };
    let cursor = token ? cursors.get(token) : undefined;
    if (token && (!cursor || cursor.directory !== named.path))
      throw new Error("Invalid directory cursor");
    try {
      if (!cursor) {
        const admitted = await eligibility(path);
        if (admitted.status === "issue") return { entries, excluded, issues: [admitted.issue] };
        if (admitted.status !== "eligible" || !admitted.stat.isDirectory())
          return { entries, excluded, issues };
        if (cursors.size + openingDirectories >= limits.maxOpenDirectories)
          return { entries, excluded, issues: [issue("resource_limit", named.path).issue] };
        openingDirectories++;
        try {
          cursor = {
            directory: named.path,
            handle: await opendir(admitted.absolute, { bufferSize: limits.pageSize }),
            identity: admitted,
          };
        } finally {
          openingDirectories--;
        }
        if (stopped(named.path)) {
          await cursor.handle.close();
          return { entries, excluded, issues: [issue("interrupted", named.path).issue] };
        }
        token = randomUUID();
        cursors.set(token, cursor);
      }
      if (stopped(named.path) || !(await stable(cursor.identity))) {
        issues.push(issue(stopped(named.path) ? "interrupted" : "changed", named.path).issue);
        await discard(token!);
        return { entries, excluded, issues };
      }
      for (let scanned = 0; scanned < limits.pageSize; scanned++) {
        const entry = await cursor.handle.read();
        if (!entry) {
          const unchanged = await stable(cursor.identity);
          await discard(token!);
          return unchanged
            ? { entries, excluded, issues }
            : {
                entries: [],
                excluded: {},
                issues: [...issues, issue("changed", named.path).issue],
              };
        }
        const relativePath = named.path ? `${named.path}/${entry.name}` : entry.name;
        const admitted = await eligibility(relativePath);
        if (admitted.status === "issue") {
          issues.push(admitted.issue);
          if (admitted.issue.kind === "interrupted") {
            await discard(token!);
            return { entries, excluded, issues };
          }
        } else if (admitted.status === "eligible")
          entries.push(
            admitted.stat.isDirectory()
              ? { path: relativePath, kind: "directory" }
              : { path: relativePath, kind: "file", bytes: Number(admitted.stat.size) },
          );
        else excluded[admitted.reason] = (excluded[admitted.reason] ?? 0) + 1;
      }
      if (!(await stable(cursor.identity))) {
        await discard(token!);
        return {
          entries: [],
          excluded: {},
          issues: [...issues, issue("changed", named.path).issue],
        };
      }
      return { entries, excluded, nextCursor: token, issues };
    } catch (error) {
      if (token) await discard(token);
      return {
        entries: [],
        excluded: {},
        issues: [...issues, issue(errorKind(error), named.path).issue],
      };
    }
  }
  async function close() {
    closed = true;
    ruleCache.clear();
    reusable.clear();
    reusableBytes = 0;
    await Promise.all([...cursors.keys()].map(discard));
  }
  return { root, readSnapshot, lookupFile, listPage, closeCursor: discard, close };
}
export type FilesystemReader = Awaited<ReturnType<typeof createFilesystem>>;
