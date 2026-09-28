import { APICallError, experimental_evaluate as evaluate } from "ai";
import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";
import { providers, type ProviderId } from "./providers";
import { type createEvaluationCache, type CacheInput } from "./cache";
import { setTimeout as delay } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";
import { createHash } from "node:crypto";
import { createRateBudget, estimatedInputTokens } from "./rate-budget";

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
    public readonly diagnostic?: { statusCode: number; message?: string },
    message?: string,
  ) {
    super(message ?? `Jev evaluation failed: ${kind}`);
    this.name = "EvaluationFailure";
  }
}

export function createEvaluator(options: {
  provider: ProviderId;
  apiKey: string;
  organizationId?: string;
  cache?: ReturnType<typeof createEvaluationCache>;
  policyVersion?: string;
  fetch?: typeof fetch;
  signal: AbortSignal;
  requestLimit?: number;
  timeoutMs?: number;
  concurrency?: number;
}) {
  const preset = providers[options.provider];
  const credential =
    options.provider === "kilo" ? createHash("sha256").update(options.apiKey).digest("hex") : "";
  const concurrency = options.concurrency ?? 32;
  const timeoutMs = options.timeoutMs ?? (options.provider === "typesafe" ? 60_000 : 15_000);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1)
    throw new Error("Concurrency must be a positive integer");
  let requests = 0;
  let cacheHits = 0;
  let cooldownUntil = 0;
  const rateBudget =
    options.provider === "typesafe"
      ? createRateBudget({ tokensPerSecond: 250_000, requestsPerMinute: 1_200 })
      : undefined;
  const authenticationFailure = new AbortController();
  function assertActive() {
    if (options.signal.aborted) throw new EvaluationFailure("cancelled");
    if (authenticationFailure.signal.aborted) throw new EvaluationFailure("authentication");
  }
  let active = 0;
  const waiting: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  const stopped = AbortSignal.any([options.signal, authenticationFailure.signal]);
  stopped.addEventListener(
    "abort",
    () => {
      const kind = options.signal.aborted ? "cancelled" : "authentication";
      for (const request of waiting.splice(0)) request.reject(new EvaluationFailure(kind));
    },
    { once: true },
  );
  async function acquire() {
    assertActive();
    if (active < concurrency) active++;
    else await new Promise<void>((resolve, reject) => waiting.push({ resolve, reject }));
    return () => {
      const next = waiting.shift();
      if (next) next.resolve();
      else active--;
    };
  }
  const provider = createTypeSafeAi({
    apiKey: options.apiKey,
    baseURL: preset.baseURL,
    ...(options.provider === "kilo" && options.organizationId
      ? { headers: { "X-KiloCode-OrganizationId": options.organizationId } }
      : {}),
    fetch: async (input, init) => {
      assertActive();
      if (requests >= (options.requestLimit ?? 50_000))
        throw new EvaluationFailure("request-limit");
      requests++;
      const response = await (options.fetch ?? fetch)(input, init);
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
          endpoint: preset.baseURL,
          ...(options.provider === "kilo"
            ? {
                organizationId: options.organizationId ?? "",
                credential,
              }
            : {}),
          protocol: "typesafe-ai-3.0.8",
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
        await policy?.beforeAttempt?.();
        assertActive();
        cacheHits++;
        return cached;
      }
      const navigation = policy?.navigation === true;
      const reservedTokens = rateBudget ? estimatedInputTokens(request) : 0;
      const multiple = Object.keys(request.questions).length > 1;
      let attemptLimit = navigation && multiple ? 1 : 2;
      for (let attempt = 0; attempt < attemptLimit; attempt++) {
        assertActive();
        if (requests >= (options.requestLimit ?? 50_000))
          throw new EvaluationFailure("request-limit");
        const release = await acquire();
        try {
          assertActive();
          // Wait before validating source and before starting the network timeout.
          // Recheck after validation: another worker may have consumed the budget.
          for (;;) {
            const wait = Math.max(
              cooldownUntil - Date.now(),
              rateBudget?.waitMs(reservedTokens) ?? 0,
            );
            if (wait > 0) {
              try {
                await delay(Math.min(60_000, wait), undefined, { signal: stopped });
              } catch {
                assertActive();
                throw new EvaluationFailure("cancelled");
              }
              continue;
            }
            await policy?.beforeAttempt?.();
            assertActive();
            if (cooldownUntil > Date.now() || (rateBudget?.waitMs(reservedTokens) ?? 0) > 0)
              continue;
            break;
          }
          const reservation = rateBudget?.reserve(reservedTokens);
          try {
            const result = await evaluate({
              model: provider.evaluationModel(preset.model),
              ...request,
              maxRetries: 0,
              abortSignal: AbortSignal.any([
                options.signal,
                authenticationFailure.signal,
                AbortSignal.timeout(timeoutMs),
              ]),
            });
            reservation?.reconcile(result.usage.inputTokens);
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
              throw new EvaluationFailure(
                "authentication",
                false,
                providerDiagnostic(error, options.apiKey),
              );
            }
            if (requests >= (options.requestLimit ?? 50_000))
              throw new EvaluationFailure("request-limit");
            const name = error instanceof Error ? error.name : "unknown";
            const transient =
              status === 408 ||
              status === 429 ||
              (typeof status === "number" && status >= 500 && status <= 599) ||
              name === "TimeoutError" ||
              (APICallError.isInstance(error) &&
                error.statusCode === undefined &&
                error.isRetryable);
            if (navigation && status === 429) attemptLimit = Math.max(attemptLimit, 2);
            if ((navigation && !transient) || attempt + 1 === attemptLimit) {
              const diagnostic = providerDiagnostic(error, options.apiKey);
              const description = diagnostic
                ? `HTTP ${diagnostic.statusCode}${diagnostic.message ? `: ${diagnostic.message}` : ""}`
                : name === "TimeoutError"
                  ? `Request timed out after ${timeoutMs} ms`
                  : APICallError.isInstance(error) && error.statusCode === undefined
                    ? "Network request failed (connection unavailable or reset)"
                    : "Invalid or incomplete provider response";
              throw new EvaluationFailure(
                "provider",
                navigation && multiple && transient && status !== 429,
                diagnostic,
                `${description} (max concurrent requests: ${concurrency})`,
              );
            }
          }
        } finally {
          release();
        }
      }
      throw new EvaluationFailure("provider");
    },
  };
}

