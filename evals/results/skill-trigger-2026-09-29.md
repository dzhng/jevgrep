# Jevgrep skill automatic-trigger pilot

No observed before/after movement in this bounded Codex pilot. This is an **invocation-only** experiment, not retrieval quality or task-solving evidence.

| Prompt | Old: skill read | New: skill read | Old: jg search before source content | New: jg search before source content |
|---|---:|---:|---:|---:|
| How does session expiry via max_age work? | 3/3 | 3/3 | 3/3 | 3/3 |
| Where are cookie attributes kept when a session is cleared? | 3/3 | 3/3 | 3/3 | 3/3 |
| Where is SESSION_KEY defined? | 0/3 | 0/3 | 0/3 | 0/3 |

All behavioral sessions first performed filename discovery (`rg --files`, including AGENTS.md checks). Under issue #29’s stricter “jg before any other search” measure, both arms scored 0/6. Under the shipped skill’s “before broad text searches or git history” requirement, both scored 6/6. Exact-symbol controls used grep and did not read the skill or invoke jg.

## Protocol

- Codex CLI 0.153.4; inherited configured model `gpt-6-astra`, reasoning `medium`; no model/effort override.
- Fresh ephemeral native agent per prompt/repeat, read-only sandbox, separate disposable checkout each time, no existing conversation. Two concurrent sessions, launches staggered.
- aio-libs/aiohttp-session source frozen at `66a747a555e1db17cce80307c9ffd20600af6a09` (58 files). Full old skill from `a9993c1:skills/jevgrep/SKILL.md`; full new skill from `origin/main:skills/jevgrep/SKILL.md`. Snapshots included here.
- Only the arm’s project Jevgrep skill enabled. Other installed user skills, plugins, MCP servers, and multi-agent capability disabled by per-command overrides; real configuration files not edited.
- Each prompt was the issue-29 question plus: “Answer from this checkout. Do not modify files or install software. Keep the answer concise.” Neither the desired tool nor expected answer was in the prompt.
- A PATH shim named `jg` emitted `JEVGREP_INVOCATION_SHIM: <args>` and deliberately failed with code 69. This measures attempted invocation only. No provider retrieval requests or credentials were needed.
- Grade skill-file reads separately from shim-confirmed jg calls. Mere `command -v jg`, promises to use it, and `jg files` alone are not a semantic search hit.
- Three repeats per version/question (18 valid sessions). An initial probe carrying “do not access credentials” caused an explicit skip; preserved under `invalid-credential-constraint-probe/` and excluded. Removing that conflicting instruction restored invocation before scaling.

Raw evidence paths below are relative to local ignored storage at
`evals/runs/skill-trigger-2026-09-29/`; raw traces are not distributed with Git.

## Evidence and limitations

- `results.json`: per-run judgments and ordered command traces; `<arm>-<case>-<repeat>.jsonl`: full raw native tool/output trace and token usage; `.command.json`: exact invocation; `.answer.txt`: final response; `.meta.json`: elapsed time and source ref.
- `isolation-audit.json` verifies source files stayed byte-for-byte unchanged and no unexpected output appeared in the disposable checkouts. Live repository status was checked periodically; no source or skill edits were made by this experiment.
- Tiny sample and a single enabled task skill create a ceiling effect. This is Codex, not the Claude Code/Opus setup in #29; it cannot validate or disprove that reported result. Disabled competing skills/plugins also differ from that setup.
- Complete skill versions differ in body as well as description. This is an old-vs-new package test, not a causal description-only ablation.
- No retrieval succeeded, so this says nothing about answer quality, benchmark resolution rate, real provider latency, or spend.
- Script grading was manually checked against raw command traces; the parent reviewer can audit those traces independently.

## Usage

Valid sessions: `{"input_tokens": 1526792, "cached_input_tokens": 1180160, "cache_write_input_tokens": 0, "output_tokens": 8033, "reasoning_output_tokens": 16}`.
Monetary cost was not returned by the native CLI and is not estimated. Provider retrieval cost is zero because the inert shim intercepted every jg invocation.

Skill SHA256:

- old: `82d4537183cb9219d60400df1d478ad0b213e14bf05bf6ae9b7f7e751dc3d935`
- new: `916bf51b9a57f1cb94d04dbd90d361f1190b6dabc0f9d1ca152d2469862a974c`

`evidence.json` records each run’s actual skill-read, jg invocation, and first content-search command with trace pointers.

## Independent trace audit

A separate reviewer checked all 18 raw sessions and confirmed every reported count and full skill-file read. The strict filename-search measure includes AGENTS.md discovery attempts; one session only checked AGENTS.md before Jevgrep, so this should not be called substantive source discovery in every case. The script's compound-command classifier missed two later content searches paired with `rg --files`; both happened after Jevgrep and do not change the counts. `evidence.json` points to the correct first content searches.
