# Product evaluation: task completion and total cost

Official SWE-bench task completion is the primary outcome. Compare a candidate
with the preceding product version's saved benchmark evidence on matched tasks,
and identify exactly which artifacts and protocols were measured. Report the
full task cost (coding agent plus Jev) per attempted task alongside quality; increased cost may
be an acceptable tradeoff for more completed tasks. Old spike cost-win counts,
parity assertions and supplemental compatibility checks are not acceptance gates.

Keep the same source, Sol model and harness for a comparison. Use the actual
public skill packaged with the candidate. Retrieval experiments keep that skill
fixed. The public skill teaches CLI usage only; do not tune it with general
debugging advice or agent-specific workflow rules to improve benchmark scores.
A change to its usage instructions is identified separately in comparisons. Required initial Jevgrep use and ordinary follow-up search remain part of
the paired protocol. Timing is diagnostic, not an optimization target.

Run a baseline only once per task, model and harness. Reuse that fixed result;
candidate changes do not justify another baseline run. Preserve its complete
trace, patch, official grade and billing. Saved no-Jev baselines remain useful
context, separately identified from the previous product's results.

Freeze each candidate within its cohort and retain every attempted outcome.
Report individual task costs and cohort totals. Keep development pilots separate
from confirmation runs; do not select favorable repetitions or combine the best
result from different candidates for each task. Partial cohorts remain explicitly
partial. An additional failure does not erase already verified solves.

Total scored task cost includes both coding-agent and Jev charges by default.
Keep their cost components separate. Native TypeSafe usage is priced at the
retained public model rate and clearly labelled as an estimate; Gateway metadata
is reported cost, not an invoice. Jev tokens remain separate from coding-agent
token totals. Retrieved source counts toward the coding agent's context cost. Include unsuccessful
attempts; unknown charges are unknown, never zero. Preserve infrastructure failures
and investigate them separately from product failures. Supplemental observations
can explain behavior but do not rewrite official solve results.

Architecture experiments and packaged-product runs must name their measured
artifacts. Record port differences and verification separately from benchmark
scores. A small, tuned Python cohort supports an observed comparison, not a claim
of reliability across arbitrary repositories, languages or coding agents.

This policy supersedes historical spike acceptance rules. Frozen plans, earlier
verdicts and raw evidence retain the criteria used at the time; they are not
rewritten to manufacture a new result. [Accounting](accounting.md) describes the
retained billing evidence and source-isolation rules.
