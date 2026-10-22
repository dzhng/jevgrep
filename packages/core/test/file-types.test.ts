import { afterEach, expect, test, spyOn } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, open, lstat } from "node:fs/promises";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFilesystem } from "../src/filesystem";
import { inventory } from "../src/inventory";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "jg-types-"));
  roots.push(root);
  for (const [path, source] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), source);
  }
  return root;
}

test("category selection filters preview, direct reads and lookup before oversized content is opened", async () => {
  const root = await fixture({
    "src/main.ts": "export const ready = true;",
    Makefile: "all:; true",
    "data/events.jsonl": "x".repeat(100),
    "data/worker.py": "print('code inside data directory')",
    mystery: "unknown",
  });
  const policy = { only: ["code"] as const };
  const result = await inventory({
    root,
    policy,
    includePaths: true,
    signal: new AbortController().signal,
  });
  expect(result.paths).toEqual(["Makefile", "data/worker.py", "src/main.ts"]);
  expect(result.excluded).toEqual({ "file_type:data": 1, "file_type:unknown": 1 });
  const reader = await createFilesystem({ root, policy, limits: { maxFileBytes: 50 } });
  try {
    expect(await reader.readSnapshot("data/events.jsonl")).toEqual({
      status: "excluded",
      reason: "file_type:data",
    });
    expect(await reader.lookupFile("data/events.jsonl")).toEqual({
      status: "excluded",
      reason: "file_type:data",
    });
    expect(await reader.readSnapshot("src/main.ts")).toMatchObject({ status: "ok" });
  } finally {
    await reader.close();
  }
});

test("categories are a union, exclusions win, and repository overrides disambiguate filenames", async () => {
  const root = await fixture({
    ".jevgrep-types.json": JSON.stringify({
      "*.json": "config",
      "fixtures/**": "data",
      "bin/*": "code",
    }),
    "package.json": "{}",
    "records.json": "{}",
    "fixtures/settings.json": "{}",
    "bin/worker": "#!/bin/sh\necho ready",
    "unknown.blob": "text",
    "readme.MD": "guide",
    "audio.MP3": "sound",
    "video.mp4": "video",
    "bundle.tar.gz": "archive",
    "server.log.2.gz": "log",
    "scratch.py~": "backup",
    "actual.py": "print('ready')",
  });
  const signal = new AbortController().signal;
  for (const [type, paths] of [
    ["code", ["actual.py", "bin/worker"]],
    ["config", ["package.json", "records.json"]],
    ["data", ["fixtures/settings.json"]],
    ["docs", ["readme.MD"]],
    ["audio", ["audio.MP3"]],
    ["video", ["video.mp4"]],
    ["archives", ["bundle.tar.gz"]],
    ["logs", ["server.log.2.gz"]],
    ["temp", ["scratch.py~"]],
    ["unknown", ["unknown.blob"]],
  ] as const) {
    const result = await inventory({ root, signal, includePaths: true, policy: { only: [type] } });
    expect(result.paths).toEqual([...paths]);
  }
  expect(
    (
      await inventory({
        root,
        signal,
        includePaths: true,
        policy: { only: ["code", "config"], excludeTypes: ["config"] },
      })
    ).paths,
  ).toEqual(["actual.py", "bin/worker"]);
  expect(
    (
      await inventory({
        root,
        signal,
        includePaths: true,
        policy: {
          excludeTypes: [
            "code",
            "config",
            "docs",
            "audio",
            "video",
            "archives",
            "logs",
            "temp",
            "data",
          ],
        },
      })
    ).paths,
  ).toEqual(["unknown.blob"]);
});

test("type selection never overrides explicit exclusions, ignore rules, or sensitive and binary checks", async () => {
  const root = await fixture({
    ".gitignore": "ignored.py\n",
    ".ignore": "blocked.py\n",
    "ignored.py": "pass",
    "blocked.py": "pass",
    "excluded.py": "pass",
    "keep.py": "pass",
    "credentials.json": "{}",
    "binary.py": "\u0000",
    ".hidden.py": "pass",
    "node_modules/dependency.py": "pass",
  });
  const policy = { only: ["code", "data"] as const, exclude: ["excluded.py"] };
  expect(
    (await inventory({ root, policy, includePaths: true, signal: new AbortController().signal }))
      .paths,
  ).toEqual(["binary.py", "keep.py"]);
  const reader = await createFilesystem({ root, policy });
  try {
    expect(await reader.readSnapshot("binary.py")).toMatchObject({
      status: "excluded",
      reason: "binary",
    });
    expect(await reader.readSnapshot("credentials.json")).toMatchObject({
      status: "excluded",
      reason: "sensitive_name",
    });
    expect(await reader.readSnapshot("ignored.py")).toMatchObject({
      status: "excluded",
      reason: "ignored",
    });
    expect(await reader.readSnapshot("excluded.py")).toMatchObject({
      status: "excluded",
      reason: "exclude_pattern",
    });
  } finally {
    await reader.close();
  }
});

