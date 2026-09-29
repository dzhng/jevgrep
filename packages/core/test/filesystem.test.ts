import { testIfDocker as test } from "../../../test/helpers/docker";
import { afterEach, expect, spyOn } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, symlink, chmod, open, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFilesystem } from "../src/filesystem";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(files: Record<string, string | Uint8Array>) {
  const root = await mkdtemp(join(tmpdir(), "jevgrep-filesystem-"));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

test("one reader excludes ignored, hidden, dependent, sensitive and binary content from plain roots", async () => {
  const root = await fixture({
    ".gitignore": "ignored.txt\n",
    "visible.ts": "export const answer = 42;\n",
    "ignored.txt": "IGNORE_SENTINEL",
    ".hidden": "HIDDEN_SENTINEL",
    "node_modules/pkg.js": "DEPENDENCY_SENTINEL",
    "credentials.json": "SECRET_SENTINEL",
    "key.txt": "-----BEGIN PRIVATE KEY-----\nSECRET",
    binary: new Uint8Array([0, 255]),
  });
  const reader = await createFilesystem({ root });
  try {
    expect(await reader.readSnapshot("visible.ts")).toMatchObject({
      status: "ok",
      snapshot: { path: "visible.ts", source: "export const answer = 42;\n" },
    });
    for (const path of [
      "ignored.txt",
      ".hidden",
      "node_modules/pkg.js",
      "credentials.json",
      "key.txt",
      "binary",
    ]) {
      expect(await reader.readSnapshot(path)).toMatchObject({ status: "excluded" });
    }
  } finally {
    await reader.close();
  }
});

test("closer ignore rules and same-scope .ignore overrides apply, while excluded parents cannot be rescued", async () => {
  const root = await fixture({
    ".gitignore": "*.txt\nblocked/\n!keep.txt\n",
    ".ignore": "keep.txt\n!search.txt\n",
    "keep.txt": "hidden by search rules",
    "search.txt": "allowed by search rules",
    "child/.gitignore": "!local.txt\n",
    "child/local.txt": "local exception",
    "child/other.txt": "ancestor exclusion",
    "blocked/.gitignore": "!inside.ts\n",
    "blocked/inside.ts": "still blocked",
    "nested/.git": "gitdir: elsewhere",
    "nested/value.txt": "repository resets git rules",
    "nested/keep.txt": "search rules remain",
  });
  const reader = await createFilesystem({ root });
  try {
    for (const path of ["search.txt", "child/local.txt", "nested/value.txt"])
      expect(await reader.readSnapshot(path)).toMatchObject({ status: "ok" });
    for (const path of ["keep.txt", "child/other.txt", "blocked/inside.ts", "nested/keep.txt"])
      expect(await reader.readSnapshot(path)).toMatchObject({
        status: "excluded",
        reason: "ignored",
      });
  } finally {
    await reader.close();
  }
});

test("pages advance past excluded entries, preserve unusual names, and release completed cursors", async () => {
  const root = await fixture({
    ".gitignore": "skip*\n",
    skip1: "excluded",
    skip2: "excluded",
    "a.ts": "a",
    "line\nbreak.ts": "b",
    "last.ts": "c",
  });
  const reader = await createFilesystem({ root, limits: { pageSize: 1, maxOpenDirectories: 1 } });
  try {
    const names: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await reader.listPage(".", cursor);
      expect(page.issues).toEqual([]);
      names.push(...page.entries.map((entry) => entry.path));
      cursor = page.nextCursor;
    } while (cursor);
    expect(names.sort()).toEqual(["a.ts", "last.ts", "line\nbreak.ts"]);
    expect((await reader.listPage()).issues).toEqual([]);
  } finally {
    await reader.close();
  }
});

