# Issue 41: bounded search research

## Current result

The declared objective is **met on the retained ten-task development cohort**.
Frozen candidate `972a295c8e241534055c220dc45e57d6af1fcbba8cbdde6bd5f1352bb3a146e1`
is the verified incumbent; the worktree and compiled CLI match it.

| Evidence | Solves | Reported total task cost |
|---|---:|---:|
| Original release quality floor | 8/10 | Separate protocol; not mixed into cost comparison |
| Fixed matched protocol-2 release | 7/10 | $6.077597458–$6.117358648 |
| Frozen bounded-search candidate | 8/10 | $5.789044504, complete accounting |

All eight original release solves and all seven matched release solves are
preserved. All ten candidate retrieval protocols are valid. Cost includes Sol
and Jev for both solved and failed tasks. Candidate cost is $0.288552954 below
even the release's conservative lower bound: **at least 4.7478% cheaper**.
One first attempt per task is counted on the same frozen package. The only
post-run retry was a read-only billing lookup; its initial receipt is retained.
These repeatedly tuned tasks establish the declared development gate, not
held-out generalization or statistical equivalence.

The root fix suppresses weak navigation floods and requires confirmed source
before lifting the navigation byte budget. Independent request and output
ceilings bound escalation; partial discovery and omitted output are explicit.
Early source judgments are reused. Relationship questions bind evidence to the
current item, including whole-file previews. The public skill and parser match
the released package. Rejected role, caller and initialization experiments are
absent from production.

Full verification passes, including all 41 installed checks. Final shape, diff
and documentation review is clean; the independent CLI-review limitation is
recorded below. Exact cohort receipts, package identity and cost decomposition
are in `evals/runs/swebench/issue-41-artifacts/verified-incumbent.json` and
`anchor-binding-live-cohort-summary.json`. The artifact is retained under
`anchor-item-binding/`; no evaluation remains pending.

The source-confirming parent `5023c2609fd880542b33584e79e3188bcf6d94e161664c5410945a07f10c8da8`
remains recoverable. Its full cohort cost passed at $5.439403942–$5.519082730,
but quality failed at 7/10. It is superseded by the verified item-binding
candidate. The fixed release package is
`09719097be8765683f50b55a032a6a84db4e6e475b89e5fea9529c0af704163d`.

## Research contract

Compare actual installed packages on matched pinned SWE-bench source/runtime,
Sol model, tools and harness. Use each package's public skill; retrieval variants
keep it unchanged. The benchmark policy allows one release baseline per task,
model and protocol, retained permanently. Never select favorable repeats or mix
candidates within a cohort. Cost includes the coding agent and Jev, including
failed attempts. Missing bills remain unknown; Gateway metadata is reported cost,
not an invoice. Research expenditure is separate from scored task cost.

The original release cohort solved eight of ten tasks. Promotion requires at
least those eight solves, preserving every release solve, with candidate total
cost no greater than release. A candidate upper bound below a release lower
bound can establish that inequality. Fresh protocol-2 release solved seven of
ten; that does not lower the original eight-task quality floor.

Protocol 1's checker mistakenly accepted `jg files` and some setup commands as
retrieval. A post-run audit caught this in the apparent cost-winning v7 cohort.
Protocol 2 explicitly requires a natural-language search before implementation
investigation, with command parsing that distinguishes search from inventory.
Both arms received new fixed baselines under the clarified prompt. Earlier
protocol evidence remains separate. Controlled replay is a diagnostic; it does
not establish a fresh stochastic coding-agent completion rate. Promotion retains the original eight-task quality floor and compares cost only
within the fixed matched protocol. The final candidate passes that conservative
gate.

## What fixes the reported amplification

- Retain isolated weak leads. Suppress a wide flood of scores between 0.5 and 0.6
  only when no strong score has appeared.
- Stop navigation without confident source at an 8 MB serialized-request budget
  after enough positive previews, report discovery incomplete and suggest narrowing
  the root. Drain in-flight requests first; verified source resumes discovery.
  Reuse early source judgments in ordinary selection so they are not paid twice.
- Independently cap CLI provider attempts at 1,000 and stdout at 256 KB. Output
  truncation reports omitted bytes, closes source fences and ends the packet.
  CLI options allow explicit request/output limits; source allocation remains
  unlimited by default.

A synthetic 6,300-file, 40.6 MB all-0.51 tree stopped at 252 fake evaluations and
7,968,458 serialized request bytes, returning no files and a small explicit
incomplete packet. The earlier request-limit-only variant sent 31.6 MB before
its 1,000-call ceiling. These are deterministic regression controls with no paid
provider calls. The reporter's live repository is unavailable, so no equivalent
wall-time or billed-token claim is made. The source-confirming candidate also bounds strong preview false positives;
a confident false source judgment can still release the navigation byte budget.
The global request and stdout caps remain independent.

The local filesystem's repeated absent ignore-rule probes were also reviewed.
Caching them for a whole run would miss newly created rules before upload. That
optimization remains unimplemented; this change makes no local timing claim.

## Parameter-effect map

| Factor | Measured effect | Verdict / limit |
|---|---|---|
| Hard 0.6 relevance cutoff | Removed useful files scored 0.52–0.58 | Discarded |
| Weak flood suppression plus 8 MB budget | Bounds synthetic amplification while preserving isolated weak leads | Retained; live reporter root unavailable |
| Global request/output ceilings | Bounds pathology even after a strong-looking false positive | Retained; output truncation loses context explicitly |
| Per-level file/directory caps | Could discard strong useful paths | Removed |
| Preserve weak leads after strong evidence | Restored earlier replay parity on eight tasks | Retained; strict replay and controls pending |
| Public question-scope sentence | One 8/10 cohort appeared cheaper; inventory-only attempt invalidated it | Removed; policy restricts skill to CLI usage |
| Default source allocations 8 KB / 32 KB | Pytest solved more expensively; Django failed after two searches at $2.033 | Discarded; default source remains unlimited |
| Shared implementation role | Requests solved; Django failed | Discarded alone |
| Bounded caller source | Django solved; Requests failed | Discarded alone |
| Shared role plus caller source | Full protocol-2 cohort preserved eight solves but cost exceeded release | Discarded |
| Conditional headers and source assignments | Django solved at $1.456 versus fixed release $1.010 | Discarded; no demonstrated cost benefit |
| Source confirmation across all queued frontiers | Bounds weak and false-strong amplification; full cohort 7/10 at $5.4394–$5.5191 versus release $6.0776–$6.1174 | Cost passes; quality fails because Django is lost |
| Confidence ordering of source blocks | Actual final-packet prefix coverage unchanged on three cases and worse on Sphinx | Discarded before a paid coding attempt |
| Reduce navigation budget from 8 MB to 2 MB | Requests and Sphinx unchanged; Django loses seven returned source files and reports incomplete | Discarded on the first coverage regression |
| Unbound class-relationship file questions | Positive subclass rises, but every unrelated control also rises to 0.90–0.91 | Discarded; evidence can bleed between items |
| Bind class-relationship questions to item and path, including whole-file previews | Same-input subclass rises to 0.97; unrelated controls remain 0.02–0.07; frozen full cohort 8/10 at $5.789044504 | Retained with source-confirming root fix; quality and cost gates pass; live causal attribution remains limited |

