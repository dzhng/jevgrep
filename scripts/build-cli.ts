import { chmod, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { grammarAssets } from "./parser-assets.mjs";

import { bundledNotices } from "./package-notices.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = join(root, "apps/cli/dist");
const grammarNotices = await grammarAssets(root, true);
await rm(out, { recursive: true, force: true });
await mkdir(join(out, "bin"), { recursive: true });
const build = await Bun.build({
  entrypoints: [join(root, "apps/cli/src/index.ts")],
  outdir: join(out, "bin"),
  target: "node",
  format: "esm",
  metafile: true,
  external: ["web-tree-sitter", "typescript"],
});
if (!build.success) throw new AggregateError(build.logs, "CLI build failed");
await chmod(join(out, "bin/index.js"), 0o755);
await writeFile(
  join(out, "THIRD_PARTY_NOTICES.txt"),
  (await bundledNotices(build.metafile!, process.cwd())) + grammarNotices,
);
for (const name of ["parser-worker", "parser-helpers", "parser-preview", "parser-declarations"])
  await cp(join(root, `packages/core/src/${name}.mjs`), join(out, `bin/${name}.mjs`));
await cp(join(root, "LICENSE"), join(out, "LICENSE"));
await cp(join(root, "packages/core/assets"), join(out, "assets"), { recursive: true });
const skill = join(out, "skills/jevgrep/SKILL.md");
await mkdir(dirname(skill), { recursive: true });
await cp(join(root, "skills/jevgrep/SKILL.md"), skill);
