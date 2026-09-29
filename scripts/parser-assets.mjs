import { createRequire } from "node:module";
import { readFile, mkdir, cp } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export const grammars = ["python", "go", "rust"];
export async function grammarAssets(
  root = fileURLToPath(new URL("../", import.meta.url)),
  copy = false,
) {
  const require = createRequire(join(root, "packages/core/package.json"));
  const core = JSON.parse(await readFile(join(root, "packages/core/package.json"), "utf8"));
  const destination = join(root, "packages/core/assets/tree-sitter");
  if (copy) await mkdir(destination, { recursive: true });
  let notices = "\nBundled Tree-sitter grammar notices\n\n";
  for (const language of grammars) {
    const name = `tree-sitter-${language}`;
    const directory = dirname(require.resolve(`${name}/package.json`));
    const metadata = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
    if (metadata.version !== core.devDependencies[name])
      throw new Error(`Grammar version differs from manifest: ${name}`);
    if (copy) await cp(join(directory, `${name}.wasm`), join(destination, `${name}.wasm`));
    notices += `=== ${name}@${metadata.version} (${metadata.license}) ===\nSource: https://github.com/tree-sitter/${name}\n${await readFile(join(directory, "LICENSE"), "utf8")}\n`;
  }
  return notices;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await grammarAssets(undefined, true);