Repeatedly tuned tasks are development evidence, not untouched generalization
evidence. No task-specific answer or grader-only input was put into the product.

## Earlier complete shared-role/caller cohort

The frozen shared-role/caller package
`0c1e89accfa234883d5f678faeb30d35fc33db9bb1a7dd94eccad0503ab2e080`
ran all ten first attempts under protocol 2. All twenty attempts performed an
actual initial search. Original eight solves and every fresh release solve were
preserved. Its quality gate passes; its cost gate fails.

| Task | Release result / cost | Combined candidate result / cost |
|---|---:|---:|
| Requests | solved / $0.291513114 | solved / $0.316479704 |
| Pytest | solved / $0.605190844 | solved / $0.632371088 |
| Xarray | solved / known $0.516125362 | solved / $0.466387976 |
| Django | failed / $1.009524902 | solved / $1.430828552 |
| Scikit-learn | solved / $0.322671418 | solved / $0.349008824 |
| Astropy | solved / $0.567279376 | solved / $0.533609484 |
| SymPy | solved / $0.705114708 | solved / $0.701178440 |
| Sphinx | solved / $1.071083562 | solved / $0.808403882* |
| Matplotlib | failed / $0.566492006 | failed / $0.849778300 |
| Pylint | failed / $0.422602166 | failed / $0.297209444 |
| Total | 7/10 / known $6.077597458 | 8/10 / $6.385255694* |

Release Xarray lacks ten Jev bills. Two stable closed-hour reports bound all
unattributed Jev cost in that hour by $0.039761190. Even assigning that entire
residual to release gives an upper total of $6.117358648, below the candidate's
known total: a definite cost failure.

*Candidate Sphinx had two broker errors without generation IDs. Two subsequent
closed-hour reports match all 222 retained primary generations and their
$6.8336214 cost exactly, supporting zero additional charge on the reported-cost
basis. Original incomplete accounting is preserved with a separate reconciliation
receipt. Prior Pytest v7 has an analogous retained reconciliation. Other raw
unknown bills remain unknown.

## Verification and limitations

The current bounded-search code passes `bun run verify`. Harness unit tests
pass 32 checks. Regression coverage includes wide weak floods, isolated weak
leads, a delayed strong result at the budget boundary, interruption during that
pause, empty numeric CLI values and capped output with embedded source fences.

The independent Codex CLI review could not run because the configured model is
unsupported by the signed-in CLI account. Its failure log is retained; no model
override was made. Direct shape, diff, documentation and bounded-work reviews
removed the experimental additions and repaired limit diagnostics, omission
counts and cancellation attribution.

## Research spend and retained attempts

The final research ledger contains **92 coding attempts**, with known reported
cost **$58.626951652**, plus **$0.002032506** in identified standalone probes.
This research spend is separate from the candidate's scored $5.789044504 cohort.
Eight earlier raw attempt bills remain incomplete; reconciliation supplements
bound some without rewriting them. Fixed-query probes without retained billing,
local semantic search and orchestration are additional unknown expenditure, not
zero. The final candidate's ten bills are complete. Ledger and summaries are
retained under `evals/runs/swebench/issue-41-artifacts/`.

Every completed attempt follows below, including rejected, failed and invalid
ones. Full plan identities, trace bodies, patches, grades, bills, reconciliation
receipts and the complete chronological research record are retained locally.
`research-history-through-conditional-context.md`, `research-spend-ledger.json`,
and `research-spend-summary.json` are in the artifact directory. The original
Matplotlib v7 protocol flag is erroneous; its post-run search audit invalidates
that cohort. A failed grading platform call was regraded using the unchanged
saved Requests patch; no coding attempt was repeated for that repair.

