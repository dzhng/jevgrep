// Harness-only transport: never shipped or read by the CLI itself.
const endpoints = new Set([
  "https://ai-gateway.vercel.sh/typesafe/v1/systemone",
  "https://api.typesafe.ai/v1/systemone",
  "https://openrouter.ai/api/v1/systemone",
  "https://opencode.ai/zen/v1/systemone",
]);
export function routeProviderFetch(originalFetch, origin) {
  return async (input, init) => {
    const url = new URL(input);
    if (!endpoints.has(url.href)) throw new Error(`Unexpected provider destination: ${url.href}`);
    const headers = new Headers(init?.headers);
    headers.set("x-jevgrep-original-url", url.href);
    return originalFetch(new URL(url.pathname, origin), { ...init, headers });
  };
}
if (process.env.JEVGREP_TEST_PROVIDER_ORIGIN) {
  globalThis.fetch = routeProviderFetch(globalThis.fetch, process.env.JEVGREP_TEST_PROVIDER_ORIGIN);
}
