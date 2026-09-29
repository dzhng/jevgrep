# Retrieval research lessons

This document records historical experiments and their limits. The old spike's
seven-of-ten cost-win target is retired; it is not a product acceptance rule.
The [current architecture](../../../docs/architecture.md) defines version-to-version
improvement, with official task completion primary and full Sol cost reported.
The [final research report](../../results/relevance-threshold-2026-09-27.md)
summarizes the adopted changes and measured limits. The local
[research ledger](../../runs/swebench/cost20-research/research.json) retains raw attempt provenance. The
[earlier ledger](../../runs/swebench/auto-research-80/research.json) preserves the
original experiments; its acceptance decisions describe the rules used then.

## Measure the completed coding task

A useful retrieval packet is an intermediate result. Smaller output, fewer
searches, or higher classifier scores can be outweighed by additional reasoning,
patch revisions, and tests. Count the full Sol Gateway bill per attempt, including
failed attempts; exclude Jev charges and Jev tokens under the user's policy.
Returned source still contributes to the coding agent's bill. Keep experimental
spending separate from candidate task cost; the
[spend audit](../../runs/swebench/auto-research-80/research-spend.json) states its scope.

Reuse each task/model/harness baseline permanently. Freeze a candidate within a
confirmation cohort, retain every planned outcome, and keep pilots separate.
A lower-cost failed patch is not a successful cost win. Do not assemble a claimed
winning strategy by choosing the cheapest result from different variants per task.

## Selection and presentation are different decisions

A file can be worth checking without deserving its complete contents in initial
context. Likewise, a declaration location can be useful even when its source
does not pass the excerpt threshold. Optional ranked leads let the coding agent
fill gaps without making every returned path a reading obligation. The
[unit-location cohort](../../runs/swebench/auto-research-80/unit-locators-confirmation/result.json)
supports this design, but individual savings remain noisy.

Do not assume that more source improves research. The
[source-inclusion diagnostic](../../runs/swebench/auto-research-80/source-inclusion-diagnostic/summary.json)
distinguished several primary implementations from generic nearby declarations,
yet its [full packet](../../runs/swebench/auto-research-80/source-inclusion-packet/summary.json)
was still broad. Small operator-selected groups are diagnostics, not a substitute
for evaluating the entire returned packet and the agent's subsequent actions.

## Bind code to the thing being classified

Jev requests use native objects and arrays passed to the AI SDK; code is a string
inside those objects. The SDK serializes the HTTP body. Byte-size checks and trace
files use JSON serialization, but the application does not pass a stringified
`state` to `evaluate`.

The [three-shape comparison](../../runs/swebench/auto-research-80/declaration-only-diagnostic/summary.json)
tested shared source with declaration pointers, shared source plus per-declaration
source, and declaration source alone. Removing the shared blob improved several
primary-block scores. It did not solve related-helper discovery, and the
[native confirmation](../../runs/swebench/auto-research-80/declaration-only-confirmation/result.json)
lost a Django solve. Preserve the representation finding without claiming that it
establishes a better end-to-end strategy.

Line numbers belong in local source-location metadata; IDs can bind classification
questions to source objects. The [ID comparison](../../runs/swebench/auto-research-80/declaration-id-diagnostic/summary.json)
found similar scores overall, with some threshold-sensitive differences. Removing
metadata is not proof of unchanged model behavior.

For exact questions and state fields, use the
[frozen request contract](../../runs/swebench/auto-research-80/declaration-only-confirmation/request-contract.json)
and [verbatim diagnostic requests](../../runs/swebench/auto-research-80/declaration-only-confirmation/exact-diagnostic-requests.json).
Those saved diagnostic requests are not captures of native benchmark HTTP calls.
Do not explain the implementation with invented implementation-versus-test
question routing: the frozen candidate applies the same predicate to every
declaration within a pass.

## Keep selected source separate from surrounding context

Comments and local context preserve meaning, but automatic expansion into nearby
methods can include code the classifier never selected. The
[stage audit](../../runs/swebench/auto-research-80/usefulness-expansion-audit/summary.json)
found that rendering context and feeding expanded ranges into another expansion
pass substantially increased output. Store selected ranges separately from
rendered ranges. This is a design lesson; removing the expansion in a trial did
not by itself establish an end-to-end win.

Respect repository eligibility rules before classifying content. The
[Git-ignore audit](../../runs/swebench/auto-research-80/ignored-artifact-audit.json)
identified generated files in retrieval output that ordinary ripgrep discovery
skipped. The [corrected filter diagnostic](../../runs/swebench/auto-research-80/git-ignore-v2-packet/summary.json)
removed those files while retaining tracked source. Its native pilot still cost
more than baseline, so input cleanup is not a demonstrated cost optimization.
Searching nested repositories under a non-Git computer root remains unvalidated.

