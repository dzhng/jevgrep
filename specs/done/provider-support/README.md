# Saved-provider support

Jevgrep routes its [saved providers](../../../packages/core/src/providers.ts) through
one TypeSafe-compatible AI SDK adapter. Provider selection changes transport while
keeping retrieval behavior fixed.

## Why selection belongs in auth

Coding agents should research code without managing provider routing. A human
chooses a provider and key during `jg auth`, and ordinary search and doctor use
that saved record until auth replaces it. This avoids ambiguous environment-key
precedence and accidental provider fallback. Automation has one explicit path:
`jg auth --provider NAME --stdin`.

The only compatibility exception is deliberate: a saved key without a provider
still means Vercel. Reading it does not migrate or rewrite the file. Environment
credentials are no longer a product input; users who relied on them need auth.
This is a simpler setup contract, not a multi-account credential registry.

## What must stay true

- Provider changes select transport, not retrieval policy. Structured state,
  question wording/order, hierarchy, thresholds, excerpts and search stdout keep
  their frozen-reference contracts.
- The application owns actual HTTP attempts, retries, shared rate-limit cooldown
  and cancellation. SDK retries remain disabled. The 50,000-attempt guard protects
  against runaway work; it is not an optimization budget.
- TypeSafe throughput is paced by estimated input tokens and request starts,
  independently of the concurrent-request ceiling. Reservations use conservative
  payload bytes until reported usage is available. Queue waits happen before the
  network timeout and source is revalidated after waiting. These budgets belong
  to one search; other processes sharing the account can still cause rate limits,
  so provider cooldowns remain authoritative.
- Source freshness is checked before attempts and cached evidence use. An invalid
  provider answer is failure or incomplete discovery, never negative evidence.
- Exact answer-cache identity separates provider, endpoint, model and protocol,
  as well as existing parser/prompt/policy identity. Old-wire answers cannot
  certify the new route.
- Auth saves one private record atomically and never verifies a key over the
  network. Doctor checks separately with synthetic source. Keys never belong in
  chat or CLI output.
- Tests route requests outside the product. There is no public endpoint/model
  override or provider flag on search/doctor, and no automatic fallback.

The [preset owner](../../../packages/core/src/providers.ts),
[evaluator](../../../packages/core/src/evaluator.ts), and
[auth module](../../../apps/cli/src/auth.ts) hold the current mechanics.
[Provider behavior tests](../../../test/evaluator.test.ts) cover evaluation semantics; [installed journeys](../../../test/installed.test.mjs)
exercise the packed product. The [historical preservation contract](parity.md) records the retired port checks. [Research](research.md) records the documented routes,
model choices, pinned SDK and immutable inputs rather than relying on memory.

## What the implementation taught us

Changing the adapter and exposing saved-provider setup are one product cutover:
shipping the picker first would allow a setup the old evaluator could not honor.
The protocol was proved separately before that cutover.

A test-only Node preload preserves the SDK's original JSON body while redirecting
its fixed destination to a local fixture. Rebuilding the body as a Request stream
obscured HTTP 401 in Node; retaining the original body fixed the test transport.
The preload is not part of the npm package. Historical replay continues to use its
original protocol; only production requests are strictly normalized for comparison.

New benchmark plans freeze that preload and use schema 4. Archived studies retain
their original runners; neither baselines nor historical results are rewritten.
The [maintained runner](../../../evals/implementation/swebench/installed.py) and
[broker](../../../evals/implementation/swebench/gateway_broker.py) remain Vercel-only
for evaluation. They retain observed Jev billing separately from scored coding-agent
cost, and unavailable totals remain unknown.

## Evidence and limits

[Final verification](assets/final-verification.md) records the exact candidate,
passed gates and review. The same tarball passed 32 installed Docker tests and
10 native macOS journeys. The three-provider replay preserves the frozen packet;
this is transport evidence, not a new solve-rate or savings benchmark.

Vercel and TypeSafe passed live doctor checks using isolated credentials from
the user-provided local environment file. OpenRouter live access remains
unverified because no key was available. No claim of identical live model probabilities, equal
solve quality, fresh cost savings or faster retrieval follows from fixture tests.
No npm release or paid agent benchmark was performed.

The [auth record and complete packet](assets/auth-verification.md),
[evaluator verification](assets/evaluator-verification.md), and
[protocol reproduction](assets/protocol-verification.md) retain the review evidence.
The [choices ledger](choices.md) explains the additional benchmark-format decision.
There was no visual design or image requirement for this change.
