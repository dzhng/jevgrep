# Skill rollout and benchmark pilot

The updated skill preserved both official solves and reduced observed total cost
from **$1.483 to $1.106 (25.4%)** in a two-task paired pilot. Automatic invocation
showed **no movement** in an isolated Codex trigger test. These are exploratory
observations, not a statistically established cost reduction or a full-cohort gain.

## Rollout

Updated existing skill installations in `aiexplainer`, `jevgrep`, `battlegame`, and
one existing Battlegame worktree under `~/dev`. Five physical files and their
Claude aliases (nine paths total) match the merged canonical skill. Historical
benchmark snapshots were preserved. Previous bytes and SHA256 records are in the
local `evals/runs/skill-rollout-2026-09-29/manifest.json` (ignored run storage).

This updates skill text, not the globally installed CLI. The global executable
remains 0.5.0; the skill advises checking help for newer commands. The benchmark
used locally packed current-main CLI builds that include `jg files`.

## Automatic triggering

Eighteen fresh native Codex sessions compared the full old and new skills on
three issue-29 prompts, three repetitions per version. Both versions read the
skill and invoked Jevgrep before source-content search on **6/6 behavioral
questions**, and correctly used grep without Jevgrep on **3/3 exact-symbol
questions**. Both scored **0/6** under the stricter before-any-filename-search
measure; that measure includes AGENTS.md discovery, not just source exploration.

The runs used configured `gpt-6-astra`/medium, one enabled task skill, a frozen
aiohttp-session checkout, and an inert command shim. They measure attempted
invocation, not successful retrieval. The isolated catalog creates a ceiling
effect and does not reproduce Claude's competing-plugin setup in issue #29.
A separate reviewer audited all 18 raw traces and confirmed the counts.

The [trigger report](skill-trigger-2026-09-29.md) contains the
protocol, per-run evidence, token usage, invalid initial probe, and limitations.
Native CLI monetary usage was unavailable; the shim made no retrieval calls.

## Official SWE-bench pilot

| Task | Old skill | New skill | Old total cost | New total cost |
|---|---|---|---:|---:|
| Requests 1142 | Solved | Solved | $0.292728 | $0.208956 |
| Pytest 6197 | Solved | Solved | $1.190029 | $0.896717 |
| Total | 2/2 | 2/2 | **$1.482758** | **$1.105673** |

The two npm archives differ only in `dist/skills/jevgrep/SKILL.md`. Both use the
merged CLI source from `dd43534`, identical pinned task sources and runtime images,
`openai/gpt-5.6-sol`/medium through Gateway, native TypeSafe retrieval, and the
same corrected work-clock harness. The old skill is from `a9993c1`; the new one
is from `dd43534`. Full identities and per-task receipts are in the
[result data](skill-impact-2026-09-29.json).

Each arm/task ran once, in fixed old-then-new order. These are new skill-control
attempts on identical CLI code; historical no-Jev baselines were neither rerun nor
selected as the comparison. The benchmark explicitly invokes `$jevgrep`, so it
cannot measure automatic triggering. Both Requests arms and both Pytest arms ran
one semantic search; the new Pytest arm additionally ran `jg files`.

Observed cost fell on both tasks. Most of the difference was coding-agent usage:
combined agent charges fell from $1.429747 to $1.059810; Jev estimates fell from
$0.053011 to $0.045863. All four task totals have complete accounting. Native Jev
uses the harness's retained list-price estimate, not invoice reconciliation.
Four paid coding attempts totalled $2.588431; this excludes the native Codex
trigger/audit sessions whose monetary usage was not returned.

Timing also decreased (Requests 74.4 → 65.6 seconds, Pytest 307.0 → 227.7 seconds),
but remains diagnostic. One pair per task cannot separate skill effects from
agent/provider variance, order, cache effects, or changed query wording. No
repeats were selected or discarded to improve scores. The small, previously
studied Python sample does not establish generalization.

## Validation and recoveries

Before paid trials, corrected the timing classifier to count `jg files` as work
and recognize searches with `--exclude`. Added cases failed against the old
classifier; all 30 harness tests passed in Docker after the fix. Independent
review found no actionable issues. Both arms freeze the same corrected runner.
An earlier no-call plan was retained as superseded.

Requests initially hit an official-grader platform error: a missing local x86
image tag caused an ARM64 pull. Restored the tag from the pinned AMD64 digest and
regraded the unchanged patches under new run IDs. Both passed; initial error
reports and recovery receipts remain available. No coding attempt was rerun.
One candidate Gateway charge became available on a single accounting retry.

## Next experiment

Keep the merged skill. A useful next step is a predeclared expansion to more
matched SWE-bench tasks, plus a separate native Claude trigger test with its
usual competing skills. Do not infer a broad 25% saving or a solve-rate gain from
this pilot. No additional runs are pending.
