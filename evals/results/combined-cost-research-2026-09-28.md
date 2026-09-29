# Combined-cost research

Reducing retrieval expense did not reduce total task expense in the completed
ten-task experiment. The candidate retained 8/10 official solves, matching the
fixed baseline, but its known charges already exceed the baseline before any
allowance for missing native usage. It is not a verified combined-cost improvement. The user subsequently accepted
the small observed combined-cost difference for release 0.5.0 in exchange for
roughly 59% lower Jev cost with unchanged official solves. That is a product
acceptance decision, not a statistically established equivalence margin.

The [result data](combined-cost-research-2026-09-28.json) owns task-level costs,
package identity, accounting assumptions and timings. Its comparison is the
[fixed total-cost cohort](total-cost-2026-09-28.md), not a fresh baseline run.
The final, separately identified batch-size follow-up also failed to establish a
combined-cost improvement. It solved Pytest, but known charges alone were above
that task's fixed baseline; one Sol charge remains unavailable. The smaller-batch variant is not promoted; 0.5.0 uses the completed ten-task
candidate. The initial closeout decision and later release authorization are
retained separately in the result data.

## What the experiment establishes

Larger declaration batches, shared question criteria and preview-based admission
can substantially reduce Jev requests and input charges while retaining official
solve outcomes on this tuned cohort. Those savings are insufficient when the
coding agent does more exploration, patch revision or verification. The decision
metric must remain the complete coding task plus retrieval, including failures.

Useful extra excerpts are not automatically cheaper context. Conversely, a shorter
packet is not automatically better: relevant helpers and regression examples can
save later exploration. Retrieval-only probes identify mechanisms worth testing;
they cannot establish a total-task cost win.

Fewer requests also did not imply faster task completion. The retained wall-clock
observations include retrieval, coding and local verification, but exclude setup
and official grading. Provider and host conditions were not controlled, so these
are observed timings rather than a causal speed benchmark. In the slow Astropy
run, native responses averaged under one second while gaps between requests
dominated elapsed retrieval time.

## Limits and accounting

Scikit-learn has 19 native calls with empty responses. Their actual charges remain
unknown. The reported ceiling assigns each the full 65,536-token request allowance
at the retained public input price; it never treats missing usage as free. The
candidate costs more even without that allowance. Native prices are list-price
estimates, not reconciled invoices.

All ten comparisons retain their first attempts, matching task prompts, source
revisions, runtime images and model settings. The candidate packages the current
public retrieval skill. No cheapest-result pooling or baseline reruns are used.
These repeatedly studied Python tasks do not establish language-wide or untouched
task generalization.

The user relaxed the original 15% target to permit an evidence-based stopping
point. That changes when research can conclude; it does not change the measured
results or justify publishing a cost increase as a saving.