test("invalid repository mappings fail closed only when category filtering is requested", async () => {
  const root = await fixture({ ".jevgrep-types.json": "{bad json", "a.py": "pass" });
  const signal = new AbortController().signal;
  expect((await inventory({ root, signal, includePaths: true })).paths).toEqual(["a.py"]);
  for (const contents of [
    "{bad json",
    "[]",
    "null",
    '{"*.py":"coed"}',
    '{"!*.py":"code"}',
    '{"*.py":null}',
  ]) {
    await writeFile(join(root, ".jevgrep-types.json"), contents);
    await expect(inventory({ root, signal, policy: { only: ["code"] } })).rejects.toThrow(
      ".jevgrep-types.json",
    );
  }
});

test("standard configuration dotfiles still require the independent hidden and sensitive flags", async () => {
  const root = await fixture({
    ".editorconfig": "root = true",
    ".env": "MODE=dev",
    ".env.local": "MODE=dev",
    "settings.env": "MODE=dev",
  });
  const signal = new AbortController().signal;
  expect(
    (
      await inventory({
        root,
        signal,
        includePaths: true,
        policy: { only: ["config"], hidden: true, includeSensitive: true },
      })
    ).paths,
  ).toEqual([".editorconfig", ".env", ".env.local", "settings.env"]);
  expect(
    (
      await inventory({
        root,
        signal,
        includePaths: true,
        policy: { only: ["config"], hidden: true },
      })
    ).paths,
  ).toEqual([".editorconfig"]);
});

test("adding, editing or removing a category mapping invalidates the active reader", async () => {
  const root = await fixture({ "a.ts": "export const ready = true;" });
  const config = join(root, ".jevgrep-types.json");
  for (const mode of ["add", "edit", "remove"]) {
    if (mode !== "add") await writeFile(config, '{"*.ts":"code"}');
    const reader = await createFilesystem({ root, policy: { only: ["code"] } });
    try {
      expect(await reader.readSnapshot("a.ts")).toMatchObject({ status: "ok" });
      if (mode === "remove") await rm(config);
      else await writeFile(config, '{"*.ts":"data"}');
      expect(await reader.readSnapshot("a.ts")).toEqual({
        status: "issue",
        issue: { kind: "changed", path: ".jevgrep-types.json" },
      });
    } finally {
      await reader.close();
    }
  }
});

test("same-tick equal-size mapping edits are detected even when metadata is unchanged", async () => {
  const root = await fixture({
    ".jevgrep-types.json": '{"*.ts":"code"}',
    "a.ts": "export const ready = true;",
  });
  const config = join(root, ".jevgrep-types.json");
  const initial = await lstat(config, { bigint: true });
  const probe = await open(config);
  const prototype = Object.getPrototypeOf(probe);
  const originalStat = prototype.stat;
  await probe.close();
  const originalLstat = fs.lstat;
  // Model a coarse filesystem clock at the OS boundary, retaining real file bytes and identities.
  const pin = (stat: typeof initial) => {
    if (stat.ino === initial.ino && stat.dev === initial.dev) {
      stat.mtimeNs = initial.mtimeNs;
      stat.ctimeNs = initial.ctimeNs;
    }
    return stat;
  };
  const lstatSpy = spyOn(fs, "lstat").mockImplementation(async (...args) =>
    pin((await originalLstat(...args)) as typeof initial),
  );
  const statSpy = spyOn(prototype, "stat").mockImplementation(async function (
    this: unknown,
    ...args: unknown[]
  ) {
    return pin(await originalStat.apply(this, args));
  });
  let reader: Awaited<ReturnType<typeof createFilesystem>> | undefined;
  try {
    reader = await createFilesystem({ root, policy: { only: ["code"] } });
    expect(await reader.readSnapshot("a.ts")).toMatchObject({ status: "ok" });
    await writeFile(config, '{"*.ts":"data"}');
    expect(await reader.readSnapshot("a.ts")).toEqual({
      status: "issue",
      issue: { kind: "changed", path: ".jevgrep-types.json" },
    });
  } finally {
    lstatSpy.mockRestore();
    statSpy.mockRestore();
    await reader?.close();
  }
});
