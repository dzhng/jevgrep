import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

test("skill installer forwards arguments and exit status through the platform launcher", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "jevgrep-skill-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const bin = join(home, "installer with spaces");
  await mkdir(bin);
  const fixture = fileURLToPath(new URL("./fixtures/skill-installer.mjs", import.meta.url));
  const windows = process.platform === "win32";
  await writeFile(
    join(bin, windows ? "npx.cmd" : "npx"),
    windows
      ? `@echo off\r\n"${process.execPath}" "${fixture}" %*\r\n`
      : `#!/bin/sh\nexec "${process.execPath}" "${fixture}" "$@"\n`,
    { mode: 0o755 },
  );
  const cli =
    process.env.JEVGREP_TEST_CLI ??
    fileURLToPath(new URL("../apps/cli/dist/bin/index.js", import.meta.url));
  const result = await promisify(execFile)(
    process.execPath,
    [cli, "skill", "--agent", "claude-code", "--agent", "codex", "--global", "--yes"],
    {
      cwd: home,
      env: {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: home,
        XDG_CACHE_HOME: join(home, "cache"),
        PATH: [bin, dirname(process.execPath), process.env.PATH].join(delimiter),
        JEVGREP_INSTALLER_EXIT: "7",
      },
      timeout: 10000,
    },
  ).then(
    () => assert.fail("The installer exit status must reach the CLI"),
    (error) => error,
  );
  assert.equal(result.code, 7);
  assert.equal(result.stdout, "Installer completed.\n");
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(await readFile(join(home, "installed-skill.json"), "utf8")), [
    "--yes",
    "skills",
    "add",
    "dzhng/jevgrep",
    "--skill",
    "jevgrep",
    "--agent",
    "claude-code",
    "--agent",
    "codex",
    "--global",
    "--yes",
  ]);
});