test("policy overrides are independent and never admit protected storage or binary bytes", async () => {
  const root = await fixture({
    ".gitignore": "plain\n",
    plain: "ignored",
    ".env": "secret",
    "node_modules/a": "dependency",
    "cache/a": "persisted",
    ".git/config": "metadata",
    binary: new Uint8Array([0]),
    "ordinary.key": "key",
    "key-source": "-----BEGIN RSA PRIVATE KEY-----\nsecret",
  });
  const broad = await createFilesystem({
    root,
    protectedPaths: [join(root, "cache")],
    policy: { hidden: true, noIgnore: true, includeDependencies: true, includeSensitive: true },
  });
  try {
    for (const path of ["plain", ".env", "node_modules/a", "ordinary.key", "key-source"])
      expect(await broad.readSnapshot(path)).toMatchObject({ status: "ok" });
    for (const path of ["cache/a", ".git/config", "binary"])
      expect(await broad.readSnapshot(path)).toMatchObject({ status: "excluded" });
  } finally {
    await broad.close();
  }
  for (const policy of [
    { hidden: true },
    { noIgnore: true },
    { includeSensitive: true },
    { includeDependencies: true },
  ]) {
    const reader = await createFilesystem({ root, policy });
    try {
      expect((await reader.readSnapshot("plain")).status).toBe(
        "noIgnore" in policy ? "ok" : "excluded",
      );
      expect((await reader.readSnapshot("ordinary.key")).status).toBe(
        "includeSensitive" in policy ? "ok" : "excluded",
      );
      expect((await reader.readSnapshot("node_modules/a")).status).toBe(
        "includeDependencies" in policy ? "ok" : "excluded",
      );
      expect((await reader.readSnapshot(".env")).status).toBe("excluded");
    } finally {
      await reader.close();
    }
  }
});

test("pages count skipped entries by reason and report file sizes", async () => {
  const root = await fixture({
    ".gitignore": "ignored.txt\n",
    "ignored.txt": "ignored",
    "node_modules/pkg.js": "dependency",
    ".env": "secret",
    "sized.ts": "12345",
    "dir/inner.ts": "x",
  });
  const reader = await createFilesystem({ root });
  try {
    const page = await reader.listPage();
    expect(page.entries.sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: "dir", kind: "directory" },
      { path: "sized.ts", kind: "file", bytes: 5 },
    ]);
    expect(page.excluded).toEqual({ hidden: 2, ignored: 1, dependency: 1 });
  } finally {
    await reader.close();
  }
});

test("exclude patterns only narrow eligibility, even with --no-ignore and repository negations", async () => {
  const root = await fixture({
    ".gitignore": "!keep.test.ts\n",
    "src/app.ts": "application",
    "src/app.test.ts": "test",
    "keep.test.ts": "repository negation",
    "admin/page.ts": "admin",
    "admin/nested/deep.ts": "nested admin",
    "docs/guide.md": "guide",
  });
  const reader = await createFilesystem({ root, policy: { exclude: ["*.test.ts", "admin/"] } });
  try {
    for (const path of ["src/app.ts", "docs/guide.md"])
      expect(await reader.readSnapshot(path)).toMatchObject({ status: "ok" });
    for (const path of ["src/app.test.ts", "keep.test.ts", "admin/page.ts", "admin/nested/deep.ts"])
      expect(await reader.readSnapshot(path)).toMatchObject({
        status: "excluded",
        reason: "exclude_pattern",
      });
    expect((await reader.listPage()).entries.map((entry) => entry.path).sort()).toEqual([
      "docs",
      "src",
    ]);
  } finally {
    await reader.close();
  }
  const unignored = await createFilesystem({
    root,
    policy: { noIgnore: true, exclude: ["docs/**"] },
  });
  try {
    expect(await unignored.readSnapshot("docs/guide.md")).toMatchObject({
      status: "excluded",
      reason: "exclude_pattern",
    });
    expect(await unignored.readSnapshot("src/app.test.ts")).toMatchObject({ status: "ok" });
  } finally {
    await unignored.close();
  }
});

test("root normalization does not follow descendant links or special files and permission errors stay issues", async () => {
  const root = await fixture({ visible: "ok", unreadable: "unreadable sentinel" });
  const outside = await fixture({ outside: "OUTSIDE_SENTINEL" });
  await symlink(outside, join(root, "escape"));
  await symlink(root, join(root, "cycle"));
  await chmod(join(root, "unreadable"), 0);
  const fifo = Bun.spawnSync(["mkfifo", join(root, "pipe")]);
  expect(fifo.exitCode).toBe(0);
  const reader = await createFilesystem({ root });
  try {
    for (const path of [
      "escape/outside",
      "cycle/visible",
      "pipe",
      "../outside",
      join(outside, "outside"),
    ])
      expect(await reader.readSnapshot(path)).toMatchObject({ status: "excluded" });
    expect(await reader.readSnapshot("unreadable")).toMatchObject({
      status: "issue",
      issue: { kind: "unreadable" },
    });
    expect(await reader.readSnapshot("visible")).toMatchObject({ status: "ok" });
  } finally {
    await reader.close();
  }
});

