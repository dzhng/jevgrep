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
  // A self-hosted or otherwise System One-compatible endpoint. This is the same
  // TYPESAFE_BASE_URL variable typesafe-sdk uses for its base URL.
  local: {
    label: "Self-hosted System One",
    baseURL: process.env.TYPESAFE_BASE_URL ?? "http://127.0.0.1:8009/v1",
    model: process.env.TYPESAFE_MODEL ?? "jev-latest",
  },
} as const;

export type ProviderId = keyof typeof providers;

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && Object.hasOwn(providers, value);
}
