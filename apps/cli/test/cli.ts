import { test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const testInDocker = process.env.JEVGREP_TEST_IN_DOCKER === "1" ? test : test.skip;
export { posix, testIfDockerPosix as testInDockerPosix } from "../../../test/helpers/docker";

export async function withCli(
  runTest: (context: {
    home: string;
    run: (
      args: string[],
      input?: string,
      env?: NodeJS.ProcessEnv,
    ) => Promise<{ stdout: string; stderr: string; code: number }>;
  }) => Promise<void>,
) {
  const home = await mkdtemp(join(tmpdir(), "jevgrep-cli-"));
  const cli = process.env.JEVGREP_TEST_CLI ?? join(import.meta.dir, "../dist/bin/index.js");
  const run = async (args: string[], input = "", env: NodeJS.ProcessEnv = {}) => {
    const child = Bun.spawn(["node", cli, ...args], {
      cwd: home,
      env: {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: home,
        XDG_CACHE_HOME: join(home, "cache"),
        ...env,
      },
      stdin: new Blob([input]),
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10000,
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, code };
  };
  try {
    await runTest({ home, run });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}
