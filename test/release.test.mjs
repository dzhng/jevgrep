import { test } from "node:test";
import assert from "node:assert/strict";
import { releaseIdentity } from "../scripts/validate-release.mjs";
const metadata = {
  name: "@dzhng/jevgrep",
  version: "1.2.3",
  bin: { jg: "./dist/bin/index.js" },
  publishConfig: { access: "public" },
  license: "MIT",
  engines: { node: ">=22" },
  dependencies: { typescript: "5.9.3", pyodide: "0.25.1" },
};
test("release tags select the authored version and keep prereleases off latest", () => {
  assert.deepEqual(releaseIdentity(metadata, "v1.2.3"), {
    name: "@dzhng/jevgrep",
    version: "1.2.3",
    distTag: "latest",
  });
  assert.equal(
    releaseIdentity({ ...metadata, version: "1.3.0-rc.1" }, "v1.3.0-rc.1").distTag,
    "next",
  );
  for (const [value, tag] of [
    [metadata, "v1.2.4"],
    [{ ...metadata, version: "0.0.0" }, "v0.0.0"],
    [{ ...metadata, version: "1.2.3-01" }, "v1.2.3-01"],
    [{ ...metadata, name: "jevgrep" }, "v1.2.3"],
    [{ ...metadata, bin: { jevgrep: "./dist/bin/index.js" } }, "v1.2.3"],
  ])
    assert.throws(() => releaseIdentity(value, tag));
});

test("bundled notices retain emitted dependency licenses and exclude unbundled modules", async (t) => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "jg-notices-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dependency = join(root, "node_modules/example");
  await mkdir(dependency, { recursive: true });
  await writeFile(
    join(dependency, "package.json"),
    JSON.stringify({ name: "example", version: "1.0.0", license: "MIT" }),
  );
  await writeFile(join(dependency, "LICENSE"), "MIT license fixture: preserve this copyright.\n");
  const { bundledNotices } = await import("../scripts/package-notices.mjs");
  const text = await bundledNotices(
    {
      outputs: {
        "index.js": {
          inputs: {
            "node_modules/example/index.js": { bytesInOutput: 10 },
            "node_modules/removed/index.js": { bytesInOutput: 0 },
            "src/index.ts": { bytesInOutput: 50 },
          },
        },
      },
    },
    root,
  );
  assert.ok(text.includes("example@1.0.0"));
  assert.ok(text.includes("MIT license fixture: preserve this copyright.\n"));
  assert.ok(!text.includes("removed"));
  await rm(join(dependency, "LICENSE"));
  await assert.rejects(
    bundledNotices(
      {
        outputs: {
          "index.js": { inputs: { "node_modules/example/index.js": { bytesInOutput: 10 } } },
        },
      },
      root,
    ),
    /license/i,
  );
});

test("archive validation rejects changed skill bytes and accidental source payloads", async (t) => {
  const { mkdtemp, mkdir, writeFile, rm, cp, chmod } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execute = promisify(execFile),
    root = await mkdtemp(join(tmpdir(), "jg-release-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = {
    "apps/cli/package.json": JSON.stringify(metadata),
    LICENSE: "MIT canonical copyright\n",
    "skills/jevgrep/SKILL.md": "Use jg for unfamiliar code.\n",
    "packages/core/src/python-worker.mjs": "// worker fixture",
    ...Object.fromEntries(
      ["inspect", "preview", "neighborhood", "calls"].map((name) => [
        `packages/core/assets/python/${name}.py`,
        `# ${name} helper fixture`,
      ]),
    ),
  };
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), text);
  }
  const archiveRoot = join(root, "archive"),
    pkg = join(archiveRoot, "package");
  await mkdir(join(pkg, "dist/bin"), { recursive: true });
  await mkdir(join(pkg, "dist/skills/jevgrep"), { recursive: true });
  await mkdir(join(pkg, "dist/assets/python"), { recursive: true });
  for (const [from, to] of [
    ["apps/cli/package.json", "package.json"],
    ["LICENSE", "dist/LICENSE"],
    ["skills/jevgrep/SKILL.md", "dist/skills/jevgrep/SKILL.md"],
    ["packages/core/src/python-worker.mjs", "dist/bin/python-worker.mjs"],
    ...["inspect", "preview", "neighborhood", "calls"].map((name) => [
      `packages/core/assets/python/${name}.py`,
      `dist/assets/python/${name}.py`,
    ]),
  ])
    await cp(join(root, from), join(pkg, to));
  await writeFile(join(pkg, "dist/bin/index.js"), '#!/usr/bin/env node\nconsole.log("jg");\n');
  await chmod(join(pkg, "dist/bin/index.js"), 0o755);
  const { pythonRuntimeNotices } = await import("../scripts/package-notices.mjs");
  await writeFile(
    join(pkg, "dist/THIRD_PARTY_NOTICES.txt"),
    "Third-party notices for bundled JavaScript dependencies\n\n=== example@1.0.0 (MIT) ===\nFixture license\n" +
      (await pythonRuntimeNotices("0.25.1")),
  );
  const tarball = join(root, "package.tgz"),
    pack = () => execute("tar", ["-czf", tarball, "-C", archiveRoot, "package"]);
  const { validateRelease } = await import("../scripts/validate-release.mjs");
  await pack();
  assert.equal((await validateRelease(tarball, "v1.2.3", root)).version, "1.2.3");
  await writeFile(join(pkg, "dist/bin/python-worker.mjs"), "changed worker");
  await pack();
  await assert.rejects(validateRelease(tarball, "v1.2.3", root), /canonical source/);
  await cp(
    join(root, "packages/core/src/python-worker.mjs"),
    join(pkg, "dist/bin/python-worker.mjs"),
  );
  await rm(join(pkg, "dist/assets/python/inspect.py"));
  await pack();
  await assert.rejects(validateRelease(tarball, "v1.2.3", root), /Missing packaged file/);
  await cp(
    join(root, "packages/core/assets/python/inspect.py"),
    join(pkg, "dist/assets/python/inspect.py"),
  );
  await writeFile(join(pkg, "dist/skills/jevgrep/SKILL.md"), "Changed skill");
  await pack();
  await assert.rejects(validateRelease(tarball, "v1.2.3", root), /canonical source/);
  await cp(join(root, "skills/jevgrep/SKILL.md"), join(pkg, "dist/skills/jevgrep/SKILL.md"));
  await writeFile(join(pkg, "dist/assets/customer-data.json"), "Do not publish");
  await pack();
  await assert.rejects(validateRelease(tarball, "v1.2.3", root), /Unexpected published file/);
  await rm(join(pkg, "dist/assets/customer-data.json"));
  await mkdir(join(pkg, "evals"));
  await writeFile(join(pkg, "evals/personal.txt"), "Do not publish");
  await pack();
  await assert.rejects(validateRelease(tarball, "v1.2.3", root), /Unexpected published file/);
});

