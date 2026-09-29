import { createRequire } from "node:module";
import { cp, mkdir, mkdtemp, readFile, realpath, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

// The parser runtime currently uses one locked version per package, ordinary
// dependencies, and optional peers. Reject other graphs rather than omitting code.
export async function bundleRuntime(dependencies, from, target, packages) {
  const plan = [];
  async function visit(name, parent, relative, ancestors, requiredVersion) {
    const manifest = await realpath(createRequire(parent).resolve(`${name}/package.json`));
    if (ancestors.has(manifest)) throw new Error(`Cyclic runtime dependency: ${name}`);
    const metadata = JSON.parse(await readFile(manifest, "utf8"));
    const versions = new Set(
      Object.values(packages)
        .map((entry) => entry[0])
        .filter((id) => id.startsWith(`${name}@`))
        .map((id) => id.slice(name.length + 1)),
    );
    if (
      versions.size !== 1 ||
      !versions.has(metadata.version) ||
      metadata.name !== name ||
      (requiredVersion !== undefined && metadata.version !== requiredVersion)
    )
      throw new Error(
        `Runtime dependency ${name}@${metadata.version} does not match bun.lock and package metadata; run bun install --frozen-lockfile`,
      );
    const locked = Object.values(packages).find(
      (entry) => entry[0] === `${name}@${metadata.version}`,
    );
    const dependencyEntries = (value) =>
      JSON.stringify(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));
    if (dependencyEntries(metadata.dependencies) !== dependencyEntries(locked[2]?.dependencies))
      throw new Error(`Runtime dependency edges for ${name} do not match bun.lock`);
    if (Object.keys(metadata.optionalDependencies ?? {}).length)
      throw new Error(`Unsupported optional runtime dependencies in ${name}`);
    for (const peer of Object.keys(metadata.peerDependencies ?? {}))
      if (metadata.peerDependenciesMeta?.[peer]?.optional !== true)
        throw new Error(`Unsupported required runtime peer ${peer} in ${name}`);
    plan.push({ source: dirname(manifest), relative });
    const next = new Set([...ancestors, manifest]);
    for (const child of Object.keys(metadata.dependencies ?? {}))
      await visit(child, manifest, join(relative, "node_modules", child), next);
  }
  for (const [name, version] of Object.entries(dependencies))
    await visit(name, from, name, new Set(), version);

  // Check the whole graph before touching CLI links. Stage copies before replacing
  // them, so repeated builds also work if resolution found a previous CLI copy.
  await mkdir(target, { recursive: true });
  const staging = await mkdtemp(join(target, ".jevgrep-runtime-"));
  try {
    for (const { source, relative } of plan)
      await cp(source, join(staging, relative), {
        recursive: true,
        filter: (path) => basename(path) !== "node_modules",
      });
    for (const name of Object.keys(dependencies)) {
      const destination = join(target, name);
      await mkdir(dirname(destination), { recursive: true });
      await rm(destination, { recursive: true, force: true });
      await rename(join(staging, name), destination);
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
