# Installed package cohort

[The runner](installed.py) evaluates one frozen installed `jg` package against
[the ten fixed Sol baselines](fixed-baselines.json). Baseline receipts, prompts,
grades and billing are checked by hash; there is no baseline execution command.
The two recorded baseline nonpasses remain nonpasses, including the retained
Pylint test-collection limitation.

Preparation installs the packed npm artifact and dependencies once, then checks
that same installation offline in every selected runtime image. Each check
verifies the original source, agent versions and canonical packaged skill.
The coding agent receives the archived prefix and runs the real `jg` executable
on an internal network. The benchmark prompt explicitly invokes `$jevgrep`, as required for the retrieval comparison;
the public skill itself teaches CLI usage without prescribing a research workflow. Retrieval limits come
from the frozen package's default policy.

New preparations use the current canonical `skills/jevgrep/SKILL.md` by default
and reject a package carrying different skill bytes. Use `--skill` only for an
explicitly identified comparison; existing frozen plans retain their original
skill for reproducibility.

The plan binds one package, installed prefix, skill, safe task export, evaluator
dataset and archived runner/broker/registry sources before any treatment runs.
Existing studies remain unchanged; their archived source records the procedure used.
A fresh full-cohort plan prevents combining the cheapest outcomes from different
packages or experiments. A single-task plan is useful for diagnostics but cannot
support a claim about the full cohort.

```sh
python3 evals/implementation/swebench/installed.py prepare \
  --package /absolute/path/to/package.tgz --output /absolute/path/to/new-study
python3 evals/implementation/swebench/installed.py run \
  --plan /absolute/path/to/new-study/plan.json --all --dry-run
```

Preparation and dry-run make no model calls. `prepare` defaults to all ten tasks;
`--jev-provider typesafe` selects native Jev for a separately identified provider
experiment. Sol continues through Gateway. The broker holds both real credentials;
the agent receives only its scoped broker token. Native Jev cost is estimated from recorded input usage at the documented
list price frozen in the runner. Total task cost includes both Sol and Jev.
Missing usage or incomplete transport coverage leaves that total unknown.
`--task` selects one registered task. `--evidence-root` locates the retained
baseline and evaluator files when preparing from another checkout. The root
`eval:swebench` alias points to this entry point; `--help` lists its arguments.

If a retained Docker image was removed, restore its pinned official base and
archived toolchain, then prepare that one task with `--runtime-image` and the new
immutable image ID. Preparation verifies the base image's filesystem layers,
source identity, tool versions and installed skill. The frozen plan records both
image IDs; baseline receipts remain untouched. Preserve the rebuild recipe and
toolchain checksum verification beside the study and disclose the rebuild when
reporting timing comparisons.

After reviewing the frozen plan, `run --all` without `--dry-run` executes the paid
treatments sequentially. Load the Gateway credential through the authorized
environment workflow. Real keys stay out of plans and command arguments. Every
attempt has fresh home/cache state and a durable lifecycle receipt. Failed or
completed attempts are retained; they are never replaced. Active processes stop
continuation. An abandoned attempt whose runner and containers are gone becomes
an interrupted result, preserving its evidence.

Follow execution with `grade --plan ... --all` and `account --plan ... --all`.
Use `--task` instead of `--all` for an individual cell. Grading uses the pinned
official harness and unique run IDs. Accounting reuses saved generation metadata,
fetches missing receipts, and leaves full cost unknown if any request is missing.
Neither operation reruns the coding agent.

Jev is reported separately under `jev`: the observed cost sums each retained
response's `providerMetadata.gateway.cost` once. Input/output tokens and internal
provider attempt counts are reported separately from client calls; provider
fallbacks do not multiply the response cost. This is observed API metadata, not
invoice reconciliation. Complete totals require matching client starts, completed
transport receipts, request/response files and valid cost fields. Missing or
invalid evidence leaves the total unknown while preserving a known subtotal.
Retained response costs still contribute to that subtotal when the transport log
or a request-start entry is missing.
These observations never enter the scored Sol task cost or change cost-win rules.

`aggregate --plan ...` reports official solves, protocol validity and billing for
the selected tasks. It does not issue a promotion verdict. Unknown costs prevent
a full cost total; the known subtotal remains explicit. Saved no-Jev results are
historical context, not the release acceptance target.

Compare a candidate with the preceding released package using the same tasks,
model, harness and public skill. Official task completion is primary, with full
Sol cost reported alongside it. Keep both package artifacts and every attempt;
do not combine favorable results from different candidates.

Run storage holds the frozen artifacts, agent output, patches, official reports
and billing. [The broker](gateway_broker.py) retains exact Jev request/response
bodies in the non-agent container without authentication headers. These contain
benchmark source and remain local with the ignored study evidence.

[Focused tests](test_installed.py) run in an isolated Docker container. They cover
prompt identity, drift rejection, no-call validation, retained attempts, incomplete
billing, aggregate reporting and exact body capture through a synthetic provider.

## Treatment work clock

New schema-3 plans freeze a 900-second treatment **work** budget. The monitor uses
host monotonic observation of native `command_execution` started/completed events.
Only native command-execution events establish concurrent work for this clock.
It excludes the union of standalone `jg` search waits only while no other command
is active. Overlapping retrieval calls earn no double credit; unrelated concurrent
commands count as work. Completion, cancellation, terminal turns and process EOF
end credit. Nonterminal error/reconnect events do not end an active command.
A separate 24-hour wall limit protects against a runaway retrieval. The task
container stays alive for setup and artifact capture until lifecycle cleanup; it
has no competing shorter sleep deadline. An expired clock always records a failed
attempt, even if the native process has already exited zero while output drains.
Receipts retain work, credited retrieval and wall durations plus the disjoint
credit intervals and native command IDs, so timing remains auditable.

The recognizer accepts a direct installed `jg` search, including the native shell
wrapper. It recognizes search exclusions and gives no credit to files, auth,
doctor, cache, skill, help/version, compound commands, redirections or shell expansions. Ambiguous invocations count as work.
Event-observation timestamps measure what the harness sees, not provider execution
time; malformed timing events invalidate the timing evidence rather than inventing
credit. Process startup and time outside qualifying waits count toward work.

The treatment prompt states this clock explicitly; its timing sentence therefore
differs from the retained baseline prompt. Baseline prompt bytes, receipts, model,
grading are unchanged. This correction does
not rescore old attempts or explain away earlier task failures. Schema-2 studies
remain usable with their archived runner and wall-clock policy; the current runner
requires a fresh schema-3 plan and rejects timing-policy drift.
