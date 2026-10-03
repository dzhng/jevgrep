import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import type { Command } from "./args";
import { CliError } from "./errors";

declare const JEVGREP_BUNDLED: boolean;

export async function installSkill(
  command: Extract<Command, { kind: "skill" }>,
  signal: AbortSignal,
): Promise<number> {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major! < 22 || (major === 22 && minor! < 20))
    throw new CliError("jg skill requires Node 22.20 or newer (skills@1.7.0).");
  const source = fileURLToPath(
    new URL(
      typeof JEVGREP_BUNDLED !== "undefined" ? "../skills/jevgrep" : "../../../skills/jevgrep",
      import.meta.url,
    ),
  );
  const args = ["--yes", "--ignore-scripts", "skills@1.7.0", "add", source, "--skill", "jevgrep"];
  for (const agent of command.agents) args.push("--agent", agent);
  if (command.global) args.push("--global");
  if (command.yes) args.push("--yes");
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const windows = process.platform === "win32";
    // Windows needs a shell for npx.cmd. Agent names are restricted by parseCommand.
    const child = spawn(windows ? `npx ${args.join(" ")}` : "npx", windows ? [] : args, {
      // Preserve installer prompts while keeping all CLI output on stdout.
      stdio: ["inherit", process.stdout, process.stdout],
      shell: windows,
      signal,
      killSignal: "SIGINT",
    });
    child.once("error", (error: NodeJS.ErrnoException) =>
      reject(
        error.code === "ENOENT"
          ? new CliError("Skill installation requires npx. Install npm, then run jg skill again.")
          : error,
      ),
    );
    child.once("close", (code, childSignal) =>
      resolve(code ?? (childSignal === "SIGINT" ? 130 : 1)),
    );
  });
}
