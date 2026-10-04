import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { confirm, isCancel, password, select, text } from "@clack/prompts";
import {
  customProviderId,
  customProviderLabel,
  endpointFor,
  isCredentialProvider,
  providers,
  requiresInsecure,
  validateBaseURL,
  validateModel,
  type CredentialProvider,
  type ProviderId,
} from "@repo/core/providers";
import { storageDirectory } from "@repo/core/storage";
import { CliError } from "./errors";

function validateKey(raw: string, insecure = false): string {
  const key = raw.trim();
  if (!key && insecure) return "";
  if (!key || /\s/.test(key) || Buffer.byteLength(key) > 8192) {
    throw new CliError("Provide one non-empty API key without whitespace (maximum 8 KiB).");
  }
  return key;
}

export type Credentials =
  | { provider: ProviderId; apiKey: string }
  | {
      provider: typeof customProviderId;
      baseURL: string;
      model: string;
      apiKey: string;
      insecure?: boolean;
    };

export type AuthOptions = {
  provider?: CredentialProvider;
  baseURL?: string;
  model?: string;
  insecure?: boolean;
};

type CustomEndpoint = { baseURL: string; model: string };

function invalid(error: unknown) {
  return error instanceof Error ? error.message : "Invalid value.";
}

function customEndpoint(options: AuthOptions): CustomEndpoint {
  try {
    return {
      baseURL: validateBaseURL(options.baseURL, { insecure: options.insecure }),
      model: validateModel(options.model),
    };
  } catch (error) {
    throw new CliError(invalid(error));
  }
}

async function readKey(signal: AbortSignal, insecure: boolean): Promise<string> {
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
    return validateKey(Buffer.concat(chunks).toString("utf8"), insecure);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

async function promptEndpoint(
  signal: AbortSignal,
  insecure: boolean,
): Promise<CustomEndpoint & { insecure: boolean }> {
  const baseURL = await text({
    message: "Base URL of the custom endpoint",
    placeholder: "https://gateway.example.com/typesafe/v1",
    validate: (value) => {
      try {
        validateBaseURL(value, { insecure: true });
      } catch (error) {
        return invalid(error);
      }
    },
    output: process.stdout,
    signal,
  });
  if (isCancel(baseURL)) throw new DOMException("Interrupted", "AbortError");
  let allowInsecure = insecure;
  if (!allowInsecure && requiresInsecure(baseURL)) {
    const confirmed = await confirm({
      message:
        "That endpoint uses plain http://. Source content and answers will be sent " +
        "unencrypted and unauthenticated. Use it anyway?",
      output: process.stdout,
      signal,
    });
    if (isCancel(confirmed) || !confirmed) throw new DOMException("Interrupted", "AbortError");
    allowInsecure = true;
  }
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
  return {
    ...customEndpoint({ baseURL, model, insecure: allowInsecure }),
    insecure: allowInsecure,
  };
}

async function save(credentials: Credentials, signal: AbortSignal) {
  const directory = storageDirectory("config");
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

async function readPassword(
  message: string,
  signal: AbortSignal,
  insecure: boolean,
): Promise<string> {
  const answer = await password({ message, output: process.stdout, signal });
  if (isCancel(answer)) throw new DOMException("Interrupted", "AbortError");
  return validateKey(answer, insecure);
}

export async function authenticate(options: AuthOptions, signal: AbortSignal) {
  let credentials: Credentials;
  if (options.provider !== undefined) {
    if (options.provider === customProviderId) {
      const insecure = options.insecure === true;
      credentials = {
        provider: customProviderId,
        ...customEndpoint(options),
        apiKey: await readKey(signal, insecure),
        ...(insecure ? { insecure: true } : {}),
      };
    } else {
      credentials = { provider: options.provider, apiKey: await readKey(signal, false) };
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
      const endpoint = await promptEndpoint(signal, options.insecure === true);
      credentials = {
        provider: customProviderId,
        baseURL: endpoint.baseURL,
        model: endpoint.model,
        apiKey: await readPassword(
          "Paste the API key for that endpoint",
          signal,
          endpoint.insecure,
        ),
        ...(endpoint.insecure ? { insecure: true } : {}),
      };
    } else {
      credentials = {
        provider: selected,
        apiKey: await readPassword(
          `Paste your ${providers[selected].label} API key`,
          signal,
          false,
        ),
      };
    }
  }
  await save(credentials, signal);
  process.stdout.write(
    `${endpointFor(credentials).label} key saved. Run jg doctor to verify access.\n`,
  );
  if (credentials.provider === customProviderId && credentials.insecure)
    process.stdout.write(
      `Warning: source content and answers go to ${new URL(credentials.baseURL).host} ` +
        "over unencrypted http without authentication.\n",
    );
}

export async function loadCredentials(): Promise<Credentials> {
  try {
    const credentials = JSON.parse(
      await readFile(join(storageDirectory("config"), "credentials.json"), "utf8"),
    );
    const provider = Object.hasOwn(credentials, "provider") ? credentials.provider : "vercel";
    if (!isCredentialProvider(provider)) throw new CliError("Invalid provider. Run jg auth again.");
    const insecure = provider === customProviderId && credentials.insecure === true;
    const apiKey = validateKey(credentials.apiKey, insecure);
    if (provider === customProviderId) {
      return {
        provider,
        baseURL: validateBaseURL(credentials.baseURL, { insecure }),
        model: validateModel(credentials.model),
        apiKey,
        ...(insecure ? { insecure: true } : {}),
      };
    }
    return { provider, apiKey };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CliError("Run jg auth or use jg auth --provider NAME --stdin.");
    }
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("Base URL must use https://"))
      throw new CliError(`${message} Re-run jg auth with --insecure to trust this endpoint.`);
    if (message.startsWith("Base URL") || message.startsWith("Provide a base URL"))
      throw new CliError(`Saved base URL is invalid. ${message} Run jg auth again.`);
    throw new CliError("Could not read valid credentials. Run jg auth again.");
  }
}
