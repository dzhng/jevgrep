/** Per-evaluator rolling budgets. Concurrency remains owned by the evaluator. */
export function createRateBudget(
  limits: { tokensPerSecond: number; requestsPerMinute: number },
  now = () => performance.now(),
) {
  const starts: Array<{ at: number; tokens: number }> = [];
  function waitMs(tokens: number) {
    if (!Number.isSafeInteger(tokens) || tokens < 0 || tokens > limits.tokensPerSecond)
      throw new Error("Token reservation exceeds the rate budget");
    const time = now();
    while (starts.length && starts[0]!.at <= time - 60_000) starts.shift();
    let wait =
      starts.length >= limits.requestsPerMinute
        ? starts[starts.length - limits.requestsPerMinute]!.at + 60_000 - time
        : 0;
    const recent = starts.filter((entry) => entry.at > time - 1000);
    let total = recent.reduce((sum, entry) => sum + entry.tokens, 0) + tokens;
    for (const entry of recent) {
      if (total <= limits.tokensPerSecond) break;
      total -= entry.tokens;
      wait = Math.max(wait, entry.at + 1000 - time);
    }
    return wait;
  }
  return {
    waitMs,
    reserve(tokens: number) {
      if (waitMs(tokens) > 0) throw new Error("Rate budget is not available");
      const entry = { at: now(), tokens };
      starts.push(entry);
      return {
        reconcile(inputTokens: number | undefined) {
          if (inputTokens !== undefined && Number.isSafeInteger(inputTokens) && inputTokens >= 0)
            entry.tokens = inputTokens;
        },
      };
    },
  };
}

/** Conservative byte reservation, bounded by Jev's maximum accepted input size.
 * This is not a tokenizer; returned usage replaces the estimate when available.
 */
export function estimatedInputTokens(request: {
  state: unknown;
  questions: Record<string, unknown>;
}) {
  return Math.min(
    65_536,
    Buffer.byteLength(JSON.stringify(request)) + 512 + 32 * Object.keys(request.questions).length,
  );
}
