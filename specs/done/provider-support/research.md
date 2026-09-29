# Provider contract evidence

Historical provider-port evidence: the frozen-spike compatibility requirements
below were retired in favor of [official task completion and cost](../../../evals/cost-quality-policy.md).
They do not constrain current retrieval, skill wording or output formatting.

Provider endpoints and model IDs live in the [preset registry](../../../packages/core/src/providers.ts).
These sources explain the protocol choices behind those presets:

- [Vercel TypeSafe API](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe)
  documents the TypeSafe-compatible route rather than chat completions.
- [TypeSafe models](https://docs.typesafe.ai/models) documents versioned model IDs;
  pin the native model because retrieval thresholds are calibrated.
- [OpenRouter's Jev guide](https://openrouter.ai/blog/insights/what-is-jev/)
  documents its TypeSafe-compatible route and bare model ID.
- [OpenCode Zen models](https://opencode.ai/v2/docs/console/models/#jev)
  documents the same TypeSafe-compatible protocol. The existing adapter can serve
  it without changing request or answer handling.

The native TypeSafe client examples use a base URL without `/v1`; the AI SDK
adapter appends only `/systemone`, so its presets include `/v1`. Do not substitute
OpenRouter chat completions or its separate `/api/alpha/decisions` API.

The OpenCode integration author reported live verification on 2026-09-27: `jg auth --provider opencode --stdin` saved the key and `jg doctor` reported `Jev connection verified through OpenCode Zen.`, confirming the Zen response matches the SDK's zod schema (noul answers). A real search returned relevant files.

Versioned native/OpenRouter names do not prove identical backends or answers to
Vercel's alias. Preserve existing thresholds; do not claim cross-provider solve
quality from transport fixtures. Record actual returned model identity in external
probe evidence when available. A conflicting live API result goes into this record
before changing a preset; never silently try other providers/models.

## Adapter identity and behavior

Use `@ai-sdk/typesafe-ai@3.0.8` with the existing `ai@7.0.107`, verified by the
[published-package reproduction](assets/protocol-verification.md). Registry metadata inspected:

```text
dist.integrity = sha512-nP5NJGCwZ7jDE2dImurTU9igbj1OUeFAXLvZKcM05KlBpLxhOddBe3sMftAhQq3Zq+B8NqLx1dcW4vQVD2l32w==
@ai-sdk/provider = 4.0.18
@ai-sdk/provider-utils = 5.0.49
```

The official [provider source](https://github.com/vercel/ai/blob/main/packages/typesafe-ai/src/typesafe-ai-provider.ts)
exposes `createTypeSafeAi({apiKey, baseURL, fetch})` and `evaluationModel(modelId)`.
It has an environment-key default; always pass the validated saved key explicitly.
The [evaluation implementation](https://github.com/vercel/ai/blob/main/packages/typesafe-ai/src/typesafe-ai-evaluation-model.ts)
maps boolean questions to `noul`, posts structured state/questions with a model,
and maps native answers back to boolean probabilities. Inspect the immutable npm
artifact before treating moving GitHub source as the installed contract.

## Billing and errors

Vercel's compatible response documents `provider_metadata.gateway.cost` and
`generationId`, with snake-case token usage. OpenRouter examples expose
`usage.cost`, snake-case token usage, and a response ID. These are candidates for
the maintained broker's raw-response decoder, not reasons to add CLI telemetry.
Native TypeSafe billing may be absent. Unknown totals remain unknown; observed
Jev billing stays separate from scored coding-agent task cost.

The adapter's error classes differ from Gateway's. The [protocol checks](assets/protocol-verification.md) reproduce HTTP status,
timeout, disconnect, and malformed-response behavior; the evaluator maps those
to the existing retry/split semantics. Primary [TypeSafe API documentation](https://docs.typesafe.ai/api)
and the Vercel guide describe native errors; fixtures must use their shapes.

## Immutable preservation baseline

Repository input: `ca7054ed4c50283030102d15cd73d816e85bc569`. This Git tree pins the
pre-change production implementation, lockfile, policy, parser versions, source tree,
skill, test harness, and previously recorded evidence. The additional historical
source hashes are owned by [the reference manifest](https://github.com/dzhng/jevgrep/blob/80a216bfa0bf04b2ec615ede81f7af32f1c14153/test/reference/manifest.json).
Keep that manifest, its covered files, [the corpus](https://github.com/dzhng/jevgrep/blob/80a216bfa0bf04b2ec615ede81f7af32f1c14153/test/reference/corpus.json),
and all historical benchmark results unchanged.

The corpus compares a request multiset: independent network arrival order is not
an invariant. Order inside state arrays and question objects, answer association,
selection/evidence ordering, and complete rendered stdout are invariants. Keep
existing decision/order regressions alongside semantic wire comparison; never
serialize production concurrency to make a replay easier.

The [corrected repeat](../jevgrep/assets/variance-repeat.md) is historical
evidence, not a new-provider acceptance result. Baselines are immutable and are
never rerun for this feature. Neither equal success rate nor fresh savings is
established by transport checks.
