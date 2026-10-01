/** Per-evaluator one-second rolling budgets. Concurrency remains owned by the evaluator. */
export function createRateBudget(
  limits: { tokensPerSecond: number; requestsPerSecond: number },
  now = () => performance.now(),
) {
  const starts: Array<{ at: number; tokens: number }> = [];
  function waitMs(tokens: number) {
    if (!Number.isSafeInteger(tokens) || tokens < 0 || tokens > limits.tokensPerSecond)
      throw new Error("Token reservation exceeds the rate budget");
    const time = now();
    while (starts.length && starts[0]!.at <= time - 1000) starts.shift();
    let wait =
      starts.length >= limits.requestsPerSecond
        ? starts[starts.length - limits.requestsPerSecond]!.at + 1000 - time
        : 0;
    let total = starts.reduce((sum, entry) => sum + entry.tokens, 0) + tokens;
    for (const entry of starts) {
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