| Attempt | Task | Official solved | Known task cost | Original bill complete |
|---|---|---|---:|---|
| astropy-candidate-v3 | astropy__astropy-13579 | yes | $0.425127104 | yes |
| astropy-candidate-v7 | astropy__astropy-13579 | yes | $0.476943092 | yes |
| astropy-released | astropy__astropy-13579 | yes | $0.422713370 | yes |
| django-candidate-v2 | django__django-15629 | yes | $1.438478252 | yes |
| django-candidate-v3 | django__django-15629 | no | $1.104725360 | yes |
| django-candidate-v5 | django__django-15629 | no | $1.432662726 | yes |
| django-candidate-v7 | django__django-15629 | yes | $1.027610902 | yes |
| django-released | django__django-15629 | yes | $1.233829068 | yes |
| matplotlib-candidate-v3 | matplotlib__matplotlib-26466 | no | $0.518210236 | yes |
| matplotlib-candidate-v7 | matplotlib__matplotlib-26466 | no | $0.280260600 | no |
| matplotlib-released | matplotlib__matplotlib-26466 | no | $0.687747302 | yes |
| protocol2-astropy-released | astropy__astropy-13579 | yes | $0.567279376 | yes |
| protocol2-astropy-shared-caller | astropy__astropy-13579 | yes | $0.533609484 | yes |
| protocol2-django-caller-context | django__django-15629 | yes | $1.186901968 | yes |
| protocol2-django-conditional-context | django__django-15629 | yes | $1.455629632 | yes |
| protocol2-django-focused-source | django__django-15629 | no | $2.032909944 | yes |
| protocol2-django-released | django__django-15629 | no | $1.009524902 | yes |
| protocol2-django-shared-caller | django__django-15629 | yes | $1.430828552 | yes |
| protocol2-django-shared-role | django__django-15629 | no | $0.964121470 | yes |
| protocol2-django-unchanged-skill | django__django-15629 | yes | $1.132390616 | no |
| protocol2-matplotlib-released | matplotlib__matplotlib-26466 | no | $0.566492006 | yes |
| protocol2-matplotlib-shared-caller | matplotlib__matplotlib-26466 | no | $0.849778300 | yes |
| protocol2-pylint-dev-released | pylint-dev__pylint-4604 | no | $0.422602166 | yes |
| protocol2-pylint-dev-shared-caller | pylint-dev__pylint-4604 | no | $0.297209444 | yes |
| protocol2-pytest-bounded | pytest-dev__pytest-6197 | yes | $0.621138758 | yes |
| protocol2-pytest-released | pytest-dev__pytest-6197 | yes | $0.605190844 | yes |
| protocol2-pytest-shared-caller | pytest-dev__pytest-6197 | yes | $0.632371088 | yes |
| protocol2-pytest-shared-role | pytest-dev__pytest-6197 | yes | $1.055039830 | yes |
| protocol2-pytest-source-allocation | pytest-dev__pytest-6197 | yes | $1.030743388 | yes |
| protocol2-pytest-unchanged-skill | pytest-dev__pytest-6197 | yes | $0.877620862 | yes |
| protocol2-requests-caller-context | psf__requests-1142 | no | $0.371573882 | yes |
| protocol2-requests-released | psf__requests-1142 | yes | $0.291513114 | yes |
| protocol2-requests-shared-caller | psf__requests-1142 | yes | $0.316479704 | yes |
| protocol2-requests-shared-role | psf__requests-1142 | yes | $0.344736984 | yes |
| protocol2-requests-stable-context | psf__requests-1142 | no | $0.296241984 | yes |
| protocol2-requests-unchanged-skill | psf__requests-1142 | no | $0.355952692 | yes |
| protocol2-scikit-learn-released | scikit-learn__scikit-learn-13124 | yes | $0.322671418 | yes |
| protocol2-scikit-learn-shared-caller | scikit-learn__scikit-learn-13124 | yes | $0.349008824 | yes |
| protocol2-sphinx-doc-released | sphinx-doc__sphinx-8638 | yes | $1.071083562 | yes |
| protocol2-sphinx-doc-shared-caller | sphinx-doc__sphinx-8638 | yes | $0.808403882 | no |
| protocol2-sympy-released | sympy__sympy-16792 | yes | $0.705114708 | yes |
| protocol2-sympy-shared-caller | sympy__sympy-16792 | yes | $0.701178440 | yes |
| protocol2-xarray-released | pydata__xarray-3305 | yes | $0.516125362 | no |
| protocol2-xarray-shared-caller | pydata__xarray-3305 | yes | $0.466387976 | yes |
| pylint-dev-candidate-v3 | pylint-dev__pylint-4604 | no | $0.400671980 | yes |
| pylint-dev-candidate-v7 | pylint-dev__pylint-4604 | no | $0.425710828 | yes |
| pylint-dev-released | pylint-dev__pylint-4604 | no | $0.346550576 | yes |
| pytest-candidate | pytest-dev__pytest-6197 | yes | $0.977651930 | yes |
| pytest-candidate-v2 | pytest-dev__pytest-6197 | yes | $0.724042560 | yes |
| pytest-candidate-v3 | pytest-dev__pytest-6197 | yes | $0.674823936 | yes |
| pytest-candidate-v7 | pytest-dev__pytest-6197 | yes | $1.062732958 | no |
| pytest-released | pytest-dev__pytest-6197 | yes | $0.467516170 | yes |
| requests-candidate-v2 | psf__requests-1142 | no | $0.396997294 | yes |
| requests-candidate-v3 | psf__requests-1142 | yes | $0.347619770 | yes |
| requests-candidate-v4 | psf__requests-1142 | yes | $0.246709054 | yes |
| requests-candidate-v7 | psf__requests-1142 | yes | $0.284052854 | yes |
| protocol2-requests-input-initialization-context | psf__requests-1142 | yes | $0.352284308 | yes |
| protocol2-requests-source-confirmation-repaired | psf__requests-1142 | yes | $0.538627678 | yes |
| requests-released-v2 | psf__requests-1142 | no | $0.316329304 | yes |
| scikit-learn-candidate-v3 | scikit-learn__scikit-learn-13124 | yes | $0.506526716 | yes |
| scikit-learn-candidate-v7 | scikit-learn__scikit-learn-13124 | yes | $0.324032420 | yes |
| scikit-learn-released | scikit-learn__scikit-learn-13124 | yes | $0.381335086 | no |
| sphinx-doc-candidate-v3 | sphinx-doc__sphinx-8638 | yes | $0.738837946 | yes |
| sphinx-doc-candidate-v7 | sphinx-doc__sphinx-8638 | yes | $0.548434842 | yes |
| sphinx-doc-released | sphinx-doc__sphinx-8638 | yes | $0.655064516 | yes |
| sympy-candidate-v3 | sympy__sympy-16792 | yes | $0.536488306 | no |
| sympy-candidate-v7 | sympy__sympy-16792 | yes | $0.588397582 | yes |
| sympy-released | sympy__sympy-16792 | yes | $0.584522152 | yes |
| xarray-candidate-v2 | pydata__xarray-3305 | yes | $0.485110006 | yes |
| xarray-candidate-v3 | pydata__xarray-3305 | yes | $0.471069312 | yes |
| xarray-candidate-v7 | pydata__xarray-3305 | yes | $0.397360492 | yes |
| xarray-released | pydata__xarray-3305 | yes | $0.382839456 | yes |

## Controlled replay and next hypothesis

The root-only package was run against retained Jev responses with the published
release as self-control. Strict request matching exposed donor-array order
differences in otherwise identical contextual requests. A second diagnostic
normalizes only `selectedEvidence` order and otherwise requires exact state,
source, question and preview equality. It permits regrouping navigation items
only when the complete per-item input and question are retained.

Candidate and release self-control have the same logical request multiset and
byte-for-byte stdout on all ten tasks. Nine reproduce the saved packet exactly;
Pylint has the same missing relationship-navigation response and incomplete
packet in both controls. This is conditional equivalence using saved answers,
not fresh provider billing or a new official coding-agent run. An initial
candidate replay installation accidentally lost nested dependencies; it failed
before any evaluations, was repaired and is retained separately. No paid calls
were made by these replay checks.

The next one-factor hypothesis is stable donated-excerpt ordering. The existing
context request follows asynchronous selection completion, creating different
cache keys for the same evidence set. Sort donors by repository path before
constructing contextual requests, retaining every source byte and all existing
questions. The cheapest discriminating test reverses file-selection latency
between two identical searches through the production cache: the second search
should add no uncached judgments and preserve returned evidence. A failure of
that prediction rejects this factor before any coding-agent trial. The fixed
parent is root-only `43f1d5aa...`; the live solve/cost promotion gate is unchanged
while the acceptance clarification is pending.

