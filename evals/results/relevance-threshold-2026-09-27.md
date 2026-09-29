# Source-first retrieval with a neutral public skill

The final frozen installed-package cohort solved **8/10 official SWE-bench tasks
at $5.4396530 in Sol cost**, versus the saved no-Jev baseline’s **8/10 at
$7.6220690**: **28.63% lower coding-agent cost**. All eight baseline
solves were retained. Both failures and their costs are included. No baselines
were rerun. The [machine-readable results](relevance-threshold-2026-09-27.json)
identify the archive, public skill, harness and each attempt.

| Task | Official result (candidate / baseline) | Sol cost | Saved baseline |
| --- | --- | ---: | ---: |
| `django__django-15629` | pass / pass | $1.2286 | $1.5055 |
| `scikit-learn__scikit-learn-13124` | pass / pass | $0.2641 | $0.2944 |
| `pytest-dev__pytest-6197` | pass / pass | $0.8281 | $2.3445 |
| `psf__requests-1142` | pass / pass | $0.2915 | $0.2685 |
| `astropy__astropy-13579` | pass / pass | $0.4586 | $0.4286 |
| `pydata__xarray-3305` | pass / pass | $0.3529 | $0.4937 |
| `sympy__sympy-16792` | pass / pass | $0.5613 | $0.5480 |
| `sphinx-doc__sphinx-8638` | pass / pass | $0.7049 | $1.0595 |
| `matplotlib__matplotlib-26466` | unresolved / unresolved | $0.2637 | $0.3957 |
| `pylint-dev__pylint-4604` | unresolved / unresolved | $0.4860 | $0.2836 |
| **Total** | **8/10 / 8/10** | **$5.4397** | **$7.6221** |

Jev is excluded from scored cost and tokens. Observed Jev API metadata totals
**at least $1.570651236** for this cohort; the complete Jev
charge is unknown. Returned source still contributes to Sol's bill. Average Sol
cost per attempted task is $0.5440 versus $0.7622.

This round is complete. The chosen implementation satisfies the cost/quality
objective against the saved no-Jev baseline. No further experiments are queued.

## What is being measured

The candidate combines hierarchical discovery, content previews, relevance and
scope classification, reference refinement, and source-first output. File
admission is >0.5, matching the unchanged directory threshold. Qualifying files
are retained without a fixed top-N limit. The public skill only explains setup,
invocation and output; it adds no debugging or implementation advice.

One installed archive and the exact public skill are frozen for all tasks. Sol
(`openai/gpt-5.6-sol`, medium) must initially invoke Jevgrep and may then use
ordinary research tools. Saved no-Jev baselines are reused without rerunning.
The official SWE-bench grader determines solves; no supplemental assertions
change those outcomes. Full Sol cost includes unsuccessful attempts and excludes
Jev, whose observed API costs are reported separately.

These are tuned development tasks, not a holdout. One sample per task does not
establish a causal effect, eliminate sampling variance, or demonstrate savings
across arbitrary languages, repositories or agents. The historical 7/10 result
uses an older benchmark runtime, not the exact npm 0.3.2 release. The earlier
[source-first cohort](source-first-2026-09-27.md) is a separate measured artifact.

## Parameter-effect map

| Parameter or strategy | Observation and decision |
| --- | --- |
| Admit current implementation even when buggy | Retained: relevance must include code responsible for the reported behavior. Combined-candidate evidence; individual contribution not isolated. |
| Separate relevance, scope and concrete-reference refinement | Retained with declaration structure and bounded local-call context. Combined evidence, not an independently measured gain. |
| Put source before detailed declaration/call locations | Retained. Earlier frozen cohort kept all eight baseline solves; source appears before long reading leads. Output can still exceed the calling tool's limit. |
| Use query, ancestor folders and previews for ranking | Retained; no unconditional source-over-docs rule. No isolated solve-rate estimate. |
| Raise file admission from >0.25 to >0.5 | Django returned 10 files instead of 51 and passed with the neutral skill. SQLite was omitted, but Sol independently found and fixed it. Query/sampling also varied; smaller retrieval is not proven to be the cause. Frozen for the final cohort. |
| Add test-module suggestions | Pytest passed at $1.2062904 versus $0.5838678 for its parent, without suggesting the missing target. Not adopted. |
| Remove optional test-body filtering | Django still failed at $0.9689942 versus $0.8742672 for its parent; output was truncated. Not adopted. |
| Expand evidence wording to cover conditional gates | Saved SQLite inputs improved initial relevance from .31 to .55, but contextual relevance remained .41. No task run; not adopted. |
| Put general debugging instructions in the public skill | One Django trial passed, but this is outside a retrieval skill's scope. Removed and excluded from adopted product evidence. |

## Evidence and limitations

Raw prompts, Jev requests and responses, model-facing tool packets, patches,
official grades and billing lookups remain under ignored local
`evals/runs/swebench/cost20-research/`. Study names and artifact hashes in the
committed data identify those records. Raw archives are not committed, and no
personal-repository evals contribute to these results.

All eight saved baseline solves are retained.
Requests, Astropy, SymPy and Pylint cost more individually; an aggregate saving is not a
per-task guarantee. Django, Astropy, Sphinx and Matplotlib had truncated model-facing output.
Sol could fill retrieval gaps with ordinary tools. These observations constrain
claims about completeness and why a patch passed.

Product verification covers type checks, lint, parser/selection behavior,
provider failure handling and installed Node-only Docker journeys. The integrated
package was compared with the frozen evaluated archive: executable code and all
runtime assets match; only generated bundle path comments differ. This is
artifact provenance, not a permanent historical-spike compatibility gate.

Matplotlib failed `test_annotate_and_offsetfrom_copy_input[png]`. Both the
candidate and baseline copied `xy` in `_AnnotationBase` and left `OffsetFrom`
unchanged. Local tests passed, but that did not establish the official task solve.
The failure remains in both denominators.

Pylint's official test patch imports `IS_PYPY`, which is absent from the fixture's
`pylint.constants`; collection fails before the behavioral test can run. This is
the same fixture limitation recorded for the baseline. Retain its official
unresolved result and cost in the ten-task denominator; it is neither a verified
solve nor evidence of a demonstrated retrieval regression. The evaluator was
not patched to change the outcome.

## Comparisons and stopping decision

The earlier frozen source-first cohort also solved 8/10 at $5.0664476. This final
cohort costs about 7.4% more than that research cohort, so it is not the cheapest
observed 8/10 result. The earlier cohort used a different public skill and package;
its cheaper results do not validate the current neutral skill. This report does
not combine favorable tasks across cohorts. Relative to the historical 7/10 run,
the final cohort adds one solve at higher cost; that history is not a full
comparison with the exact published npm 0.3.2 package.

Stop here: the fixed ten-task comparison is complete, the public skill remains
limited to CLI usage, and additional tuning would extend the research scope.
The evidence supports adopting this artifact, not claiming it is optimal.

The current research ledger records $57.0473940 in fully billed Sol
attempts, plus $2.1871258 in known charges on incomplete
attempts with 32 unaccounted requests. Total research spend is therefore
unknown. Separately, recorded Jev metadata totals at least
$18.783240000, excluding unreconciled diagnostic
calls. These research totals are not the ten-task benchmark cost.
