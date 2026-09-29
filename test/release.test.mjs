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
  bundleDependencies: ["typescript", "pyodide"],
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
  for (const [name, version] of Object.entries(metadata.dependencies)) {
    await mkdir(join(pkg, "node_modules", name), { recursive: true });
    await writeFile(
      join(pkg, "node_modules", name, "package.json"),
      JSON.stringify({ name, version }),
    );
  }
  const tarball = join(root, "package.tgz"),
    pack = () => execute("tar", ["-czf", tarball, "-C", archiveRoot, "package"]);
  const { validateRelease } = await import("../scripts/validate-release.mjs");
  await pack();
  assert.equal((await validateRelease(tarball, "v1.2.3", root)).version, "1.2.3");
  await writeFile(
    join(pkg, "package.json"),
    JSON.stringify({ ...metadata, bundleDependencies: [...metadata.bundleDependencies].reverse() }),
  );
  await pack();
  assert.equal((await validateRelease(tarball, "v1.2.3", root)).version, "1.2.3");
  await writeFile(join(pkg, "package.json"), JSON.stringify(metadata));
  // A newly authored (including scoped) runtime dependency is allowed without
  // updating a parser-specific archive path list; unrelated payloads are not.
  const expanded = {
    ...metadata,
    dependencies: { ...metadata.dependencies, "@fixture/parser": "1.0.0" },
    bundleDependencies: [...metadata.bundleDependencies, "@fixture/parser"],
  };
  await writeFile(join(root, "apps/cli/package.json"), JSON.stringify(expanded));
  await writeFile(join(pkg, "package.json"), JSON.stringify(expanded));
  await mkdir(join(pkg, "node_modules/@fixture/parser"), { recursive: true });
  await writeFile(
    join(pkg, "node_modules/@fixture/parser/package.json"),
    JSON.stringify({ name: "@fixture/parser", version: "1.0.0" }),
  );
  await pack();
  assert.equal((await validateRelease(tarball, "v1.2.3", root)).version, "1.2.3");
  await mkdir(join(pkg, "node_modules/@fixture/parser-extra"));
  await writeFile(join(pkg, "node_modules/@fixture/parser-extra/leak.txt"), "not a dependency");
  await pack();
  await assert.rejects(validateRelease(tarball, "v1.2.3", root), /Unexpected published file/);
  await rm(join(pkg, "node_modules/@fixture/parser-extra"), { recursive: true });
  await writeFile(join(root, "apps/cli/package.json"), JSON.stringify(metadata));
  await pack();
  await assert.rejects(validateRelease(tarball, "v1.2.3", root), /Packed runtime dependencies/);
  await writeFile(join(pkg, "package.json"), JSON.stringify(metadata));
  await rm(join(pkg, "node_modules/@fixture"), { recursive: true });
  await writeFile(
    join(pkg, "node_modules/typescript/package.json"),
    JSON.stringify({ name: "typescript", version: "0.0.1" }),
  );
  await pack();
  await assert.rejects(validateRelease(tarball, "v1.2.3", root), /differs from release metadata/);
  await writeFile(
    join(pkg, "node_modules/typescript/package.json"),
    JSON.stringify({ name: "typescript", version: metadata.dependencies.typescript }),
  );
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

test("bundled Python runtime notices retain conflicting metadata and component provenance", async () => {
  const { pythonRuntimeNotices } = await import("../scripts/package-notices.mjs");
  const notices = await pythonRuntimeNotices("0.25.1");
  assert.match(notices, /Mozilla Public License Version 2.0/);
  assert.match(notices, /PYTHON SOFTWARE FOUNDATION LICENSE VERSION 2/);
  assert.match(notices, /CPython 3.11.3/);
  assert.match(notices, /github.com\/pyodide\/pyodide\/tree\/0.25.1/);
  assert.match(notices, /Apache License/);
  await assert.rejects(pythonRuntimeNotices("0.26.0"), /Review Python runtime notices/);
});

test("runtime materialization rejects stale transitives and unsupported graphs before replacing CLI copies", async (t) => {
  const { mkdtemp, mkdir, readFile, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { bundleRuntime } = await import("../scripts/runtime-bundle.mjs");
  const root = await mkdtemp(join(tmpdir(), "jg-runtime-tree-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const parser = join(root, "node_modules/parser");
  const child = join(parser, "node_modules/child");
  const target = join(root, "cli/node_modules");
  await mkdir(child, { recursive: true });
  await writeFile(join(root, "package.json"), "{}");
  const parserMetadata = { name: "parser", version: "1.0.0", dependencies: { child: "^2.0.0" } };
  const childMetadata = {
    name: "child",
    version: "2.1.0",
    peerDependencies: { accelerator: "*" },
    peerDependenciesMeta: { accelerator: { optional: true } },
  };
  const writeChild = (metadata) => writeFile(join(child, "package.json"), JSON.stringify(metadata));
  await writeFile(join(parser, "package.json"), JSON.stringify(parserMetadata));
  await writeFile(join(parser, "index.js"), "parser bytes");
  await writeFile(join(child, "index.js"), "child bytes");
  await writeChild(childMetadata);
  const packages = {
    parser: ["parser@1.0.0", "", { dependencies: { child: "^2.0.0" } }],
    child: ["child@2.1.0", "", {}],
  };
  const build = () =>
    bundleRuntime({ parser: "1.0.0" }, join(root, "package.json"), target, packages);
  await build();
  assert.equal(
    await readFile(join(target, "parser/node_modules/child/index.js"), "utf8"),
    "child bytes",
  );
  assert.equal(await readFile(join(target, "parser/index.js"), "utf8"), "parser bytes");
  await writeFile(join(target, "parser/retained.txt"), "previous successful build");

  for (const [metadata, expected] of [
    [{ ...childMetadata, version: "2.2.0" }, /does not match bun.lock/],
    [{ ...childMetadata, optionalDependencies: { extra: "*" } }, /Unsupported optional/],
    [{ ...childMetadata, peerDependenciesMeta: {} }, /Unsupported required runtime peer/],
  ]) {
    await writeChild(metadata);
    await assert.rejects(build(), expected);
    assert.equal(
      await readFile(join(target, "parser/retained.txt"), "utf8"),
      "previous successful build",
    );
  }
  await writeFile(
    join(parser, "package.json"),
    JSON.stringify({ ...parserMetadata, dependencies: {} }),
  );
  await assert.rejects(build(), /dependency edges.*do not match bun.lock/);
  await writeFile(join(parser, "package.json"), JSON.stringify(parserMetadata));
  await writeChild(childMetadata);
  packages["another/child"] = ["child@2.2.0", "", {}];
  await assert.rejects(build(), /does not match bun.lock/);
  delete packages["another/child"];
  await writeChild({ ...childMetadata, dependencies: { parser: "1.0.0" } });
  packages.child[2] = { dependencies: { parser: "1.0.0" } };
  await assert.rejects(build(), /Cyclic runtime dependency/);
  packages.child[2] = {};
  await writeChild(childMetadata);

  // Resolution may find a previous CLI copy on a repeat build. Stage before
  // replacing it so the materializer never removes its own input.
  await bundleRuntime({ parser: "1.0.0" }, join(root, "cli/package.json"), target, packages);
  assert.equal(
    await readFile(join(target, "parser/node_modules/child/index.js"), "utf8"),
    "child bytes",
  );
});