// Only explicit text fields from a parsed provider error are suitable for user-facing diagnostics.
// SDK messages can instead serialize arbitrary detail objects, requests, or response bodies.
function providerDiagnostic(error: unknown, apiKey: string): EvaluationFailure["diagnostic"] {
  if (!APICallError.isInstance(error) || error.statusCode === undefined) return undefined;
  const data: unknown = error.data;
  let message: unknown;
  if (data && typeof data === "object") {
    const nested = "error" in data ? data.error : undefined;
    message =
      ("message" in data && typeof data.message === "string" ? data.message : undefined) ??
      (typeof nested === "string"
        ? nested
        : nested && typeof nested === "object" && "message" in nested
          ? nested.message
          : undefined) ??
      ("detail" in data && typeof data.detail === "string" ? data.detail : undefined);
  }
  if (typeof message !== "string") return { statusCode: error.statusCode };
  const safe = stripVTControlCharacters(message)
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .trim();
  const redacted = apiKey ? safe.replaceAll(apiKey, "[redacted]") : safe;
  // A provider may split a credential with whitespace or invisible separators.
  if (apiKey && redacted.replace(/\s/gu, "").includes(apiKey))
    return { statusCode: error.statusCode };
  return { statusCode: error.statusCode, message: redacted.slice(0, 500) || undefined };
}