test("external Python runtime notices retain conflicting metadata and component provenance", async () => {
  const { pythonRuntimeNotices } = await import("../scripts/package-notices.mjs");
  const notices = await pythonRuntimeNotices("0.25.1");
  assert.match(notices, /Mozilla Public License Version 2.0/);
  assert.match(notices, /PYTHON SOFTWARE FOUNDATION LICENSE VERSION 2/);
  assert.match(notices, /CPython 3.11.3/);
  assert.match(notices, /github.com\/pyodide\/pyodide\/tree\/0.25.1/);
  assert.match(notices, /Apache License/);
  await assert.rejects(pythonRuntimeNotices("0.26.0"), /Review Python runtime notices/);
});

test("publish job binds archive identity and dist-tag to the pushed tag", async (t) => {
  const { mkdtemp, mkdir, readFile, writeFile, rm, appendFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync, spawnSync } = await import("node:child_process");
  const { createHash } = await import("node:crypto");
  const workflow = await readFile(
    new URL("../.github/workflows/publish.yml", import.meta.url),
    "utf8",
  );
  const inline = workflow
    .match(/node --input-type=module <<'NODE'\n([\s\S]*?)\n          NODE/)[1]
    .split("\n")
    .map((line) => line.slice(10))
    .join("\n");
  const root = await mkdtemp(join(tmpdir(), "jg-publish-check-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "package"));
  await mkdir(join(root, "jevgrep-release"));
  const check = (env) =>
    spawnSync(process.execPath, ["--input-type=module", "-e", inline], {
      env: { ...process.env, RUNNER_TEMP: root, ...env },
      encoding: "utf8",
    });
  async function pack(version, packageMetadata = { name: "@dzhng/jevgrep", version }) {
    await writeFile(join(root, "package/package.json"), JSON.stringify(packageMetadata));
    const archive = join(root, "jevgrep-release", `dzhng-jevgrep-${version}.tgz`);
    execFileSync("tar", ["-czf", archive, "-C", root, "package"]);
    const env = {
      RELEASE_VERSION: version,
      GITHUB_REF_NAME: `v${version}`,
      RELEASE_DIST_TAG: version.includes("-") ? "next" : "latest",
      RELEASE_INTEGRITY:
        "sha512-" +
        createHash("sha512")
          .update(await readFile(archive))
          .digest("base64"),
    };
    return { archive, env };
  }
  const { archive, env } = await pack("1.2.3");
  assert.equal(check(env).status, 0);
  for (const [overrides, message] of [
    [{ GITHUB_REF_NAME: "v99.0.0" }, /pushed tag/],
    [{ RELEASE_DIST_TAG: "next" }, /Unexpected dist-tag/],
    [{ RELEASE_DIST_TAG: "custom" }, /Unexpected dist-tag/],
    ...["../x", "01.2.3", "1.2.3-01", "0.0.0", "1.2.3+build"].map((version) => [
      { RELEASE_VERSION: version },
      /Invalid release version/,
    ]),
  ]) {
    const result = check({ ...env, ...overrides });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, message);
  }
  await appendFile(archive, "tampered");
  assert.match(check(env).stderr, /integrity mismatch/);
  for (const packageMetadata of [
    { name: "@dzhng/jevgrep", version: "99.0.0" },
    { name: "another-package", version: "1.2.3" },
  ]) {
    const packed = await pack("1.2.3", packageMetadata);
    const result = check(packed.env);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /package identity mismatch/);
  }
  const prerelease = await pack("1.3.0-rc.1");
  assert.equal(check(prerelease.env).status, 0);
  assert.match(
    check({ ...prerelease.env, RELEASE_DIST_TAG: "latest" }).stderr,
    /Unexpected dist-tag/,
  );
});