Stable-context's deterministic probe passes: first search makes seven uncached
judgments; with reversed completion latency, the second adds zero. Reverting
the one-line ordering change adds two judgments (nine total), proving the test
detects the cache defect. The returned file evidence is identical. Type checks
and build pass. Its frozen package is
`dc0c42b9bc1c097c5188535f88e1352ef7ea65d4fd56ee1ce5cc261580467fe6`.

The first protocol-2 Requests attempt is the next paid check, using its existing
fixed release baseline ($0.291513114, solved). Prediction: preserve the solve
and do not exceed that total cost. A cost or solve failure prevents focused
promotion. Cache savings are independently established for repeated queries;
a first-attempt task difference remains noisy rather than a causal estimate.

The stable-order Requests first attempt failed the official grade with complete
cost $0.296241984 versus solved release $0.291513114. Focused promotion fails
both gates. Stable ordering remains a verified cache-reuse technique on the
synthetic paired-query test, but not an accepted complete-task optimization.
The working code, tests and docs were restored to the verified root-only package;
the frozen stable package, test, diff and raw attempt remain retained.

Current handoff: root-only package `43f1d5aa...` is the recoverable incumbent; no
job remains pending. Existing live acceptance criteria remain unmet. The
acceptance-evidence question is pending. If the user retains the fresh live gate,
the next distinct strategy is batching admitted-file role judgments to share
query overhead, with all public instructions and source-selection rules fixed.
Start with a tiny provider spike comparing individual versus batched judgments
and token cost before authorizing a coding-agent trial through the research
contract. Do not rerun rejected candidates or choose favorable old outcomes.

The next cheap role-batching spike reuses the three released Requests file-role
judgments as its fixed individual baseline, then evaluates their exact previews
under the same query in one request. Move unchanged role instructions into
shared state criteria and refer to each file explicitly in each question.
Prediction: fewer input tokens and lower reported Jev cost with no role crossing
the 0.5 decision boundary and no material priority-order change. A decision
change or missing cost falsifies promotion of this spike. This is retrieval
research only, not a replacement for the live complete-task gate.

Before any paid call, the role-spike input check found two file-role judgments
in the protocol-2 release trace rather than the assumed three. The empty v1
artifact directory and assertion failure are retained; no provider request was
made. The spike was corrected to use those two actual retained judgments.

The two-file role-batching spike reduced input from 6,950 to 6,643 tokens and
reported Jev cost from $0.000291900 to $0.000279006 (4.4%). Three role decisions
crossed the 0.5 boundary, and priority confidence fell. Its preservation gate
fails; discard this batching form before any coding-agent trial. Raw baseline,
request, response and summary are retained in `batched-role-probe-v2/`. Combined
known standalone probe spend is $0.000641886, in addition to coding-attempt
subtotals and the explicitly unknown expenditure.

The root-only artifact remains the incumbent, exactly matching the rebuilt CLI
bytes after rollbacks. Full verification and 32 harness checks passed. No paid
evaluation is running. The available controlled evidence supports conditional
retrieval parity; it does not resolve the unchanged fresh-agent cost-and-solve
acceptance gate. Before another paid cohort, resolve the pending acceptance
question rather than select repetitions or treat a tuned task as confirmation.

## Next experiment: verify navigation optimism with source

The previous goal turn yielded evidence and completed rollbacks; it was progress.
The acceptance question received no answer, so the original fresh live gate
remains in force. Another safe, distinct mechanism is available.

Parent is root-only `43f1d5aa...`. Strong navigation scores currently bypass the
byte budget before any declaration-level source judgment verifies them. A strong
false positive can therefore keep exploring an absent-answer root. Reuse the
existing first source-selection pass early for at most four small strongly
admitted candidates, retaining its exact source and questions and caching its
result for the later selection phase. Only confident source releases the byte
budget. This coupled scheduling/budget change addresses the root issue directly;
no new classification prompts, role labels or source annotations are added.

Cheapest discriminating test: 1,800 files whose navigation scores are 0.9 but
source judgments are 0.1, with an external 600-request ceiling. Parent must hit
the request ceiling; candidate must stop at the navigation byte budget earlier.
Existing weak-flood and delayed-positive controls remain required. A positive
source control and retained-response replay must show the same first source
judgments are reused rather than paid twice. Only then freeze and test the
normal live coding tasks against their existing protocol-2 baselines. The overall
cost/solve criterion is unchanged; no controlled replay substitutes for it.

The false-strong navigation control fails on the parent at the external request
ceiling and passes on the source-confirming candidate. Existing late-response
controls now distinguish a 0.9 preview with a verified 0.9 source judgment from
a 0.9 preview whose source remains 0.1. Verified source resumes the paused queue;
the optimistic preview alone keeps the budget; interruption remains explicit.
A two-file source control preserves every returned source byte and makes each
initial source judgment exactly once. Its negative control disables reuse and
fails on the duplicated judgment. These changed controls express the new budget
contract rather than treating a strong preview as source proof.

A new positive control exposed a real limitation before any live coding trial:
small-source verification alone could stop despite a larger genuine match among
its discovered paths. The control is red on that first implementation. At the
byte boundary, drain in-flight requests and permit one final source check chosen
by navigation score from the discovered candidates, up to the existing source
inspection limit. Its exact source judgments are also reused later. Preserve
confirmed excerpts in admitted-file records even if a subsequent provider
ceiling prevents the ordinary selection loop from visiting that path.
This repair gets a new package identity; the earlier package is retained and
will not be used for promotion.

The repaired source-confirming package is frozen as `93ca03f634e7df1cf8c09e49ca4a6aee0d7b4bb2550eac67ee9b6e78775c44ae`. Its public skill,
role questions and source-selection criteria are unchanged from release; source
confidence uses the existing source-presentation boundary. Early checks are
bounded to four whole-window candidates plus one final check at a byte-budget
pause. The final check obeys the existing 1 MB source-inspection and shared
provider-attempt limits. Cached first-pass selection results retain snapshot
hashes; normal selection verifies current eligibility before reuse.

Focused controls now pass for false strong previews, a larger positive source
match, exact first-pass reuse, a weak flood, a late verified match, a late
unverified preview and interruption. Full verification is running. Retained
response replay on Requests/Pytest/Xarray/Django is the next cheap compatibility
check; it cannot substitute for the subsequent live cohort.

### Verification of the repaired source-confirming candidate

The installed concurrency test's original rendezvous held the first source
request until a second arrived. Early source checking can validly run that
request during navigation. Repair the fixture by delaying all provider replies
50 ms, exercising overlapping work across stages while preserving the exact
peak of two and rejecting any third concurrent request. The frozen package
passes; a separate packed mutation that ignores the concurrency flag fails
with provider overload and an incomplete search. Production evaluator bytes
remain unchanged. Logs: `source-concurrency-green` and `source-concurrency-red`
under the session's temporary evidence directory.

