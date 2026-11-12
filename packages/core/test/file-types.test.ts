import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyFile } from "../src/file-types";
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

test("JSON tool configs are config while generic JSON stays data", () => {
  for (const path of [
    "package.json",
    "tsconfig.json",
    "tsconfig.build.json",
    "tsconfig-base.json",
    "jsconfig.json",
    "biome.json",
    "biome.jsonc",
    "eslint.config.json",
    "webpack.config.json",
    ".eslintrc.json",
    ".prettierrc.json",
    ".lintstagedrc.json",
  ])
    expect(classifyFile(path)).toBe("config");
  for (const path of ["records.json", "data/events.json", "fixtures/settings.json"])
    expect(classifyFile(path)).toBe("data");
});

test("recognised code shebangs classify extensionless files as code", () => {
  for (const source of [
    "#!/usr/bin/env python3\nprint('ready')",
    "#!/usr/bin/env -S python3 -u\nprint('ready')",
    "#!/usr/bin/pypy3.11\nprint('ready')",
    "#!/usr/bin/env node\nconsole.log(1)",
    "#!/usr/bin/env bun\nconsole.log(1)",
    "#!/usr/bin/env bun --hot\nconsole.log(1)",
    "#!/usr/bin/env tsx\nconsole.log(1)",
    "#!/usr/bin/env deno run\nconsole.log(1)",
  ])
    expect(classifyFile("bin/tool", source)).toBe("code");
  expect(classifyFile("bin/tool", "#!/bin/sh\necho ready")).toBe("unknown");
  expect(classifyFile("bin/tool", "echo no shebang")).toBe("unknown");
  expect(classifyFile("bin/tool")).toBe("unknown");
});

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

test("categories are a union, exclusions win, and JSON configs stay distinct from data", async () => {
  const root = await fixture({
    "package.json": "{}",
    "biome.json": "{}",
    "tsconfig.build.json": "{}",
    "eslint.config.json": "{}",
    "records.json": "{}",
    "bin/worker": "#!/usr/bin/env bun\nconsole.log('ready')",
    "bin/shell": "#!/bin/sh\necho ready",
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
    ["config", ["biome.json", "eslint.config.json", "package.json", "tsconfig.build.json"]],
    ["data", ["records.json"]],
    ["docs", ["readme.MD"]],
    ["audio", ["audio.MP3"]],
    ["video", ["video.mp4"]],
    ["archives", ["bundle.tar.gz"]],
    ["logs", ["server.log.2.gz"]],
    ["temp", ["scratch.py~"]],
    ["unknown", ["bin/shell", "unknown.blob"]],
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
  ).toEqual(["bin/shell", "unknown.blob"]);
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

test("standard configuration dotfiles still require the independent hidden and sensitive flags", async () => {
  const root = await fixture({
    ".editorconfig": "root = true",
    ".env": "MODE=dev",
    ".env.local": "MODE=dev",
    "settings.env": "MODE=dev",
    ".eslintrc.json": "{}",
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
  ).toEqual([".editorconfig", ".env", ".env.local", ".eslintrc.json", "settings.env"]);
  expect(
    (
      await inventory({
        root,
        signal,
        includePaths: true,
        policy: { only: ["config"], hidden: true },
      })
    ).paths,
  ).toEqual([".editorconfig", ".eslintrc.json"]);
});

test("a .jevgrep-types.json file is not loaded as a classification override", async () => {
  const root = await fixture({
    ".jevgrep-types.json": JSON.stringify({ "*.json": "config", "bin/*": "code" }),
    "records.json": "{}",
    "bin/worker": "echo ready",
    "keep.py": "pass",
  });
  const signal = new AbortController().signal;
  expect(
    (await inventory({ root, signal, includePaths: true, policy: { only: ["code"] } })).paths,
  ).toEqual(["keep.py"]);
  expect(
    (await inventory({ root, signal, includePaths: true, policy: { only: ["data"] } })).paths,
  ).toEqual(["records.json"]);
});
