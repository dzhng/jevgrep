import { expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Independent expectations: deriving these from production would hide preset drift.
export const providers = {
  vercel: { url: "https://ai-gateway.vercel.sh/typesafe/v1/systemone", model: "typesafe-ai/jev" },
  typesafe: { url: "https://api.typesafe.ai/v1/systemone", model: "jev-1.13.0" },
  openrouter: { url: "https://openrouter.ai/api/v1/systemone", model: "jev-1.13" },
  cloudflare: {
    url: "https://gateway.ai.cloudflare.com/v1/fixture-account/fixture-gateway/workers-ai/run/typesafe/jev",
    model: "typesafe/jev",
    gatewayURL: "https://gateway.ai.cloudflare.com/v1/fixture-account/fixture-gateway",
  },
} as const;
export type Provider = keyof typeof providers;

export async function referenceTransport(provider: Provider = "vercel", key = "fixture") {
  const home = await mkdtemp(join(tmpdir(), "jg-reference-auth-"));
  await mkdir(join(home, "jevgrep"));
  await writeFile(
    join(home, "jevgrep/credentials.json"),
    JSON.stringify(
      provider === "cloudflare"
        ? { provider, apiKey: key, gatewayURL: providers.cloudflare.gatewayURL }
        : { provider, apiKey: key },
    ),
  );
  return {
    env(production: boolean, origin: string) {
      return production
        ? {
            PATH: process.env.PATH,
            XDG_CONFIG_HOME: home,
            NODE_OPTIONS: `--import=${resolve("test/fixtures/provider-route.mjs")}`,
            JEVGREP_TEST_PROVIDER_ORIGIN: origin,
          }
        : {
            PATH: process.env.PATH,
            AI_GATEWAY_API_KEY: key,
            AI_GATEWAY_BASE_URL: `${origin}/v4/ai`,
          };
    },
    decode(
      request: { url: string; method?: string; headers: Headers },
      raw: unknown,
      production: boolean,
    ) {
      expect(request.method).toBe("POST");
      expect(request.headers.get("content-type")).toMatch(/^application\/json(?:;|$)/);
      // Cloudflare's Workers AI route takes the gateway token and the model from its path.
      const cloudflare = production && provider === "cloudflare";
      expect(request.headers.get(cloudflare ? "cf-aig-authorization" : "authorization")).toBe(
        `Bearer ${key}`,
      );
      if (cloudflare) expect(request.headers.get("authorization")).toBeNull();
      const body = raw as {
        model?: string;
        providerOptions?: Record<string, unknown>;
        state: unknown;
        questions: Record<string, { type: string; instructions: string }>;
      };
      expect(Object.keys(body).sort()).toEqual(
        cloudflare
          ? ["questions", "state"]
          : production
            ? ["model", "questions", "state"]
            : ["providerOptions", "questions", "state"],
      );
      expect(new URL(request.url).pathname).toBe(
        production ? new URL(providers[provider].url).pathname : "/v4/ai/evaluation-model",
      );
      if (production) {
        expect(request.headers.get("x-jevgrep-original-url")).toBe(providers[provider].url);
        if (!cloudflare) expect(body.model).toBe(providers[provider].model);
      } else {
        expect(request.headers.get("ai-model-id")).toBe("typesafe-ai/jev");
        expect(body.providerOptions).toEqual({});
      }
      expect(body.state).toBeDefined();
      expect(body.questions).toBeObject();
      const questions = Object.fromEntries(
        Object.entries(body.questions).map(([id, question]) => {
          expect(Object.keys(question).sort()).toEqual(["instructions", "type"]);
          expect(question.type).toBe(production ? "noul" : "boolean");
          expect(typeof question.instructions).toBe("string");
          return [id, { ...question, type: "boolean" }];
        }),
      );
      // Only the validated transport envelope/types differ; state and question order stay exact.
      return { state: body.state, questions, providerOptions: {} };
    },
    cleanup: () => rm(home, { recursive: true, force: true }),
  };
}

export function wireResponse<
  T extends { answers: Record<string, { type: string; probability: number }> },
>(body: T, production: boolean, provider: Provider = "vercel") {
  if (!production) return body;
  const native = {
    ...body,
    answers: Object.fromEntries(
      Object.entries(body.answers).map(([id, answer]) => [
        id,
        { type: "noul", noul: answer.probability },
      ]),
    ),
  };
  return provider === "cloudflare" ? { state: "Completed", result: native } : native;
}
