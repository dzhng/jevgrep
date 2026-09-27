import { APICallError, experimental_evaluate as evaluate } from "ai";
import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";
import { cloudflareRunURL, parseGatewayURL, providers, type ProviderId } from "./providers";
import { type createEvaluationCache, type CacheInput } from "./cache";
import { setTimeout as delay } from "node:timers/promises";

export type EvaluationRequest = {
  state: Parameters<typeof evaluate>[0]["state"];
  questions: Record<string, { type: "boolean"; instructions: string }>;
};

export class EvaluationFailure extends Error {
  constructor(
    public readonly kind:
      | "authentication"
      | "request-limit"
      | "provider"
      | "cancelled"
      | "source-invalid",
    public readonly splitEligible = false,
  ) {
    super(`Jev evaluation failed: ${kind}`);
    this.name = "EvaluationFailure";
  }
}

export function createEvaluator(options: {
  provider: ProviderId;
  apiKey: string;
  /** Saved Cloudflare AI Gateway base URL; required for, and only used by, cloudflare. */
  gatewayURL?: string;
  cache?: ReturnType<typeof createEvaluationCache>;
  policyVersion?: string;
  fetch?: typeof fetch;
  signal: AbortSignal;
  requestLimit?: number;
  timeoutMs?: number;
}) {
  const preset = providers[options.provider];
  const cloudflare = options.provider === "cloudflare";
  const gatewayURL = cloudflare ? parseGatewayURL(options.gatewayURL) : undefined;
  if (cloudflare && !gatewayURL) throw new EvaluationFailure("authentication");
  const endpoint = gatewayURL ? cloudflareRunURL(gatewayURL) : preset.baseURL;
  let requests = 0;
  let cacheHits = 0;
  let cooldownUntil = 0;
  const authenticationFailure = new AbortController();
  function assertActive() {
    if (options.signal.aborted) throw new EvaluationFailure("cancelled");
    if (authenticationFailure.signal.aborted) throw new EvaluationFailure("authentication");
  }
  const provider = createTypeSafeAi({
    apiKey: options.apiKey,
    baseURL: preset.baseURL,
    fetch: async (input, init) => {
      assertActive();
      if (requests >= (options.requestLimit ?? 50_000))
        throw new EvaluationFailure("request-limit");
      requests++;
      const transport = options.fetch ?? fetch;
      const response = gatewayURL
        ? await cloudflareTransport(transport, endpoint, init)
        : await transport(input, init);
      if (response.status === 429) {
        const raw = response.headers.get("retry-after");
        const seconds = raw === null ? NaN : Number(raw);
        const date = raw === null ? NaN : Date.parse(raw);
        const wait =
          Number.isFinite(seconds) && seconds >= 0
            ? seconds * 1000
            : Number.isFinite(date)
              ? Math.max(0, date - Date.now())
              : 1000;
        cooldownUntil = Math.max(cooldownUntil, Date.now() + wait);
      }
      return response;
    },
  });
  return {
    get cacheHits() {
      return cacheHits;
    },
    get cacheIssues() {
      return options.cache?.stats().issues ?? [];
    },
    get requests() {
      return requests;
    },
    async evaluate(
      request: EvaluationRequest,
      policy?: { navigation?: boolean; beforeAttempt?: () => Promise<void> },
    ): Promise<Record<string, number>> {
      assertActive();
      const cacheInput: CacheInput = {
        request,
        namespace: {
          model: preset.model,
          provider: options.provider,
          endpoint,
          protocol: cloudflare ? "typesafe-ai-3.0.8+workers-ai-run" : "typesafe-ai-3.0.8",
          policyVersion: options.policyVersion ?? "1",
          parserVersion: "cpython-3.11.3-pyodide-0.25.1-ts-5.9.3",
          promptVersion: "unit-locators-1",
        },
      };
      const cached = await options.cache?.get(cacheInput);
      assertActive();
      if (
        cached &&
        Object.keys(cached).length === Object.keys(request.questions).length &&
        Object.keys(request.questions).every(
          (id) => typeof cached[id] === "number" && cached[id]! >= 0 && cached[id]! <= 1,
        )
      ) {
        cacheHits++;
        return cached;
      }
      const navigation = policy?.navigation === true;
      const multiple = Object.keys(request.questions).length > 1;
      let attemptLimit = navigation && multiple ? 1 : 2;
      for (let attempt = 0; attempt < attemptLimit; attempt++) {
        assertActive();
        if (requests >= (options.requestLimit ?? 50_000))
          throw new EvaluationFailure("request-limit");
        while (cooldownUntil > Date.now()) {
          try {
            await delay(Math.min(60_000, cooldownUntil - Date.now()), undefined, {
              signal: AbortSignal.any([options.signal, authenticationFailure.signal]),
            });
          } catch {
            assertActive();
            throw new EvaluationFailure("cancelled");
          }
        }
        await policy?.beforeAttempt?.();
        assertActive();
        try {
          const result = await evaluate({
            model: provider.evaluationModel(preset.model),
            ...request,
            maxRetries: 0,
            abortSignal: AbortSignal.any([
              options.signal,
              authenticationFailure.signal,
              AbortSignal.timeout(options.timeoutMs ?? 15_000),
            ]),
          });
          const scores = Object.fromEntries(
            Object.keys(request.questions).map((id) => {
              const answer = result.answers[id];
              if (
                !answer ||
                answer.type !== "boolean" ||
                !Number.isFinite(answer.probability) ||
                answer.probability < 0 ||
                answer.probability > 1
              )
                throw new Error("Invalid answer");
              return [id, answer.probability];
            }),
          );
          await options.cache?.put(cacheInput, scores);
          return scores;
        } catch (error) {
          assertActive();
          const status =
            error && typeof error === "object" && "statusCode" in error
              ? error.statusCode
              : undefined;
          if (status === 401 || status === 403) {
            authenticationFailure.abort();
            throw new EvaluationFailure("authentication");
          }
          if (requests >= (options.requestLimit ?? 50_000))
            throw new EvaluationFailure("request-limit");
          const name = error instanceof Error ? error.name : "unknown";
          const transient =
            status === 408 ||
            status === 429 ||
            (typeof status === "number" && status >= 500 && status <= 599) ||
            name === "TimeoutError" ||
            (APICallError.isInstance(error) && error.statusCode === undefined && error.isRetryable);
          if (navigation && status === 429) attemptLimit = Math.max(attemptLimit, 2);
          if ((navigation && !transient) || attempt + 1 === attemptLimit)
            throw new EvaluationFailure(
              "provider",
              navigation && multiple && transient && status !== 429,
            );
        }
      }
      throw new EvaluationFailure("provider");
    },
  };
}