Nine retained-answer task replays return byte-identical released packets with
zero missing answers. Pylint returns one unmatched navigation group, with the
same relation anchor. Investigate against an unchanged-release replay and exact
request contents before making a compatibility claim or launching paid work.
A missing replay answer is not an observed live-provider failure.

Full `bun run verify` passed (types, lint, core/parser/CLI suites and all 41
installed checks). The current compiled CLI exactly matches frozen package
93ca03f634e7df1cf8c09e49ca4a6aee0d7b4bb2550eac67ee9b6e78775c44ae.
The Pylint missing replay answer is `pylint/utils` under the relation anchor:
no retained anchored item exists. Unchanged release reproduces the same missing
answer and returns byte-identical output to candidate. Keep this case explicitly
limited rather than inventing a provider score. Nine other tasks exactly reproduce
the saved released packet; all ten preserve relative replay output.

Prospective live pilot: one Requests protocol-2 candidate attempt, same pinned
runtime, public skill and evaluator, against the permanently retained released
attempt ($0.291513114, resolved and protocol valid). Expand only if candidate
resolves, obeys protocol and complete total cost does not exceed that baseline.
Reject a failed pilot without choosing favorable repeats. Any expanded cohort
still must preserve every release solve, reach at least the original 8/10 floor,
and cost no more than the fixed released cohort. Pilot success is provisional;
replay is diagnostic. No release baseline is rerun.

The Requests source-confirmation pilot resolved and complied with protocol, but
complete reported total task cost was $0.538627678 versus fixed released
$0.291513114 (+$0.247114564). Reject it under the prospective pilot gate; no
expanded cohort and no favorable rerun. The package remains a research artifact.
The credential-less launch stopped before creating a coding attempt or issuing
paid calls; the single authorized attempt is retained permanently.

Self-review then found a separate correctness gap: the byte-boundary source
probe considered only the current frontier. A large genuine source match found
in an earlier frontier was skipped. A depth-separated fixture is red for missing
that actual source. Repair the final probe to include already admitted candidates
as well as the current frontier; preserve the current frozen package and trial.
This repair is a correctness experiment, not evidence that the failed cost pilot
now passes. The CLI second opinion could not run: its configured gpt-6.1-sol is
unsupported for the signed-in ChatGPT account. No model override was selected.

The previous-frontier control now passes after including previously admitted
candidates in the final source probe. Both larger-source placements, false strong
previews and exact source-selection reuse pass (4 focused checks). Full verification
is running for this further repair. The earlier live-tested package remains
frozen and rejected by its cost pilot; the repair has not been live-evaluated.

The corrected all-frontier package is frozen as `5023c2609fd880542b33584e79e3188bcf6d94e161664c5410945a07f10c8da8` under
`source-confirmation-all-frontiers/`. Its compiled CLI matches the worktree and
its public skill exactly matches release. Full verification passed; the following
comment-only edit clarifies the source-budget diagnostic without changing logic.
Direct shape and diff review resolved the earlier-frontier gap; documentation
links from README through evaluation and architecture pages all resolve.
No paid trial has run on this package.

All ten retained-answer replays have completed on the all-frontier package:
nine exactly match saved release stdout with zero missing answers. Pylint
reproduces the same one unavailable anchored item and exactly matches the
unchanged-release replay packet. This confirms the earlier-frontier repair does
not change those normal saved-query results; it does not establish fresh coding
agent cost or completion rate. No process or paid trial remains running.

## Next cost experiment: lossless location-row formatting

The previous goal turn was progress: a failed paid pilot and a red/green
correctness repair changed the next action. No pending job remains.
Parent is all-frontier package `5023c260...`; the full live gate is unchanged.
The latest Requests bill is dominated by Sol (19 generations, $0.5321236),
with Jev at $0.006504078. Its broader query returned four files versus release's
two and prompted more direct reads and verification. This is an observed
association, not a causal attribution to the new navigation guard.

Cheapest next hypothesis: fold declaration-location children into one row per
file, retaining all paths, names, coordinates, optional leads, call annotations,
omission notices and exact source bytes. Keep every source block before all
locations, so earlier tool clipping cannot remove more source. Test offline on
the retained ten query packets. This is a formatting spike with no provider or
coding-agent calls and no production edit. Expand only if it preserves every
metadata value and saves at least 5% aggregate packet bytes; otherwise discard
this factor before any paid trial. Smaller output alone is not a task-cost win.

The lossless location-row spike retained the entire source prefix and every
metadata value, but saved only 1,466 of 324,056 bytes (0.452%). Requests saved
11 bytes. It fails the prospective 5% expansion gate. Discard with zero paid
calls and no production edits; `compact-locations-offline-v1/summary.json`
retains all ten measurements and candidate packets.

### Next hypothesis: preserve query-specific input provenance

The costly Requests pilot eventually changed input normalization in addition
to the header condition. Its packet omitted that initializer: retained initial
source judgments for `Request.__init__` were relevance 0.27, scope 0.44;
contextual follow-up was 0.30, 0.61, reference 0.23. Its direct `Request.prepare`
caller was also below the source-presentation boundary. This source omission
is observed; that it caused the extra agent work remains a hypothesis.

Test one conceptual prompt factor in a retained whole-file Requests source
request: explicitly count initialization and normalization of query-relevant
input when shown code links it to the same API through arguments or attributes.
Keep all source, declarations, per-declaration questions and reference criteria
fixed; amend relevance and scope consistently. First run one provider-only
probe against its permanently retained baseline response, not a coding task.
Prediction: the omitted initializer crosses the existing 0.7 presentation
boundary, with no currently confident source unit dropping below it. A missing
initializer, unrelated new confident source, loss of existing confident source
or unknown cost prevents expansion. Preserve raw scores and actual billing.
This diagnostic neither proves full task savings nor changes the live gate.

The input-provenance wording probe fails its expansion gate. The missing
initializer's minimum relevance/scope rose from 0.27 to 0.38 and still falls
below 0.7. No confident declaration was gained or lost. Reported cost was
$0.000505260 (12,030 input and 2,288 output tokens), versus the retained
11,955-token input. Discard this wording with no production edit or coding
trial. Raw request/response and scores are in `input-provenance-probe-v1/`.
Combined known standalone probe spend is now $0.001147146, separate from the
71 coding-attempt subtotal and retained unknown expenditure.

### Structural initialization-context experiment

