# Jevgrep implementation record

Jevgrep turns a repository question into qualifying file locations, reading leads
and verbatim source excerpts for a coding agent. The installed `jg` CLI and its
explicit skill are implemented and verified as a Node-only package on macOS and
Linux. The caller owns the resulting patch and tests; retrieval does not generate
an answer or establish that the caller used its evidence correctly.

## Closure decision and measured limits

The user accepted the corrected package's documented quality tradeoff and asked
to finish the remaining work. This closes the implementation plan, **not the
original benchmark gate as passed**. The corrected ten-task cohort solved six,
preserved six of eight baseline solves, and achieved four successful cost wins.
Its full Sol cost was 27.30% lower including failures. The
[corrected confirmation](assets/freshness-confirmation.md) owns the exact receipts,
trace comparisons and immutable aggregate; its `accepted: false` verdict remains.
The earlier [passing confirmation](assets/work-clock-confirmation.md) belongs to
its own frozen package and cannot replace the corrected candidate's result.

The separately authorized [identical-runtime repeat](assets/variance-repeat.md)
finished with seven solves, seven of eight baseline solves preserved, four
successful cost wins and 40.70% lower full Sol cost. Its original gate also remains
failed. Both cohorts retain every attempt; neither best-cell pooling nor baseline
reruns contribute to either result. No further repeat was authorized or run.
The user explicitly authorized publication, and `0.1.0` is published on npm.
The [release evidence](assets/release-0.1.0.md) records local validation,
CI publication and registry verification. Both measured cohorts retain the frozen
`0.0.0` archive; release preparation changes version identity, not their evidence.

## Why this shape

The accepted experimental strategy traverses multiple qualifying paths rather
than choosing a fixed top-N set. It returns evidence early in stdout, retaining
all admitted locations even when no excerpt is confident. Navigation, selected
source and rendered context serve different purposes; merging those meanings
would silently change the measured policy. Exact healthy request and output
parity is therefore a constraint on product engineering, not an optimization target.

Product requirements add filesystem eligibility, snapshot freshness, bounded
failure recovery, cancellation and answer caching around that strategy. These
boundaries protect source disclosure and honest partial results. They do not
promise atomic reads of a changing filesystem or a successful downstream fix.
The [restoration record](assets/parity-restoration.md) and
[freshness evidence](assets/source-freshness.md) own the tested equivalence and
remaining boundaries.

The smaller Python grammar parser did not preserve the reference's AST behavior.
Bundled CPython runs the retained helpers without requiring an installed Python
executable. [Runtime evidence](assets/python-runtime.md) records version, packaging,
license provenance and exercised syntax limits. This is measured compatibility,
not a proof over every Python program. Meaningful declaration and completion
order must not be normalized to make a comparison pass.

## Invariants and owners

- One filesystem reader owns eligibility and snapshot identity. Buffered source
  donors are revalidated before evaluator dispatch, including retries; final
  returned files are checked after context lookup. Already dispatched requests
  cannot be withdrawn retroactively.
- One evaluator owns retries, cancellation and actual request accounting. Cache
  entries contain validated answers keyed by exact semantic request and namespace,
  never source or credentials. Completion-order changes can produce novel requests
  on a warm search; identical native requests still reuse successful answers.
- Selected and rendered ranges remain distinct, and returned source is attributable
  to snapshot bytes. The current renderer places source before detailed reading leads; see the [architecture](../../../docs/architecture.md). Explicit
  source-budget overrides do not remove qualifying file locations.
- The CLI owns credentials, stdout, exit status and the canonical bundled skill.
  Core does not print. Incomplete or interrupted evidence is labeled; an empty
  healthy result is distinct from failed evaluation.
- The official harness drives the installed package. Baselines are immutable and
  reused without execution; failed attempts and unknown bills remain counted.
  Jev API observations are separate from scored Sol cost and are not invoice
  reconciliation. No personal-repository evaluation fixtures ship in the package.

The [contracts](contracts.md) define public semantics; the
[choices ledger](choices.md) records implementation decisions and tradeoffs.
Mechanics live in [core](../../../packages/core/src/),
[CLI](../../../apps/cli/src/), [installed tests](../../../test/installed.test.mjs)
and [retrieval behavior tests](../../../test/retrieval.test.ts). The
[official runner guide](../../../evals/implementation/swebench/installed.md)
owns retained-task execution and accounting. The
[release guide](../../../scripts/RELEASING.md) owns deliberate publication.

## Evidence provenance and rejected directions

The [decision map](map.md) preserves the user constraints and interview rationale;
[research](research.md) distinguishes the frozen winner from adjacent experiments.
The [recorded stdout](assets/stdout-example.txt) is a deterministic reference fixture,
not a live-provider result. There was no visual design baseline: installed-process
transcripts and source/request comparisons are the relevant review artifacts.

The [first CPython confirmation](assets/cpython-confirmation.md) retains a failed
cohort for the bundled interpreter strategy that ships. The separate
[query trial](assets/query-framing-study.md) and
[presentation trial](assets/presentation-study.md) retain unpromoted strategy
changes and their causal limits. Lower aggregate cost
alone does not cure a lost solve. The tuned sample is Python-only and observed
during development; it establishes neither untouched generalization, TS/JS task
quality, universal savings nor whole-computer scalability. Windows and broader
provider/agent evaluation remain outside this implementation's scope.
