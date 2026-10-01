import { spawn } from "node:child_process";
import type { Command } from "./args";
import { CliError } from "./errors";

export async function installSkill(
  command: Extract<Command, { kind: "skill" }>,
  signal: AbortSignal,
): Promise<number> {
  const args = ["--yes", "skills", "add", "dzhng/jevgrep", "--skill", "jevgrep"];
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
