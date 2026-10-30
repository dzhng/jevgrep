// Installs the pre-commit hook in the shared hooks directory, so every
// worktree of this repository runs it without its own install. Run by prepare.
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const marker = "# Installed by ratchet-files";
const hook = `#!/bin/sh
${marker}
# Branches that predate the ratchet have no checks to run.
[ -f scripts/check-file-size.mjs ] || exit 0
[ -x node_modules/.bin/lint-staged ] || {
  echo "pre-commit: dependencies aren't installed in this checkout; run bun install" >&2
  exit 1
}
exec node_modules/.bin/lint-staged
`;

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

let common;
try {
  common = git("rev-parse", "--path-format=absolute", "--git-common-dir");
} catch {
  process.exit(0); // Exported source trees have no hooks to install.
}

let hooksPath = "";
try {
  hooksPath = git("config", "--get", "core.hooksPath");
} catch {
  // Unset: Git uses the common hooks directory.
}
if (hooksPath && hooksPath !== ".husky/_") {
  console.warn(`core.hooksPath is ${hooksPath}; not installing the pre-commit hook.`);
  process.exit(0);
}

const path = join(common, "hooks", "pre-commit");
if (existsSync(path) && !readFileSync(path, "utf8").includes(marker)) {
  console.warn(`${path} exists and is not ours; not replacing it.`);
  process.exit(0);
}
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, hook);
chmodSync(path, 0o755);
if (hooksPath === ".husky/_") git("config", "--unset", "core.hooksPath");
