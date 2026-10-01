import { expect } from "bun:test";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { posix, testInDocker } from "./cli";

const execute = promisify(execFile);

testInDocker(
  "npm tarball installs the jg executable and canonical skill outside the checkout",
  async () => {
    const scratch = await mkdtemp(join(tmpdir(), "jevgrep-package-"));
    const npmCache = join(scratch, "npm-cache");
    if (process.env.npm_config_cache) {
      await cp(process.env.npm_config_cache, npmCache, { recursive: true });
    }
    const env = {
      ...process.env,
      HOME: scratch,
      AI_GATEWAY_API_KEY: "",
      NODE_PATH: "",
      npm_config_cache: npmCache,
    };
    // npm.cmd needs cmd.exe; all arguments here are fixed options or fixture paths.
    const npm = (args: string[]) =>
      execute(
        posix ? "npm" : "cmd.exe",
        posix ? args : ["/d", "/s", "/c", `npm ${args.map((arg) => `"${arg}"`).join(" ")}`],
        {
          cwd: fileURLToPath(new URL("../", import.meta.url)),
          env,
          timeout: 120000,
        },
      );
    try {
      const { stdout } = await npm([
        "pack",
        "--ignore-scripts",
        "--json",
        "--pack-destination",
        scratch,
      ]);
      const packed = JSON.parse(stdout)[0];
      const filenames = packed.files.map((file: { path: string }) => file.path);
      expect(filenames).toContain("dist/bin/index.js");
      expect(filenames).toContain("dist/bin/parser-worker.mjs");
      for (const name of ["python", "go", "rust"])
        expect(filenames).toContain(`dist/assets/tree-sitter/tree-sitter-${name}.wasm`);
      expect(filenames).toContain("dist/THIRD_PARTY_NOTICES.txt");
      expect(filenames).toContain("dist/skills/jevgrep/SKILL.md");
      expect(filenames.some((path: string) => /^(evals|src|node_modules|test)\//.test(path))).toBe(
        false,
      );
      const prefix = join(scratch, "install");
      await npm([
        "install",
        "--prefix",
        prefix,
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        join(scratch, packed.filename),
      ]);
      const binary = join(prefix, "node_modules/@dzhng/jevgrep/dist/bin/index.js");
      const help = await execute("node", [binary, "--help"], { cwd: scratch, env });
      expect(help.stderr).toBe("");
      expect(help.stdout).toContain('Usage: jg "question" [root]');
      expect(
        await readFile(
          join(prefix, "node_modules/@dzhng/jevgrep/dist/skills/jevgrep/SKILL.md"),
          "utf8",
        ),
      ).toBe(await readFile(new URL("../../../skills/jevgrep/SKILL.md", import.meta.url), "utf8"));
      const manifest = JSON.parse(
        await readFile(join(prefix, "node_modules/@dzhng/jevgrep/package.json"), "utf8"),
      );
      expect(manifest.bin).toEqual({ jg: "./dist/bin/index.js" });
      expect(manifest.dependencies["@repo/core"]).toBeUndefined();
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  },
  150000,
);
