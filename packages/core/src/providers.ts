export const providers = {
  vercel: {
    label: "Vercel AI Gateway",
    baseURL: "https://ai-gateway.vercel.sh/typesafe/v1",
    model: "typesafe-ai/jev",
  },
  typesafe: {
    label: "TypeSafe",
    baseURL: "https://api.typesafe.ai/v1",
    model: "jev-1.13.0",
  },
  openrouter: {
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    model: "typesafe/jev-1.13",
  },
  opencode: {
    label: "OpenCode Zen",
    baseURL: "https://opencode.ai/zen/v1",
    model: "jev-1.13",
  },
} as const;

export type ProviderId = keyof typeof providers;

/** A custom record points at any TypeSafe-compatible endpoint instead of a fixed preset. */
export const customProviderId = "custom";
export const customProviderLabel = "Custom endpoint";

export type CredentialProvider = ProviderId | typeof customProviderId;

export type ProviderEndpoint = { label: string; baseURL: string; model: string };

export type ProviderSelection = {
  provider: CredentialProvider;
  baseURL?: string;
  model?: string;
};

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && Object.hasOwn(providers, value);
}

export function isCredentialProvider(value: unknown): value is CredentialProvider {
  return value === customProviderId || isProviderId(value);
}

const loopbackHosts = new Set(["localhost", "127.0.0.1"]);

export function validateBaseURL(value: unknown): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error("Provide a base URL for the custom endpoint.");
  const baseURL = value.trim();
  let url: URL;
  try {
    url = new URL(baseURL);
  } catch {
    throw new Error("Base URL must be an absolute http(s) URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Base URL must be an absolute http(s) URL.");
  if (url.protocol === "http:" && !loopbackHosts.has(url.hostname))
    throw new Error(
      "Base URL must use https:// (http:// is allowed only for localhost or 127.0.0.1).",
    );
  // The SDK appends /systemone directly; URL suffixes would consume that path.
  if (baseURL.includes("?") || baseURL.includes("#") || url.username || url.password)
    throw new Error("Base URL must not contain credentials, a query string, or a fragment.");
  return baseURL;
}

export function validateModel(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || /\s/.test(value.trim()))
    throw new Error("Provide one non-empty model ID without whitespace.");
  return value.trim();
}

function customEndpoint(selection: ProviderSelection): ProviderEndpoint {
  const baseURL = validateBaseURL(selection.baseURL);
  return {
    label: `${customProviderLabel} (${new URL(baseURL).host})`,
    baseURL,
    model: validateModel(selection.model),
  };
}

/** Resolve the transport settings for a saved record without exposing its key. */
export function endpointFor(selection: ProviderSelection): ProviderEndpoint {
  return selection.provider === customProviderId
    ? customEndpoint(selection)
    : providers[selection.provider];
}