/**
 * Cloudflare AI Gateway serves Jev as a Workers AI model at <gateway>/workers-ai/run/typesafe/jev:
 * the model comes from the path, the gateway token travels as cf-aig-authorization, and the
 * TypeSafe answer is wrapped as {state, result}. Error responses pass through unchanged so
 * status handling (401/403, 429, 5xx) stays with the evaluator.
 */
async function cloudflareTransport(
  transport: typeof fetch,
  endpoint: string,
  init: RequestInit | undefined,
): Promise<Response> {
  const { model: _model, ...input } = JSON.parse(String(init?.body));
  const headers = new Headers(init?.headers);
  const authorization = headers.get("authorization");
  headers.delete("authorization");
  if (authorization) headers.set("cf-aig-authorization", authorization);
  // Fetch drops Authorization on a cross-origin redirect but would forward cf-aig-authorization.
  const response = await transport(endpoint, {
    ...init,
    headers,
    body: JSON.stringify(input),
    redirect: "error",
  });
  if (!response.ok) return response;
  const envelope: unknown = await response.json();
  const answer =
    envelope && typeof envelope === "object" && "result" in envelope ? envelope.result : envelope;
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-length");
  responseHeaders.delete("content-encoding");
  return Response.json(answer, { status: response.status, headers: responseHeaders });
}
