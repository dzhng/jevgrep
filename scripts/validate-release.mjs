import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { pythonRuntimeNotices } from "./package-notices.mjs";
const execute = promisify(execFile);
export const repository = fileURLToPath(new URL("../", import.meta.url));

export function releaseIdentity(metadata, tag) {
  const version = metadata.version;
  const match =
    typeof version === "string" &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?$/.exec(
      version,
    );
  if (!match || match[4]?.split(".").some((part) => /^\d+$/.test(part) && /^0\d/.test(part)))
    throw new Error("Release version must be valid SemVer without build metadata");
  if (version === "0.0.0")
    throw new Error("Set an intentional release version; 0.0.0 is a development checkpoint");
  if (tag !== `v${version}`) throw new Error("Tag must equal v plus the CLI package version");
  if (metadata.name !== "@dzhng/jevgrep") throw new Error("Release package must be @dzhng/jevgrep");
  if (metadata.bin?.jg !== "./dist/bin/index.js" || Object.keys(metadata.bin).length !== 1)
    throw new Error("Release must expose only the jg executable");
  if (metadata.private || metadata.publishConfig?.access !== "public")
    throw new Error("Release package must be public");
  if (metadata.license !== "MIT" || metadata.engines?.node !== ">=22")
    throw new Error("Release must retain MIT and Node >=22 contracts");
  for (const [name, version] of Object.entries(metadata.dependencies ?? {}))
    if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version))
      throw new Error(`Runtime dependency ${name} must use an exact registry version`);
  for (const name of ["typescript", "pyodide"])
    if (!metadata.dependencies?.[name])
      throw new Error(`Missing runtime parser dependency ${name}`);
  return { name: metadata.name, version, distTag: match[4] ? "next" : "latest" };
}

export async function validateRelease(tarball, tag, root = repository) {
  tarball = resolve(tarball);
  if ((await stat(tarball)).size > 32_000_000)
    throw new Error("Unexpectedly large release archive");
  const { stdout } = await execute("tar", ["-tzf", tarball], { maxBuffer: 8_000_000 });
  const files = stdout
    .trim()
    .split("\n")
    .filter((name) => !name.endsWith("/"));
  if (new Set(files).size !== files.length) throw new Error("Duplicate archive entries");
  const extract = async (path) => {
    if (!files.includes(`package/${path}`)) throw new Error(`Missing packaged file: ${path}`);
    return (
      await execute("tar", ["-xOf", tarball, `package/${path}`], {
        encoding: "buffer",
        maxBuffer: 8_000_000,
      })
    ).stdout;
  };
  const metadata = JSON.parse((await extract("package.json")).toString());
  const identity = releaseIdentity(metadata, tag);
  const authored = JSON.parse(await readFile(resolve(root, "apps/cli/package.json"), "utf8"));
  if (JSON.stringify(releaseIdentity(authored, tag)) !== JSON.stringify(identity))
    throw new Error("Packed identity differs from authored CLI metadata");
  if (
    JSON.stringify(Object.entries(metadata.dependencies).sort()) !==
    JSON.stringify(Object.entries(authored.dependencies).sort())
  )
    throw new Error("Packed runtime dependencies differ from authored CLI metadata");
  const runtimePrefixes = Object.keys(metadata.dependencies).map(
    (name) => `package/node_modules/${name}/`,
  );
  for (const path of files)
    if (
      !/^package\/(?:package\.json|README(?:\.md)?|LICENSE|dist\/(?:bin\/(?:index\.js|python-worker\.mjs)|assets\/(?:python\/(?:inspect|preview|neighborhood|calls)\.py|README\.md)|skills\/jevgrep\/SKILL\.md|LICENSE|THIRD_PARTY_NOTICES\.txt))$/.test(
        path,
      )
    )
      if (
        !runtimePrefixes.some((prefix) => path.startsWith(prefix)) ||
        path.split("/").some((part) => part === ".." || part === "." || !part)
      )
        throw new Error(`Unexpected published file: ${path}`);
  const listing = await execute("tar", ["-tvzf", tarball], { maxBuffer: 8_000_000 });
  if (listing.stdout.split("\n").some((line) => line && !["-", "d"].includes(line[0])))
    throw new Error("Release archive cannot contain links or special files");
  if (
    JSON.stringify([...(metadata.bundleDependencies ?? [])].sort()) !==
    JSON.stringify(Object.keys(metadata.dependencies).sort())
  )
    throw new Error("Every runtime dependency must be bundled");
  for (const [name, version] of Object.entries(metadata.dependencies)) {
    const bundled = JSON.parse((await extract(`node_modules/${name}/package.json`)).toString());
    if (bundled.name !== name || bundled.version !== version)
      throw new Error(`Bundled runtime dependency ${name} differs from release metadata`);
  }
  const binary = (await extract("dist/bin/index.js")).toString();
  if (!binary.startsWith("#!/usr/bin/env node\n"))
    throw new Error("Packed executable must run in Node");
  for (const [packed, original] of [
    ["dist/LICENSE", "LICENSE"],
    ["dist/skills/jevgrep/SKILL.md", "skills/jevgrep/SKILL.md"],
    ["dist/bin/python-worker.mjs", "packages/core/src/python-worker.mjs"],
    ...["inspect", "preview", "neighborhood", "calls"].map((name) => [
      `dist/assets/python/${name}.py`,
      `packages/core/assets/python/${name}.py`,
    ]),
  ])
    if (!(await extract(packed)).equals(await readFile(resolve(root, original))))
      throw new Error(`Packaged ${packed} differs from its canonical source`);
  const notices = (await extract("dist/THIRD_PARTY_NOTICES.txt")).toString();
  if (
    !notices.startsWith("Third-party notices for bundled JavaScript dependencies\n") ||
    !notices.includes("=== ") ||
    !notices.endsWith(await pythonRuntimeNotices(metadata.dependencies.pyodide))
  )
    throw new Error("Missing bundled dependency license notices");
  const integrity = `sha512-${createHash("sha512")
    .update(await readFile(tarball))
    .digest("base64")}`;
  return { ...identity, tarball, integrity, files };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [tarball, tag, expectedIntegrity] = process.argv.slice(2);
    if (!tarball || !tag)
      throw new Error(
        "Usage: node scripts/validate-release.mjs package.tgz vVERSION [expected-integrity]",
      );
    const result = await validateRelease(tarball, tag);
    if (expectedIntegrity && result.integrity !== expectedIntegrity)
      throw new Error("Registry tarball differs from the verified release artifact");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.log(`Release validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
