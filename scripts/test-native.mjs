#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { release, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
const execute = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
let scratch;
try {
  assert.equal(
    process.platform,
    "darwin",
    "Native smoke requires macOS; use test-installed.sh for Linux",
  );
  assert.equal(process.arch, "arm64", "This native gate covers macOS Apple Silicon");
  assert.ok(Number(process.versions.node.split(".")[0]) >= 22, "Node >=22 is required");
  const args = process.argv.slice(2);
  assert.ok(
    args.length === 0 || (args.length === 2 && args[0] === "--prebuilt"),
    "Usage: node scripts/test-native.mjs [--prebuilt package.tgz]",
  );
  scratch = await mkdtemp(join(tmpdir(), "jg-native-"));
  const home = join(scratch, "home"),
    config = join(scratch, "config"),
    cache = join(scratch, "cache"),
    runtimeBin = join(scratch, "runtime-bin");
  await Promise.all([home, config, cache, runtimeBin].map((path) => mkdir(path)));
  const npmrc = join(scratch, "npmrc");
  await writeFile(npmrc, "");
  // Development tooling may build/pack; none of its environment reaches the installed app.
  const setupEnv = {
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    HOME: home,
    XDG_CONFIG_HOME: config,
    XDG_CACHE_HOME: cache,
    TMPDIR: scratch,
    npm_config_cache: join(scratch, "npm-cache"),
    npm_config_userconfig: npmrc,
    npm_config_registry: "https://registry.npmjs.org",
    NODE_AUTH_TOKEN: "",
  };
  let tarball;
  if (args.length) {
    tarball = join(scratch, "candidate.tgz");
    await cp(resolve(args[1]), tarball);
  } else {
    await execute("bun", ["run", "--cwd", "apps/cli", "build"], {
      cwd: root,
      env: { ...setupEnv, PATH: process.env.PATH },
      timeout: 120_000,
      maxBuffer: 8_000_000,
    });
    const packed = await execute(
      "npm",
      ["pack", "./apps/cli", "--json", "--ignore-scripts", "--pack-destination", scratch],
      {
        cwd: root,
        env: setupEnv,
        timeout: 120_000,
        maxBuffer: 8_000_000,
      },
    );
    const packages = JSON.parse(packed.stdout);
    assert.equal(packages.length, 1);
    tarball = join(scratch, packages[0].filename);
  }
  const integrity = createHash("sha256")
    .update(await readFile(tarball))
    .digest("hex");
  const prefix = join(scratch, "prefix");
  await execute(
    "npm",
    [
      "install",
      "--global",
      "--prefix",
      prefix,
      "--ignore-scripts",
      "--offline",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      tarball,
    ],
    {
      cwd: scratch,
      env: setupEnv,
      timeout: 180_000,
      maxBuffer: 8_000_000,
    },
  );
  const binary = join(prefix, "bin/jg");
  const packageDirectory = await realpath(join(prefix, "lib/node_modules/@dzhng/jevgrep"));
  assert.ok(
    (await realpath(binary)).startsWith(`${packageDirectory}/`),
    "Executable must belong to the fresh npm install",
  );
  const skill = join(scratch, "canonical-skill.md");
  await cp(process.env.JEVGREP_CANONICAL_SKILL || join(root, "skills/jevgrep/SKILL.md"), skill);
  const preload = join(scratch, "provider-route.mjs");
  await cp(join(root, "test/fixtures/provider-route.mjs"), preload);
  await symlink(process.execPath, join(runtimeBin, "node"));
  const runtimeEnv = {
    PATH: runtimeBin,
    HOME: home,
    XDG_CONFIG_HOME: config,
    XDG_CACHE_HOME: cache,
    TMPDIR: scratch,
    JEVGREP_TEST_PROVIDER_PRELOAD: pathToFileURL(preload).href,
    JEVGREP_INSTALLED_BINARY: binary,
    JEVGREP_INSTALLED_PACKAGE: packageDirectory,
    JEVGREP_EXPECTED_SKILL: skill,
    JEVGREP_TEST_PATH: runtimeBin,
  };
  for (const command of ["python3", "bun", "cc", "gcc", "clang", "make"])
    assert.equal(
      spawnSync(command, ["--version"], { env: runtimeEnv }).error?.code,
      "ENOENT",
      `${command} must not resolve in the installed runtime PATH`,
    );
  console.log(
    `Native proof: ${process.platform}/${process.arch} ${release()}; Node ${process.version}; tarball SHA-256 ${integrity}`,
  );
  const tested = await execute(
    process.execPath,
    [
      "--test",
      "--test-reporter=tap",
      "--test-concurrency=1",
      "--test-name-pattern",
      "^(installed local commands match the package without credentials|skill command delegates installation to npx without credentials|actual installed search parses Python and returns every relevant hierarchy branch|installed saved-provider journey: (vercel|typesafe|openrouter) auth doctor search cache replacement|installed legacy credentials use Vercel without rewriting saved bytes|installed saved credentials defeat conflicting environment and environment-only auth fails|installed invalid saved providers fail before HTTP without rewriting credentials|installed invalid auth preserves saved bytes and leaves no temporary credentials)$",
      join(root, "test/installed.test.mjs"),
    ],
    { cwd: scratch, env: runtimeEnv, timeout: 120_000, maxBuffer: 8_000_000 },
  );
  assert.equal(tested.stderr, "");
  assert.match(
    tested.stdout,
    /^# pass 10$/m,
    "All native smoke journeys must execute; renamed selectors cannot silently pass",
  );
  console.log(tested.stdout.trimEnd());
  console.log(
    "Native installed smoke passed; all fixtures, credentials, cache and installation were temporary.",
  );
} catch (error) {
  if (error.stdout) console.log(String(error.stdout).trimEnd());
  if (error.stderr) console.log(String(error.stderr).trimEnd());
  console.log(`Native installed smoke failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (scratch) await rm(scratch, { recursive: true, force: true });
}