The revised premise is that input provenance needs a concrete syntax link:
source already selected by the existing classifier reads an instance attribute,
and the same local class's initializer directly assigns that attribute. Reuse
the parser's class/method ownership and conservative receiver-binding analysis.
Present the initializer and the selected reader as optional structural context;
do not promote either into classifier evidence or issue new AI questions.
Exclude unrelated classes, ambiguous/duplicate definitions and rebound receivers.
Keep the existing source/file byte bounds and mark the relationship as possible
initialization rather than a verified runtime value or call.

Cheapest tracer: a selected primary processor, a weaker selected wrapper that
reads its own `self.data`, a source-rejected initializer that defines its default,
and an unrelated same-named attribute in another class. The real retrieval/render
path must show the exact local initializer and reader only. Rebinding the reader's
receiver must suppress this contextual link. Current parent should fail that
positive source claim. Then reuse retained classifications to measure additions
and check that every prior source byte/location survives before any paid coding
trial. Requests is the development task; the full solve/cost gate remains unchanged.

The first structural prototype is frozen as `463363fdb8e57a4a55295afb423454d0c144b0756eaae871e93c9318d7b4f1ed`.
Its retrieval tracer passes normal and rebound-receiver cases; the independent
CPython parity and inherited-call tests pass all nine checks. An intermediate
refactor misplaced helper scope and caused `calls is not defined`; those failed
logs are retained, the parser was repaired from the saved parent, and parity
was rerun successfully. Types also pass. No paid coding attempt was launched.

On the costly pilot's retained query, it recovers the omitted initializer and
reader with the same 19 retained AI judgments, but grows output from 13,241 to
20,895 bytes. It also exposes constant Session defaults and retry configuration.
Ten-task replay retains the same matched-call counts and the same one Pylint
missing answer, with growth from 0% to 74.7%. The broad state variant does not
justify a paid coding trial. Refine the structural criterion to constructor
arguments and their local aliases feeding the read attribute, and fill only
missing initializer source. Constant-only state and an already shown initializer
are not the omitted-input premise. Retain this broad package and its measurements.

The argument-backed, missing-source refinement is frozen as
`c63c18d7f8ca7e2377bb385abb07eb3afc8ea29e1457b452bb48ac8ffe4ea44a`.
The tracer now covers direct normalization, local aliases, unrelated constant
state, keyword names that are not parameter values, and rebound receivers.
All 20 assertions pass. Disabling keyword-name exclusion produces the intended
red: a constant keyword is falsely treated as the input variable and its
initializer appears. The guard was restored before building. Full verification
passes types, lint and all core/parser/CLI and 41 installed checks.

The costly Requests query now receives its missing initializer and reader in
15,071 bytes rather than 20,895 for the broad state prototype or 13,241 for
parent. It uses the same 19 retained AI judgments and has no missing answers.
Ten normal-query replays preserve every original source line, partial block,
location and path, and preserve matched-call counts. Five packets are unchanged;
five add input context. Source-line counts and byte additions are retained in
`input-initialization-context/preservation-summary.json`. Pylint keeps its
one pre-existing unavailable replay answer. This is compatibility evidence,
not a fresh coding-agent solve or a total-cost claim.

Prospective live development pilot on Requests: one first attempt with frozen
c63c18d7... on the same protocol-2 source/runtime, Sol model, packaged public
skill and tools as the fixed released baseline. Hypothesis is fewer follow-up
reads and verification loops because input normalization is visible immediately.
Expand only if resolved, protocol valid and complete total reported task cost
≤$0.291513114. Reject rather than repeat a failed pilot. The old 93ca pilot
and all rejected prototypes remain permanent. Full promotion still requires
all release solves, at least the original 8/10, and aggregate cost no greater
than the fixed release cohort; a pilot cannot complete that objective.

The input-initialization-context first pilot resolved and complied with protocol,
but complete task cost was $0.352284308 versus fixed release $0.291513114
(+$0.060771194). Sol used 12 generations at $0.3478922, and Jev 13 client
calls at $0.004392108. Compared with the prior failed source-proof pilot, cost
and generation count are lower, but queries and sampling differ; this does not
establish causality. Reject under the prospective pilot gate, with no expansion
or favorable repeat. The source snapshots, frozen packages, projection evidence
and complete paid attempt remain retained. Working production files and the
prototype tracer were restored to the all-frontier parent `5023c260...`.

The new live packet exposed the initializer, yet the agent still made broad
direct file reads, including a 13,843-byte test/source/setup read. It fixed
both the header condition and direct-construction input normalization. That is
more behavior than the fixed release patch; the official binary solve score
does not measure the additional behavior. Further work must target actual
follow-up overhead or another mechanism, rather than reword this initialization
family again without new evidence. Known research coding-attempt subtotal is
$47.398503206, known standalone probes $0.001147146, plus retained unknowns.

## Source-order diagnostic and next bounded-search hypothesis

A lossless within-file source-order diagnostic first used maximum retained
query-matched declaration scores on ten saved packets. Its confidence-weighted
first-200-source-line proxy improved in all ten. Four fresh, offline diagnostic
captures then exported **final** retrieval results (Requests, Django, Sphinx,
Astropy) from an isolated bundle. All four retained byte-identical parent
stdout with zero unavailable replay answers; working production files were not
edited. Keeping class-header blocks with their subsequent methods removed the
apparent gains on Requests (129.28 to 129.28), Django (122.77 to 122.77), and
Astropy (107 to 107), and worsened Sphinx (140.57 to 111). Discard ordering for
this loop: the initial apparent gain depended on detaching owner context. These
are presentation diagnostics, not measured coding cost. No paid calls were made.
Raw scripts, snapshots and summaries are under `source-order-capture/`,
`replay-source-order-capture/`, `source-order-offline-v1.json` and
`final-source-order-offline-v1.json` in the existing artifact directory.

Next distinct hypothesis: reduce the navigation byte budget from 8 MB to 2 MB,
retaining the all-frontier source-confirmation algorithm and every other parent
setting. Prediction: confident ordinary searches release the budget early and
preserve their results, while empty searches use substantially fewer serialized
navigation bytes. Falsifier: any saved normal query loses output/source or
requires an unavailable replay answer beyond the parent's known Pylint gap.
Use an isolated compiled diagnostic bundle before any production change. Compare
all ten saved-query packets and request counts to frozen parent 5023; also run
an unpaid empty-tree control if packet preservation passes. Lower budget alone
must not be presented as a coding-agent cost win. The existing full live quality
and cost criteria remain unchanged; no paid trial is authorized by this diagnostic
result alone until its measured effect supports a prospective pilot.

