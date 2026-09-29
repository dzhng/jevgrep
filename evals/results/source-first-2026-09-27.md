# Source-first retrieval research

The completed development cohort solved **8/10 official SWE-bench tasks at $5.0664476
in Sol cost**, compared with the saved no-Jev baseline's **8/10 at $7.6220690**.
That is **33.53% lower coding-agent cost**, including failed attempts. All eight
baseline solves were retained. Baselines were reused, never rerun for these trials.
Jev is excluded from this metric: observed Jev metadata totals at least $1.876399938;
the complete Jev charge is unknown.

These are ten tuned Python tasks, not an untouched holdout or proof of general
savings. The earlier published benchmark runtime scored 7/10 at $4.5195532: the
new cohort gains one solve and costs about 12.1% more than that historical run.
That historical artifact is not the exact npm 0.3.2 package.

## What changed and what the experiments established

| Change | Evidence and decision |
| --- | --- |
| Treat current implementation as evidence, even when buggy | Retained in the combined candidate; relevant code must not be rejected because it contradicts desired behavior. Its individual effect is not isolated in the final cohort. |
| Separate relevance and scope; refine selections using concrete references | Retained with supporting class headers and bounded local-call context. Combined evidence, not independently attributable gains. |
| Put verbatim source before detailed declaration/call locations | Frozen source-first candidate passed all eight previously solved tasks. This makes implementation visible before long reading leads consume the tool output budget. |
| Use query and ancestor-folder context for priority | Retained. Folder names inform relevance rather than imposing unconditional source-over-docs rules. No separate quantified solve-rate effect. |
| Add test-module suggestions | Pytest passed at $1.2062904 versus $0.5838678 for its parent; the missing target was not suggested. Not adopted. |
| Remove optional test-body filtering | Django still failed, costing $0.9689942 versus $0.8742672 for its parent; larger output was truncated. Not adopted. |
| Ask the agent to test combined conditions independently | Only the actual public skill changed; Django passed at $1.1036896 versus the same CLI's failure at $0.8742672. Not adopted: general debugging guidance is outside this retrieval skill’s scope. |

No further architecture experiments are planned for this round. The evidence
supports ending this research round without claiming the strategy is optimal.
The [architecture](../../docs/architecture.md) describes the integrated design;
[version policy](../cost-quality-policy.md) defines future comparisons.

## Distinguish the measured artifacts

The ten-task cohort used one frozen source-first package and the original public
skill throughout. The [machine-readable results](source-first-2026-09-27.json)
identify its package, model, skill and each task. Later product integration and
skill trials are separate and are never substituted into that cohort.

The exact published npm 0.3.2 package failed the Django task at $0.996692. The
integrated CLI with its original public skill also failed, at $0.8742672. With
only the public skill paragraph about independent conditions changed, the same
CLI passed: Sol tested collation-only changes, found the remaining SQLite trigger,
and fixed it. This experiment is not adopted: the public skill must only teach Jevgrep usage,
not general debugging. Its pass is not evidence of an adopted retrieval improvement.
The public skill was subsequently simplified to neutral CLI usage: no required
research sequence, bans on independent exploration, or agent-specific polling
settings. The recorded cohort retains its original skill identity; those results
do not measure the rewritten skill.

## Failure evidence and grading limits

Matplotlib failed the official annotation/OffsetFrom test. Both this candidate and
the saved baseline changed the shared annotation code but missed OffsetFrom.
A Docker I/O failure invalidated the first grading attempt; the same saved patch
was regraded successfully, without rerunning the coding agent, and officially failed.

Pylint's patch applied, but official test collection failed because the test patch
imports `IS_PYPY`, absent from the fixture's constants module. The saved baseline
has the same limitation. Its official unresolved score is retained in the ten-task
denominator; it is not evidence of a demonstrated behavioral regression or a solve.

The skill trial's tool output was truncated. Model-facing packets, rather than
full command-output logs, were used to assess what Sol actually saw. No supplemental
assertion overrides official SWE-bench scores.

## Reproducibility and research spend

The per-task results include exact study names. Local raw prompts, model/tool
traces, patches, grader reports and billing lookups remain under
`evals/runs/swebench/cost20-research/`, which is ignored by Git. Curated results
are committed separately from this bulky research state. No personal-repository
evals are part of this comparison.

Before the file-admission follow-ups, the ledger recorded $51.607741 in fully billed Sol research attempts, plus
$2.1871258 known charges on incomplete attempts with 32 unaccounted
requests. Therefore total research spend is not fully known. Separately, known
Jev response metadata totals $17.212588764 across recorded research; that is not
an invoice-reconciled total. Research spend is not cost per benchmark task.

## Subsequent product validation

This cohort retains its original package and skill identity. The final product
uses a neutral CLI-only skill and stricter file admission, measured separately in
the [relevance-threshold report](relevance-threshold-2026-09-27.md). Its results
must not be pooled into this earlier cohort.
