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
    model: "jev-1.13",
  },
  // Cloudflare serves Jev as a Workers AI model; each account has its own gateway URL,
  // which auth saves with the token. The URL below is only the SDK's placeholder base.
  cloudflare: {
    label: "Cloudflare AI Gateway",
    baseURL: "https://gateway.ai.cloudflare.com",
    model: "typesafe/jev",
  },
} as const;

export type ProviderId = keyof typeof providers;

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && Object.hasOwn(providers, value);
}

export function requiresGatewayURL(provider: ProviderId): provider is "cloudflare" {
  return provider === "cloudflare";
}

/**
 * Normalizes a Cloudflare AI Gateway base URL, either
 * https://gateway.ai.cloudflare.com/v1/ACCOUNT/GATEWAY or a custom gateway domain.
 * Plain HTTP is accepted only for loopback hosts. Returns undefined when invalid.
 */
export function parseGatewayURL(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 2048) return undefined;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return undefined;
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return undefined;
  if (url.username || url.password || url.search || url.hash) return undefined;
  return url.href.replace(/\/+$/, "");
}

export function cloudflareRunURL(gatewayURL: string) {
  return `${gatewayURL}/workers-ai/run/${providers.cloudflare.model}`;
}