The [focused source-inclusion comparison](../../runs/swebench/auto-research-80/inclusion-exact-django-pilot/django__django-15629/trace-audit.json)
also cautions against treating less output as progress on its own: removing implicit
neighbor expansion reduced the native Django packet from 4,441 to 3,543 lines,
but lost the official solve. Both packets were truncated in model-facing tool
output. Fresh classifications and agent sampling differ between these single
attempts, so neither the size difference nor the regression establishes a causal
effect of expansion alone.

## Seeing a file does not guarantee a correct patch

Django failures repeatedly read the relevant SQLite code but tested a combined
type-and-collation change, missing a collation-only change. Retrieval recall alone
cannot explain that failure. Conversely, the Matplotlib missing-helper case
exposes a discovery limitation: exact symbol-reference questions can omit sibling
APIs with the same failure mechanism. A
[conditional ownership diagnostic](../../runs/swebench/auto-research-80/input-ownership-diagnostic/summary.json)
found that helper through a factual code predicate. The subsequent
[native ownership trial](../../runs/swebench/auto-research-80/ownership-primary-matplotlib-pilot/matplotlib__matplotlib-26466/trace-audit.json)
returned the helper in source and reading leads, yet Sol still changed only the
query-named annotation constructor and failed the official check. This exposes a
presentation question as well as discovery: a returned declaration may need a
concise explanation of why its behavior matters. The
[evidence-label follow-up](../../runs/swebench/auto-research-80/ownership-label-matplotlib-pilot/matplotlib__matplotlib-26466/trace-audit.json)
also failed: the helper and its label reached Sol, but Sol left it unchanged.
Neither recall nor a brief rationale alone established a solve improvement.

The [instrumented retrieval](../../runs/swebench/auto-research-80/ownership-primary-audit/summary.json)
also recorded 137 failed declaration-call attempts. An incomplete packet with no
excerpt is not evidence that Jev confidently rejected every declaration. Keep
service failures separate from healthy negative decisions when interpreting
retrieval experiments.

Official grading is the primary benchmark measure, not proof of all behavior.
An additional [compatibility check](../../runs/swebench/auto-research-80/declaration-only-confirmation/scikit-learn__scikit-learn-13124/compatibility-audit.json)
found changed behavior in an officially passing patch. Keep this evidence beside
the official score rather than silently rewriting it. Pylint has a separate
[test-collection caveat](../../runs/swebench/auto-research-80/reserved-check/control-failure-audit.json);
its raw non-passes must not be presented as demonstrated behavioral failures or
reclassified as solves.

## Implementation evidence and test examples serve different purposes

A primary implementation body can save a direct read. The
[primary-file candidate](../../runs/swebench/auto-research-80/primary-implementation-confirmation/result.json)
repeated its scikit-learn official cost win, but lost the Django baseline solve.
Making implementation evidence more prominent is not enough to preserve quality.
The failed Django packet was not truncated and included the relevant condition;
using the [full issue](../../runs/swebench/auto-research-80/full-problem-django-packet/summary.json)
as the retrieval query did not materially improve supporting coverage.

An existing test need not already reproduce the complete defect to be useful.
Its setup and assertions can help isolate the changed behavior. The
[test-example pilot](../../runs/swebench/auto-research-80/test-adaptation-django-pilot/django__django-15629/trace-audit.json)
surfaced the collation test read first in a previously successful trace; Sol then
built a focused regression and passed officially at a small cost saving.
That is provisional evidence: query and classification varied, and the
[frozen confirmation](../../runs/swebench/auto-research-80/test-adaptation-confirmation/result.json)
ended with five verified cost wins, three definite non-wins, and one interrupted
attempt with unknown full cost; one task was unrun under its stopping rule.
That experiment did not establish a replacement under the criteria used at the time.

Classifier questions must distinguish storing input from merely reading it.
[Paired source-shape checks](../../runs/swebench/auto-research-80/ownership-isolated-source-diagnostic/summary.json)
did not fix false ownership labels on getters. An
[explicit state-write predicate](../../runs/swebench/auto-research-80/ownership-direct-write-diagnostic/summary.json)
reduced those false positives but made the desired helper threshold-sensitive.
A precise question can trade recall for precision; do not equate clearer wording
with an end-to-end improvement.

## Limits on conclusions

All ten tasks have now been inspected and used in development. They span Python
repositories, but are a small purposive sample with single fixed baselines.
Repeated tuning on them is not untouched holdout evidence, and neither language
generality nor whole-computer scaling has been established. A new product version must be compared with the preceding released version under
the current architecture’s evaluation policy. Historical spike thresholds and
supplemental compatibility checks do not decide promotion. Aggregate savings alone
do not establish better task completion.
