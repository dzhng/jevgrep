# Python parser checkpoint — 2026-09-29

The merged Tree-sitter Python parser passed one official SWE-bench task,
`psf__requests-1142`. The installed candidate was built from `ae10a9e`; although
its manifest reads 0.6.0, it is not the published 0.6.0 package. Its SHA-256 is
`3309d67d7ae8d5a9ca824eaf7d1d5a0c2193df6422998d18cd8f34d61c2cff38`.

| Observation | Result |
|---|---:|
| Official resolved tasks | 1 / 1 |
| Coding-agent cost | $0.397791 |
| Jev cost (native input-usage estimate) | $0.005494944 |
| Total task cost | $0.403285944 |
| Jev requests | 16 |
| Agent wall time | 117.79 s |
| Charged work time | 105.14 s |
| Credited standalone retrieval wait | 12.64 s |

Required retrieval and timing protocol checks passed; all billing was reconciled.
Six declaration-selection requests covered `requests/models.py`,
`requests/adapters.py`, and `test_requests.py`, confirming structural Python
parsing was exercised rather than only directory navigation.
The retained no-Jev baseline also passed and cost $0.2685004. That historical
comparison does not isolate the parser change, and this checkpoint is not a cost
win or a full-cohort acceptance claim. No baseline was rerun and no favorable
attempt was selected from repeated treatments.

The [installed harness](../implementation/swebench/installed.md) froze Sol
`openai/gpt-5.6-sol` at medium effort, the public skill, source tree and official
grader. Jev used the native TypeSafe route. The original runtime image was absent;
the retained rebuilt Requests image passed pinned base-layer, source and tool
identity checks. Its image ID is
`sha256:1a4338ea36e3f3fc9737f0625a4e4c07f1a2424f844aada5ac0d6b6a5cdf543a`.

Raw plan, lifecycle receipt, agent patch, official grade, provider traces and
accounting remain in ignored run storage at
`evals/runs/swebench/tree-sitter-python-checkpoint-2026-09-29/`.
The plan SHA-256 is `e1747710a865f690ff90ed933cf8179553aad37f5b29bbc390d708d7b9a6977a`.
The result supports this task's correctness checkpoint; it does not prove all
Python programs or repositories are regression-free.