test("snapshots preserve exact source and change hashes for same-size edits with restored mtime", async () => {
  const root = await fixture({ "source.ts": "\uFEFFconst x = 1;\r\n" });
  const reader = await createFilesystem({ root });
  try {
    const first = await reader.readSnapshot("source.ts");
    expect(first).toMatchObject({ status: "ok", snapshot: { source: "\uFEFFconst x = 1;\r\n" } });
    const handle = await open(join(root, "source.ts"));
    const before = await handle.stat();
    await handle.close();
    await writeFile(join(root, "source.ts"), "\uFEFFconst x = 2;\r\n");
    await utimes(join(root, "source.ts"), before.atime, before.mtime);
    const second = await reader.readSnapshot("source.ts");
    if (first.status !== "ok" || second.status !== "ok")
      throw new Error("Expected eligible snapshots");
    expect(second.snapshot.contentHash).not.toBe(first.snapshot.contentHash);
    expect(first.snapshot.source).toBe("\uFEFFconst x = 1;\r\n");
    expect(second.snapshot.source).toBe("\uFEFFconst x = 2;\r\n");
  } finally {
    await reader.close();
  }
});

test("an observable same-size change between OS reads is incomplete", async () => {
  const root = await fixture({ changing: "original bytes" });
  // Two real writes can share a tmpfs clock tick; pin the initial mtime so this writer is observable.
  await utimes(join(root, "changing"), 0, 0);
  const probe = await open(join(root, "changing"));
  const prototype = Object.getPrototypeOf(probe);
  const originalRead = prototype.read;
  await probe.close();
  let injected = false;
  // Interpose only at the OS-read boundary: a deterministic concurrent writer, not a reader-internal hook.
  const read = spyOn(prototype, "read").mockImplementation(async function (
    this: unknown,
    ...args: unknown[]
  ) {
    const result = await originalRead.apply(this, args);
    if (!injected) {
      injected = true;
      await writeFile(join(root, "changing"), "modified bytes");
    }
    return result;
  });
  const reader = await createFilesystem({ root });
  try {
    expect(await reader.readSnapshot("changing")).toMatchObject({
      status: "issue",
      issue: { kind: "changed" },
    });
  } finally {
    read.mockRestore();
    await reader.close();
  }
});

test("limits and directory changes are visible issues, and fresh queries observe ignore edits and additions", async () => {
  const root = await fixture({ one: "12345", "sub/a": "a", ".ignore": "later\n" });
  const reader = await createFilesystem({
    root,
    limits: { pageSize: 1, maxOpenDirectories: 1, maxFileBytes: 4 },
  });
  try {
    expect(await reader.readSnapshot("one")).toMatchObject({
      status: "issue",
      issue: { kind: "resource_limit" },
    });
    const first = await reader.listPage();
    expect(first.nextCursor).toBeDefined();
    expect((await reader.listPage("sub")).issues).toEqual([
      { kind: "resource_limit", path: "sub" },
    ]);
    await writeFile(join(root, "later"), "yes");
    expect((await reader.listPage(".", first.nextCursor)).issues).toEqual([
      { kind: "changed", path: "" },
    ]);
    expect(await reader.readSnapshot("later")).toMatchObject({
      status: "excluded",
      reason: "ignored",
    });
    await writeFile(join(root, ".ignore"), "");
    expect(await reader.readSnapshot("later")).toMatchObject({
      status: "ok",
      snapshot: { source: "yes" },
    });
  } finally {
    await reader.close();
  }
});

