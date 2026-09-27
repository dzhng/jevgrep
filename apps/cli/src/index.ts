#!/usr/bin/env node
import { authenticate, configDirectory, loadCredentials } from "./auth";
import { providers } from "@repo/core/providers";
import { help, parseCommand } from "./args";
import { CliError } from "./errors";
import { renderResult } from "./render";
import { homedir } from "node:os";
import { join } from "node:path";
import { version } from "../package.json";
import { installSkill } from "./skill";

globalThis.AI_SDK_LOG_WARNINGS = false;

const controller = new AbortController();
let pipeClosed = false;
let interrupted = false;
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  pipeClosed = true;
  controller.abort();
  process.exitCode = error.code === "EPIPE" ? 0 : 1;
});
const interrupt = () => {
  interrupted = true;
  controller.abort();
};
process.on("SIGINT", interrupt);

async function write(text: string) {
  if (pipeClosed) return;
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(text, (error) => (error ? reject(error) : resolve()));
  });
}

function cacheDirectory() {
  return join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "jevgrep");
}

async function main() {
  const command = parseCommand(process.argv.slice(2));
  switch (command.kind) {
    case "help":
      return write(help);
    case "version":
      return write(`${version}\n`);
    case "skill":
      process.exitCode = await installSkill(command, controller.signal);
      return;
    case "auth":
      return authenticate(command.provider, controller.signal, command.gatewayURL);
    case "cache-clear": {
      const { createEvaluationCache } = await import("@repo/core");
      const cache = createEvaluationCache({ directory: cacheDirectory() });
      await cache.clear();
      if (cache.stats().issues.length)
        throw new CliError("Could not completely clear the cache. Check its permissions.");
      return write("Cache cleared.\n");
    }
    case "doctor": {
      const credentials = await loadCredentials();
      const { createEvaluator } = await import("@repo/core");
      const evaluator = createEvaluator({
        ...credentials,
        signal: controller.signal,
      });
      try {
        const answers = await evaluator.evaluate({
          state: { source: "export function recordEvent(event) { events.push(event); }" },
          questions: {
            relevant: {
              type: "boolean",
              instructions: "Does this source implement recording an event?",
            },
          },
        });
        if (!(answers.relevant! > 0.5))
          throw new CliError(
            `${providers[credentials.provider].label} returned an unexpected answer to the connection check.`,
          );
        await write(`Jev connection verified through ${providers[credentials.provider].label}.\n`);
      } catch (error) {
        if (error instanceof CliError) throw error;
        throw new CliError(
          `Jev connection check failed through ${providers[credentials.provider].label}. Check your saved key, model access, and network.`,
        );
      }
      return;
    }
    case "search": {
      const credentials = await loadCredentials();
      const { retrieve, createEvaluator, createEvaluationCache } = await import("@repo/core");
      const cache = createEvaluationCache({
        directory: cacheDirectory(),
        enabled: !command.noCache,
      });
      const evaluator = createEvaluator({
        cache,
        policyVersion: JSON.stringify(command.policy),
        ...credentials,
        signal: controller.signal,
      });
      const result = await retrieve(
        {
          root: command.root,
          query: command.query,
          policy: command.policy,
          signal: controller.signal,
          protectedPaths: [configDirectory(), cacheDirectory()],
        },
        evaluator,
      );
      if (pipeClosed) return;
      await write(renderResult(result, command.maxSourceBytes));
      process.exitCode =
        result.status === "interrupted" ? 130 : result.status === "incomplete" ? 2 : 0;
    }
  }
}

try {
  await main();
} catch (error) {
  if (!pipeClosed) {
    const aborted = interrupted || (error instanceof Error && error.name === "AbortError");
    process.exitCode = aborted ? 130 : 1;
    const message = aborted
      ? "Interrupted."
      : error instanceof CliError
        ? error.message
        : "Command failed. Check the root, permissions, credentials, and network.";
    await write(`${message}\n`).catch(() => {});
  }
} finally {
  process.removeListener("SIGINT", interrupt);
  if (interrupted && !pipeClosed) process.exitCode = 130;
}