The 2 MB diagnostic was **discarded at its first regression**, before expansion
or paid work. Requests and Sphinx retain exact parent packets and request counts.
Django exits incomplete at 2 MB with 5 files and 2,827 stdout bytes, versus the
parent's complete 12-file, 37,808-byte packet. All 132 Django requests had retained
answers (44 recomposed navigation batches; no missing answers), so this is an
observed loss caused by the lower budget, not a replay-data gap. It prevents the
query from reaching its confident implementation source. Raw result snapshots
and replay receipts are under `budget-two-megabytes/` and
`replay-budget-two-megabytes/`. The isolated bundle also includes a diagnostic
result dump; it is not a release candidate. Working production keeps 8 MB and
remains the exact 5023 parent. Neither cheap diagnostic adds research provider
spend or changes the unmet live completion/cost gate.

## Experiment-design revision: evaluate the corrected root fix on the full objective

The strict Requests pilot-cost gate was a research screening rule imposed by the
agent; the user's goal concerns aggregate task cost and completion rate. It
prevented evaluating a root-fix artifact whose ordinary saved-query packets are
unchanged. A higher-cost pilot is a real observation but cannot establish an
aggregate cost regression by itself. Retain all failed pilot verdicts and bills;
none becomes a win. Replace that screening rule prospectively for one previously
untested **corrected all-frontier** package, 5023c260, with one full ten-task
protocol-2 cohort. This package has no prior live attempts. Do not rerun 93ca,
C63 or any fixed release baseline. Every task in this planned cohort is accounted
for, including failures; do not stop after favorable partial totals or repeat
unfavorable outcomes. No package mixture is permitted.

The promotion criterion is unchanged: preserve every original release solve and
fresh protocol-2 release solve, reach at least 8/10, and establish complete
aggregate candidate cost no greater than the fixed released cohort. Known
release cost lower bound is $6.077597458 and its conservative upper bound is
$6.117358648; an overlapping candidate bill is inconclusive, not a win. Replay
parity and synthetic controls do not replace this live gate. Prior research
spend remains $47.398503206 plus separately retained probes and unknown bills.
The worktree and production settings are frozen; this is an experiment-design
revision, not a new rendering, parser, skill or judgment change.

## Corrected all-frontier live cohort receipts

All ten planned first attempts on frozen 5023 are collected. Every attempt complies with protocol. Seven solved: Requests, Pytest, Xarray, Scikit-learn, Astropy, SymPy and Sphinx. This matches the fixed protocol-2 release solve set; Django, Matplotlib and Pylint failed. The original eight-solve floor and original Django preservation gate fail.

| Task | Official solved | Protocol valid | Complete task cost |
|---|---|---|---|
| requests | yes | yes | $0.411004694 |
| pytest | yes | yes | $0.640837416 |
| xarray | yes | yes | known $0.396684802; incomplete |
| django | no | yes | $1.205897192 |
| scikit-learn | yes | yes | $0.371945868 |
| astropy | yes | yes | $0.498708496 |
| sympy | yes | yes | $0.571069268 |
| sphinx-doc | yes | yes | $0.416363446 |
| matplotlib | no | yes | $0.555775490 |
| pylint-dev | no | yes | $0.371117270 |

Collected 10/10. Candidate known subtotal $5.439403942. Research ledger: 82 attempts, known reported subtotal $52.837907148; all previously stated unknown exclusions remain.

Quality gate: fail. Cost gate: pass on reported Gateway cost bounds.

## Next hypothesis: use the relationship anchor consistently at file admission

The latest Django attempt already received the complete base alteration method
and collation helper. It also read that helper directly before proposing its
patch. More same-class helper source is therefore unsupported as the next fix.
A concrete trace gap remains: the relationship pass admits the SQLite directory
at 0.88 against `BaseDatabaseSchemaEditor`, then rejects its `schema.py` at 0.23.
The directory question asks for a concrete class relationship independent of the
named platform; descendant file questions revert to query-specific relevance.
The anchored file preview explicitly declares the corresponding subclass.
This stage mismatch can discard the counterpart the preceding stage found.

Parent is frozen 5023. First test is a tiny provider spike on the exact retained
anchored navigation request `786d5aa22bfa441db2b25f19a745d180`: change only file
question instructions to apply the same relationship criterion already used by
directories. Retain all original source, query, anchor, item order, model and
other questions. Prediction: `sqlite3/schema.py` crosses the 0.6 strong admission
boundary while `sqlite3/operations.py` remains at or below 0.5; their fixed
original scores are 0.23 and 0.18. An unrelated operation becoming positive, a
missing response/bill, or failure to admit the concrete subclass discards this
spike before production implementation. This is a diagnostic quality test; an
extra admitted file can increase Jev work and is not a cost win by itself.

If the spike passes, use a generic subclass-versus-unrelated-class public
retrieval test, verify no-answer controls, and freeze a separate candidate before
a Django solve pilot. The prospective local cost allowance must come from the
aggregate objective; a solved pilot still requires its own complete frozen
cohort and never mixes prior tasks' favorable results. The 8/10 floor, original
release solve preservation and aggregate cost gates remain unchanged.


The first anchor-file spike fails: the concrete subclass rises 0.23 to 0.91,
but the operations negative control rises 0.18 to 0.90. Every other item,
including mail backends, also rises to 0.90–0.91. Discard this unbound question
form before production work. It repeats identical instructions without binding
them to the particular item, so the presence of the positive subclass can affect
all answers. Reported probe cost $0.000437304; all raw evidence and generation
`gen_01M3SYSA31K7Y6M16FA55P2D1B` are retained under `anchor-file-probe-v1/`.
Known standalone probe subtotal is now $0.001584450.

Changed premise for one focused follow-up: explicitly name `state.items[i]` and
its path in each anchored file question, using only that item's provided source
for the already declared class-relationship predicate. Keep the same frozen
parent request, negative/positive controls and 0.6/0.5 gates. This tests item
binding, not a favorable repetition of the failed identical-question form.
No production mutation or coding-agent evaluation is authorized by the first
failed spike. Ordinary unanchored questions, public skill and parser stay fixed.


### Corrected all-frontier billing reconciliation

