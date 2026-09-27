import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { isCancel, password, select } from "@clack/prompts";
import { providers, isProviderId, type ProviderId } from "@repo/core/providers";
import { CliError } from "./errors";

export function configDirectory() {
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "jevgrep");
}

function validateKey(raw: string): string {
  const key = raw.trim();
  if (!key || /\s/.test(key) || Buffer.byteLength(key) > 8192) {
    throw new CliError("Provide one non-empty API key without whitespace (maximum 8 KiB).");
  }
  return key;
}

export type Credentials = { provider: ProviderId; apiKey: string };

export async function authenticate(provider: ProviderId | undefined, signal: AbortSignal) {
  let key: string;
  if (provider !== undefined) {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const abort = () => process.stdin.destroy(new DOMException("Interrupted", "AbortError"));
    signal.throwIfAborted();
    signal.addEventListener("abort", abort, { once: true });
    try {
      for await (const chunk of process.stdin) {
        bytes += chunk.length;
        if (bytes > 8192) throw new CliError("Auth input exceeds 8 KiB.");
        chunks.push(Buffer.from(chunk));
      }
      key = validateKey(Buffer.concat(chunks).toString("utf8"));
    } finally {
      signal.removeEventListener("abort", abort);
    }
  } else {
    if (!process.stdin.isTTY)
      throw new CliError(
        `Use auth --provider ${Object.keys(providers).join("|")} --stdin to read a piped key.`,
      );
    const selected = await select<ProviderId>({
      message: "Choose your Jev provider",
      options: (Object.keys(providers) as ProviderId[]).map((value) => ({
        value,
        label: providers[value].label,
      })),
      output: process.stdout,
      signal,
    });
    if (isCancel(selected)) throw new DOMException("Interrupted", "AbortError");
    provider = selected;
    const answer = await password({
      message: `Paste your ${providers[provider].label} API key`,
      output: process.stdout,
      signal,
    });
    if (isCancel(answer)) {
      throw new DOMException("Interrupted", "AbortError");
    }
    key = validateKey(answer);
  }
  const directory = configDirectory();
  signal.throwIfAborted();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = join(directory, `.credentials-${randomUUID()}.json`);
  try {
    await writeFile(temporary, JSON.stringify({ provider, apiKey: key }) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    signal.throwIfAborted();
    await rename(temporary, join(directory, "credentials.json"));
  } finally {
    await rm(temporary, { force: true });
  }
  process.stdout.write(`${providers[provider].label} key saved. Run jg doctor to verify access.\n`);
}

export async function loadCredentials(): Promise<Credentials> {
  try {
    const credentials = JSON.parse(
      await readFile(join(configDirectory(), "credentials.json"), "utf8"),
    );
    if (typeof credentials.apiKey !== "string" || !credentials.apiKey.trim()) {
      throw new CliError("Invalid credentials. Run jg auth again.");
    }
    const provider = Object.hasOwn(credentials, "provider") ? credentials.provider : "vercel";
    if (!isProviderId(provider)) throw new CliError("Invalid provider. Run jg auth again.");
    return { provider, apiKey: validateKey(credentials.apiKey) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CliError("Run jg auth or use jg auth --provider NAME --stdin.");
    }
    throw new CliError("Could not read valid credentials. Run jg auth again.");
  }
}
