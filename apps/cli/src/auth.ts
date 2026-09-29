import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { isCancel, password, select, text } from "@clack/prompts";
import {
  customProviderId,
  customProviderLabel,
  endpointFor,
  isCredentialProvider,
  providers,
  validateBaseURL,
  validateModel,
  type CredentialProvider,
  type ProviderId,
} from "@repo/core/providers";
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

export type Credentials =
  | { provider: ProviderId; apiKey: string }
  | { provider: typeof customProviderId; baseURL: string; model: string; apiKey: string };

export type AuthOptions = {
  provider?: CredentialProvider;
  baseURL?: string;
  model?: string;
};

type CustomEndpoint = { baseURL: string; model: string };

function invalid(error: unknown) {
  return error instanceof Error ? error.message : "Invalid value.";
}

function customEndpoint(options: AuthOptions): CustomEndpoint {
  try {
    return { baseURL: validateBaseURL(options.baseURL), model: validateModel(options.model) };
  } catch (error) {
    throw new CliError(invalid(error));
  }
}

async function readKey(signal: AbortSignal): Promise<string> {
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
    return validateKey(Buffer.concat(chunks).toString("utf8"));
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

async function promptEndpoint(signal: AbortSignal): Promise<CustomEndpoint> {
  const baseURL = await text({
    message: "Base URL of the custom endpoint",
    placeholder: "https://gateway.example.com/typesafe/v1",
    validate: (value) => {
      try {
        validateBaseURL(value);
      } catch (error) {
        return invalid(error);
      }
    },
    output: process.stdout,
    signal,
  });
  if (isCancel(baseURL)) throw new DOMException("Interrupted", "AbortError");
  const model = await text({
    message: "Model ID served by that endpoint",
    placeholder: "your-gateway/jev",
    validate: (value) => {
      try {
        validateModel(value);
      } catch (error) {
        return invalid(error);
      }
    },
    output: process.stdout,
    signal,
  });
  if (isCancel(model)) throw new DOMException("Interrupted", "AbortError");
  return customEndpoint({ baseURL, model });
}

async function save(credentials: Credentials, signal: AbortSignal) {
  const directory = configDirectory();
  signal.throwIfAborted();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = join(directory, `.credentials-${randomUUID()}.json`);
  try {
    await writeFile(temporary, JSON.stringify(credentials) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    signal.throwIfAborted();
    await rename(temporary, join(directory, "credentials.json"));
  } finally {
    await rm(temporary, { force: true });
  }
}

async function readPassword(message: string, signal: AbortSignal): Promise<string> {
  const answer = await password({ message, output: process.stdout, signal });
  if (isCancel(answer)) throw new DOMException("Interrupted", "AbortError");
  return validateKey(answer);
}

export async function authenticate(options: AuthOptions, signal: AbortSignal) {
  let credentials: Credentials;
  if (options.provider !== undefined) {
    if (options.provider === customProviderId) {
      const endpoint = customEndpoint(options);
      credentials = { provider: customProviderId, ...endpoint, apiKey: await readKey(signal) };
    } else {
      credentials = { provider: options.provider, apiKey: await readKey(signal) };
    }
  } else {
    if (!process.stdin.isTTY)
      throw new CliError(
        `Use auth --provider ${[...Object.keys(providers), customProviderId].join(
          "|",
        )} --stdin to read a piped key.`,
      );
    const selected = await select<CredentialProvider>({
      message: "Choose your Jev provider",
      options: [
        ...(Object.keys(providers) as ProviderId[]).map((value) => ({
          value,
          label: providers[value].label,
        })),
        { value: customProviderId, label: customProviderLabel },
      ],
      output: process.stdout,
      signal,
    });
    if (isCancel(selected)) throw new DOMException("Interrupted", "AbortError");
    if (selected === customProviderId) {
      const endpoint = await promptEndpoint(signal);
      credentials = {
        provider: customProviderId,
        ...endpoint,
        apiKey: await readPassword("Paste the API key for that endpoint", signal),
      };
    } else {
      credentials = {
        provider: selected,
        apiKey: await readPassword(`Paste your ${providers[selected].label} API key`, signal),
      };
    }
  }
  await save(credentials, signal);
  process.stdout.write(
    `${endpointFor(credentials).label} key saved. Run jg doctor to verify access.\n`,
  );
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
    if (!isCredentialProvider(provider)) throw new CliError("Invalid provider. Run jg auth again.");
    const apiKey = validateKey(credentials.apiKey);
    if (provider === customProviderId) {
      return {
        provider,
        baseURL: validateBaseURL(credentials.baseURL),
        model: validateModel(credentials.model),
        apiKey,
      };
    }
    return { provider, apiKey };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CliError("Run jg auth or use jg auth --provider NAME --stdin.");
    }
    throw new CliError("Could not read valid credentials. Run jg auth again.");
  }
}
