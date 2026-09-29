# Total task cost including Jev

A fresh run of published `@dzhng/jevgrep@0.4.3` preserved the same **8/10 official
SWE-bench solves** as the saved no-Jev baseline. Full task cost was **$5.6563991**:
**$4.1779912 Sol + $1.4784079 Jev**, versus **$7.6220690** without Jevgrep.
That is **25.8% lower total cost**, including both unresolved attempts.

| Task | Official outcome | Sol reported cost | Jev estimate | Combined | No-Jev baseline |
| --- | --- | ---: | ---: | ---: | ---: |
| `pydata__xarray-3305` | pass | $0.4309 | $0.2701 | $0.7009 | $0.4937 |
| `sphinx-doc__sphinx-8638` | pass | $0.3715 | $0.1678 | $0.5392 | $1.0595 |
| `scikit-learn__scikit-learn-13124` | pass | $0.2129 | $0.0794 | $0.2923 | $0.2944 |
| `django__django-15629` | pass | $1.1522 | $0.3515 | $1.5037 | $1.5055 |
| `psf__requests-1142` | pass | $0.3368 | $0.0128 | $0.3496 | $0.2685 |
| `astropy__astropy-13579` | pass | $0.3436 | $0.1501 | $0.4938 | $0.4286 |
| `pytest-dev__pytest-6197` | pass | $0.4169 | $0.1119 | $0.5289 | $2.3445 |
| `sympy__sympy-16792` | pass | $0.2662 | $0.0930 | $0.3592 | $0.5480 |
| `matplotlib__matplotlib-26466` | unresolved | $0.4214 | $0.1752 | $0.5966 | $0.3957 |
| `pylint-dev__pylint-4604` | unresolved | $0.2256 | $0.0667 | $0.2923 | $0.2836 |
| **Total** | **8/10** | **$4.1780** | **$1.4784** | **$5.6564** | **$7.6221** |

Cost per attempted task is **$0.5656 versus $0.7622**. Total spend divided by
solved tasks is **$0.7070 versus $0.9528**. This includes spend on failed tasks;
it is not the mean cost of only the successful attempts.

## Accounting basis

Total task cost includes both Sol and Jev by default. The
[accounting policy](../accounting.md) governs future evaluations. Jev tokens are
still shown separately from coding-agent tokens, and returned context contributes
to Sol's bill.

Sol charges come from retained Gateway generation metadata. Native TypeSafe Jev
cost is a **list-price estimate**, calculated from response `usage.input_tokens`
at **$0.042 per million input tokens** for `jev-1.13.0`; output tokens are free.
The rate comes from [TypeSafe's model documentation](https://docs.typesafe.ai/models),
retrieved on September 28, 2026 and retained with the run. It does not subtract
free credits or assume negotiated discounts. Neither component is invoice
reconciliation. All ten attempts have complete transport and usage coverage;
missing coverage would make the combined total unknown rather than zero.

The [machine-readable report](total-cost-2026-09-28.json) retains package and
receipt hashes, price provenance, per-task components, runtime, token usage and
links to raw evidence. Raw traces and the frozen pricing document remain in
ignored `evals/runs/swebench/total-cost-2026-09-28/` storage.

## Protocol and limits

This is one fresh first attempt per task with the published package and its exact
public skill, native TypeSafe retrieval, and `openai/gpt-5.6-sol` at medium effort.
Initial Jevgrep use remains required; agents can then use ordinary tools. Tasks
ran sequentially. Saved no-Jev baselines were reused, never rerun. Official
SWE-bench grading alone determines the outcomes; Matplotlib and Pylint remained
unresolved. Every attempt and its costs count.

This is a repeat of ten tuned Python tasks, not a holdout or a variance estimate.
Sol used different queries and trajectories than the earlier run. Consequently,
this report is a new measurement, not merely the old bill with Jev added. The
[previous speed cohort](speed-2026-09-28.md) retains its original Sol-only totals
for historical comparison. Its advertised savings should not be read as including
Jev. No product code or skill was tuned during this repeat.
