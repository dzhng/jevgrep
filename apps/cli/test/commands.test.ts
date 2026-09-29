import { expect } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { version } from "../package.json";
import { testInDocker, withCli } from "./cli";

testInDocker("built commands expose usage and version without authentication", async () => {
  await withCli(async ({ run }) => {
    const help = await run(["--help"]);
    expect(help).toMatchObject({ code: 0, stderr: "" });
    expect(help.stdout).toContain('Usage: jg "question" [root]');
    expect(await run(["--version"])).toEqual({ code: 0, stderr: "", stdout: `${version}\n` });
    const invalid = await run(["--accidentally-pasted-secret"]);
    expect(invalid).toMatchObject({ code: 1, stderr: "" });
    expect(invalid.stdout).not.toContain("accidentally-pasted-secret");
  });
  const sourceHelp = Bun.spawn(
    ["bun", fileURLToPath(new URL("../src/index.ts", import.meta.url)), "--help"],
    {
      env: { ...process.env, AI_GATEWAY_API_KEY: "" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  expect(await new Response(sourceHelp.stdout).text()).toContain('Usage: jg "question" [root]');
  expect(await new Response(sourceHelp.stderr).text()).toBe("");
  expect(await sourceHelp.exited).toBe(0);
});

testInDocker("files counts eligible content without credentials or network", async () => {
  await withCli(async ({ home, run }) => {
    await mkdir(join(home, "project/src"), { recursive: true });
    await writeFile(join(home, "project/src/index.ts"), "export const x = 1;\n");
    await writeFile(join(home, "project/.env"), "SECRET=1\n");
    const result = await run(["files", "project"], "", { AI_GATEWAY_API_KEY: "" });
    expect(result).toMatchObject({ code: 0, stderr: "" });
    expect(result.stdout).toContain(
      "Jevgrep files: 1 file eligible (20 B). No provider requests were made.",
    );
    expect(result.stdout).toContain('Skipped paths (a skipped directory counts once): "hidden" 1.');
    expect(result.stdout).not.toContain("SECRET");
    const excluded = await run(["files", "project", "--exclude", "src/", "--no-ignore"]);
    expect(excluded).toMatchObject({ code: 0, stderr: "" });
    expect(excluded.stdout).toContain("Jevgrep files: 0 files eligible (0 B).");
    expect(excluded.stdout).toContain('"exclude_pattern" 1');
    expect((await run(["files", "project", "--exclude", "!src/"])).code).toBe(1);
    expect(await run(["files", "missing"])).toMatchObject({
      code: 1,
      stdout: "The root must be an existing directory.\n",
      stderr: "",
    });
  });
});