The initial closed-hour Jev report was partial (1,302 generations, $0.567835254).
Two later reports, using different valid query-parameter orders, agree at 1,438
generations and $0.637403130. All 1,278 identified retained generations sum to
$0.557724342, exactly matching retained response metadata. Assign the **entire**
$0.079678788 residual to the candidate, covering the disconnected call and any
other unattributed retry/error charges conservatively. Add the fully identified
primary $4.881679600: candidate upper bound $5.519082730 is below release lower
bound $6.077597458. Cost gate passes on reported-cost evidence. Original bills,
unknown fields and the early partial report are retained unchanged. Receipts:
`all-frontier-billing-bound.json`, `all-frontier-live-cohort-summary.json` and
`billing-reconciliation/all-frontier-hour19-closed{2,3}-summary.json`.
The full objective still fails its original eight-solve quality gate.

The explicitly indexed anchor-file follow-up passes its prospective controls:
SQLite schema 0.23 to 0.97; operations 0.18 to 0.07; all six unrelated items
remain 0.02–0.04. Input state and source are identical to the fixed request.
Reported cost $0.000448056; generation `gen_01M3SYXPQ1WTX7JE8DZ4G8527V`.
Evidence is under `anchor-file-probe-v2/`; known standalone probe subtotal is
$0.002032506. This is a focused relationship-classification win, not a solved
coding-task or aggregate-cost result. Production has not yet been changed.


### Anchored-navigation implementation and prospective pilot

Frozen item-binding package SHA-256 is
`972a295c8e241534055c220dc45e57d6af1fcbba8cbdde6bd5f1352bb3a146e1`
under `anchor-item-binding/`. Relationship questions name the specific item and
path, and use the same criterion for directory samples and whole-file previews.
Source-range navigation retains its original query judgment. Public skill,
source/role questions and packaged parser helpers match the parent exactly.
The source build passes full verification, including all 41 installed checks.
The frozen tarball also passes the installed concurrency check.

The first toy fixture stayed inside shallow lookahead, so its initial red/green
failure did not exercise relationship reconsideration. A nested fixture repairs
that control: the exact parent is red for the missing counterpart, the candidate
is green, and removing item/path binding admits two unrelated files and turns it
red. Restore binding before packaging. Wide weak and false-strong no-answer
controls and both large-positive placements remain green. Logs are retained as
`anchor-binding-corrected-red`, `anchor-binding-corrected-green`,
`anchor-binding-unbound-red`, `anchor-binding-full-verify` and
`anchor-binding-frozen-runtime` in the session's temporary evidence directory.
A packaging identity check initially caught stale local dist (the parent's hash);
that untested package is retained under `anchor-item-binding-stale-dist/`. Rebuild
explicitly and verify the new item-binding instruction in the frozen binary;
no live attempt was launched on the stale package.

Prospective active-task pilot: one Django protocol-2 first attempt on 972a,
against permanently retained release and parent receipts. Require official solve
and valid protocol. The local research cost allowance is $1.764411920: parent
Django $1.205897192 plus $0.558514728 headroom between conservative parent cohort
upper bound $5.519082730 and release lower bound $6.077597458. This allowance
screens an aggregate tradeoff; the other tasks' costs can change, so it establishes
no aggregate win. A passing pilot may expand the same frozen development cohort
with one first attempt on each remaining task. All ten outcomes and charges must
be retained; never substitute old parent costs for the new cohort. Full promotion
still needs the original eight solves, all release solves and total cost no
greater than the fixed released cohort. A failed pilot is rejected without a
same-package task repeat. No generalization claim is made from these tuned tasks.

Django pilot trace attribution is limited: 260 item-bound relationship judgments
comprise 257 directories and three whole-file previews. No whole-file preview
passes 0.5; one directory does. This live solve does not establish that positive
file admission caused it. The fixed-input spike demonstrates the file-question
effect separately. The pilot tests the coupled directory/file binding change,
and stochastic agent/query variation remains. Retained decision receipt:
`anchor-binding-django-navigation.json`.

Matplotlib accounting initially missed one primary generation lookup after a
URLError. Retry only the missing cached-lookup entry through the unchanged
accounting command, recovering $0.0155742. Complete task cost is $0.501884342.
No new coding attempt or inference is performed. Preserve the initial bill and
lookups under `billing-reconciliation/anchor-matplotlib-initial-accounting/`;
retain both initial and reconciled values in the research ledger.

## Anchor item binding live cohort receipts

One planned first attempt per task on frozen 972a. The Django pilot must pass before expansion; all expanded outcomes count toward the aggregate gates.

| Task | Official solved | Protocol valid | Complete task cost |
|---|---|---|---|
| django | yes | yes | $1.384197858 |
| requests | yes | yes | $0.344155832 |
| pytest | yes | yes | $1.142164840 |
| xarray | yes | yes | $0.394624626 |
| scikit-learn | yes | yes | $0.345880416 |
| astropy | yes | yes | $0.434767308 |
| sympy | yes | yes | $0.474614714 |
| sphinx-doc | yes | yes | $0.447308892 |
| matplotlib | no | yes | $0.501884342 |
| pylint-dev | no | yes | $0.319445676 |

Collected 10/10. Pilot gate: pass. Exact reconciled candidate total $5.789044504. Research ledger: 92 attempts, known reported subtotal $58.626951652; all previously stated unknown exclusions remain.

Quality gate: pass. Cost gate: pass.


### Final promotion and handoff

Promote frozen 972a as the verified incumbent after all ten first attempts are
collected and every package identity matches. Primary generation lookup prices
and Jev response prices sum exactly to $5.789044504; all ten bills are complete.
The missing Matplotlib lookup is resolved, while its failed grade is retained.
Pylint also fails and its $0.319445676 is included. Neither task was a release
solve. Quality and cost gates both pass.

The final review finds one owner for traversal budgets and source confirmation,
shared source-selection thresholds and reuse, evaluator-owned provider-attempt
limits, and renderer-owned stdout truncation. No experimental source adapters or
second classification path remain. README links to architecture and evaluation
records; the changed documentation links resolve. No production changes are
made after freezing the passing package. The code is ready for human review;
research is complete under the declared development criterion. No additional
trial is queued. Generalization would require a separately planned untouched
cohort. The reporter's live repository remains unavailable, so the amplification
claim rests on the retained deterministic controls, not an equivalent billed
live-repository reproduction.


## Release 0.7.1 preparation

The user authorized publication after reviewing the experiment explanation.
Version 0.7.1 retains the evaluated implementation. Archive comparison confirms
that version identity and generated build source-path comments are the only
payload changes from frozen 972a; executable code matches after those
normalizations, and every other packaged file is byte-identical. Four release
validation tests and all eleven native macOS Apple Silicon installation checks
pass on the exact prepared archive. The tag workflow independently verifies,
packages, exercises and publishes its archive, then verifies the registry bytes.
Local manifest and comparison receipts are retained under
`evals/runs/swebench/issue-41-artifacts/release-0.7.1/`.