test("one reader observes same-size ignore edits with restored timestamps and recreated rules", async () => {
  const root = await fixture({ ".ignore": "a.txt\n", "a.txt": "a", "b.txt": "b" });
  const rules = join(root, ".ignore");
  const stamp = new Date("2020-01-01T00:00:00Z");
  await utimes(rules, stamp, stamp);
  const reader = await createFilesystem({ root });
  try {
    expect(await reader.readSnapshot("a.txt")).toMatchObject({
      status: "excluded",
      reason: "ignored",
    });
    expect(await reader.readSnapshot("b.txt")).toMatchObject({
      status: "ok",
      snapshot: { source: "b" },
    });
    await writeFile(rules, "b.txt\n");
    await utimes(rules, stamp, stamp);
    expect(await reader.readSnapshot("a.txt")).toMatchObject({
      status: "ok",
      snapshot: { source: "a" },
    });
    expect(await reader.readSnapshot("b.txt")).toMatchObject({
      status: "excluded",
      reason: "ignored",
    });
    await rm(rules);
    expect(await reader.readSnapshot("b.txt")).toMatchObject({
      status: "ok",
      snapshot: { source: "b" },
    });
    await writeFile(rules, "a.txt\n");
    expect(await reader.readSnapshot("a.txt")).toMatchObject({
      status: "excluded",
      reason: "ignored",
    });
  } finally {
    await reader.close();
  }
});

test("protected storage remains excluded when explicit root resolves through its alias", async () => {
  const store = await fixture({ credential: "NEVER_UPLOAD" });
  const root = await fixture({});
  await symlink(store, join(root, "alias"));
  const reader = await createFilesystem({
    root: store,
    protectedPaths: [join(root, "alias")],
    policy: { hidden: true, noIgnore: true, includeSensitive: true, includeDependencies: true },
  });
  try {
    expect(await reader.readSnapshot("credential")).toMatchObject({
      status: "excluded",
      reason: "protected",
    });
  } finally {
    await reader.close();
  }
});

test("discarding a pruned directory releases its cursor and cancellation stops subsequent work", async () => {
  const root = await fixture({ "a/file": "a", "b/file": "b" });
  const controller = new AbortController();
  const reader = await createFilesystem({
    root,
    signal: controller.signal,
    limits: { pageSize: 1, maxOpenDirectories: 1 },
  });
  try {
    const a = await reader.listPage("a");
    expect(a.nextCursor).toBeDefined();
    await reader.closeCursor(a.nextCursor!);
    expect((await reader.listPage("b")).issues).toEqual([]);
    controller.abort();
    expect(await reader.readSnapshot("a/file")).toMatchObject({
      status: "issue",
      issue: { kind: "interrupted" },
    });
  } finally {
    await reader.close();
  }
});

test("valid UTF-8 control-byte binary and invalid UTF-8 remain excluded under every override", async () => {
  const root = await fixture({
    control: new Uint8Array([1, 2, 3]),
    invalid: new Uint8Array([255]),
    plain: "one\ttwo\r\nthree\f",
    unicode: "雪 café 😀",
    ...Object.fromEntries(
      [...Array.from({ length: 32 }, (_, code) => code), 127]
        .filter((code) => ![9, 10, 12, 13].includes(code))
        .map((code) => [`control-${code}`, new Uint8Array([65, code, 66])]),
    ),
  });
  const reader = await createFilesystem({
    root,
    policy: { hidden: true, noIgnore: true, includeDependencies: true, includeSensitive: true },
  });
  try {
    expect(await reader.readSnapshot("control")).toMatchObject({
      status: "excluded",
      reason: "binary",
    });
    for (const code of [...Array.from({ length: 32 }, (_, code) => code), 127]) {
      if ([9, 10, 12, 13].includes(code)) continue;
      expect(await reader.readSnapshot(`control-${code}`)).toMatchObject({
        status: "excluded",
        reason: "binary",
      });
    }
    expect(await reader.readSnapshot("unicode")).toMatchObject({
      status: "ok",
      snapshot: { source: "雪 café 😀" },
    });
    expect(await reader.readSnapshot("invalid")).toMatchObject({
      status: "excluded",
      reason: "invalid_utf8",
    });
    expect(await reader.readSnapshot("plain")).toMatchObject({
      status: "ok",
      snapshot: { source: "one\ttwo\r\nthree\f" },
    });
  } finally {
    await reader.close();
  }
});
