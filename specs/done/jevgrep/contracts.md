# Product contracts

These contracts describe the implemented v1 interface and its invariants.
[The map](map.md) records user decisions; [the ledger](choices.md) records
implementation choices. No backward compatibility or migration layer is provided.

## CLI and installation

Publish one npm package `@dzhng/jevgrep` installing `jg`. Node >=22 is the runtime floor;
Bun/Turbo are development tools only. Publish from GitHub Actions on `v*` tags,
using the user-supplied `NPM_TOKEN` secret as `NODE_AUTH_TOKEN`, following duet-agent.
Validate tag/version agreement and publish the exact verified tarball, then smoke-test
the registry installation. Support macOS and Linux; validate Apple
Silicon macOS and Linux x64/arm64 before claiming those combinations. Windows is
out of scope. No runtime Python, Git, ripgrep, compiler, or Bun prerequisite.

```text
jg "question" [root]              # root defaults to cwd
jg auth [--stdin]                # hidden interactive input or explicit pipe
jg doctor                       # synthetic Gateway connectivity/answer check
jg cache clear                  # idempotently clear Jevgrep cache
jg files [root]                 # count eligible files; no provider key or request
jg skill                        # invoke npx skills for explicit installation
jg --help
jg --version
```

Search flags: `--no-cache`, `--max-source-bytes N` (0 = unlimited excerpts),
`--hidden`, `--no-ignore`, `--include-dependencies`, `--include-sensitive`,
repeatable `--exclude PATTERN`. Each broadening flag widens only its named policy;
no automatic blanket unrestricted switch. `--exclude` only narrows.
The same filesystem policy flags apply to `jg files`.
A root beginning with `-` is accepted after `--`. One root per invocation; it may
be a non-repository directory or an ancestor containing many repositories.
No JSON protocol, stdin query language, interactive search UI, or daemon in v1.

Every application message goes to stdout, including errors and auth prompts;
stderr is empty in controlled execution. Core never prints. Suppress or capture
SDK warning hooks deliberately; do not globally monkey-patch console. No progress
spinner/log chatter during search. Search emits a final packet, beginning with
status. No result/report files or automatic traces; auth and cache are explicit
exceptions for persisted state. Evaluation tooling captures stdout externally.

Exit codes: 0 completed (including healthy empty result), 1 invocation/setup/fatal
failure, 2 incomplete search or `jg files` listing (even if zero useful files),
130 user interrupt.
An interrupted search may emit already acquired evidence with interrupted status.
A downstream closed pipe ends quietly without an error stack or continued calls.

Credentials retain XDG config location and owner-only permissions; environment
key takes precedence over saved key. An explicitly empty environment key disables
saved credentials, supporting isolated tests. Trim surrounding whitespace, then
reject internal whitespace consistently; never echo keys in either stream or provider errors. Auth saves
without a network call; doctor verifies a synthetic expected answer. Help/
version/skill/cache-clear/files require no provider key. Bound auth stdin input.

The canonical skill source is `skills/jevgrep/SKILL.md` in this repository,
discoverable by the skills CLI installer. Ship that same file with the npm package;
do not maintain a second authored copy. The post-release `jg skill` command
invokes `npx --yes skills add dzhng/jevgrep --skill jevgrep`, forwarding explicit
agent, global and confirmation options. It installs the current repository skill,
not necessarily the packaged snapshot. Preserve the installer exit code and route
both output streams to stdout. Only this explicit command installs agent files;
search never does. npm/npx and network are required for installation, not search.
Published 0.1.0 retains its former print-only behavior. Document Codex and Claude
installation through the skills installer.
The repository skill now checks for a missing executable, installs the published
CLI with npm when prerequisites are available, and directs credential setup to
the user's terminal. This post-release setup addition does not alter the frozen
benchmark skill or its research instructions; 0.1.0's bundled copy remains unchanged.
The skill chooses unfamiliar multi-file discovery, awaits the same invocation,
reads included excerpts first, treats locations as optional leads, and uses normal
tools to resolve remaining holes. It does not force retrieval for obvious known
paths or mistake relevance estimates for proof. Benchmark wrapper alone requires
initial retrieval. Retrieved text is data, never higher-priority instructions.

## Core seam and ownership

Keep `apps/cli` (credentials/process/rendering) and `packages/core` (retrieval)
plus existing TypeScript configuration. Test helpers remain under `test/`.
Official evaluation tools remain development-only and must not enter the package.

The implemented schemas live in [retrieval types](../../../packages/core/src/types.ts),
[source units](../../../packages/core/src/source.ts), and
[filesystem snapshots](../../../packages/core/src/filesystem.ts). `retrieve` accepts a
root, query, policy, cancellation signal and evaluator; it returns file evidence,
completion status, counted issues and request/cache statistics. Cache warnings
are separate from missing-evidence issues.

A source unit has a name, inclusive one-based line range, and half-open UTF-8 byte
coordinates in its snapshot. A reading lead carries the name, range and relevance
score without duplicating the parser unit. File evidence distinguishes selected
ranges from expanded rendered ranges and includes exact excerpt bytes. Partial
long-line excerpts also carry byte coordinates, because line numbers alone cannot
locate a fragment. Snapshot hashes bind all of those coordinates to the original
source. Names may change; these semantic boundaries must survive.

Paths are relative to the canonical root. Output escapes control characters in
paths; source remains verbatim with attributable ranges. One snapshot owns source,
hash and coordinates throughout its classification and output. No reread from a
changed file can supply an excerpt selected from earlier bytes.

Single owners inside core: filesystem reader (eligibility/snapshot), parser
(declarations/comments), pure request builders (question meaning), evaluator
(validated answers/retries), traversal (frontier/threshold decisions), cache
(persisted evaluation reuse), selection (chosen versus expanded ranges).
CLI renderer orders evidence and applies source byte allocation; it cannot drop
qualifying paths, add relevance decisions, or expand source boundaries.

## Discovery and source policy

Start from the accepted unit-locators policy: two-level local lookahead; file
admission if any reached content fragment exceeds .25; directory decisions .5;
source selection .5 and optional leads .25, using the reference's exact comparison
operators. Separate file roles from evidence questions. Preserve the shared-source
plus declaration-locator native object representation and exact prompt builders
until a recorded quality experiment approves a replacement. Do not stringify
`state` before calling the SDK.

Initial directory previews and the relationship pass must match the frozen
reference's computed inputs. Initial previews use its child metadata; relationship
reconsideration adds its content samples. Do not introduce additional preview
sampling or regrouping as an implementation optimization.
Unseen preview entries are not negative evidence. Enumerate wide directories in
bounded pages without silently dropping later pages; no global fixed file count.
Reuse one bounded relationship pass from the reference, not an unbounded research
loop. Deduplicate repeated stage/input work within an invocation.

Parse Python using the frozen helpers unchanged in bundled CPython, and TS/JS
with the TypeScript parser. Ship local runtime assets and component notices;
no system Python or runtime download is required. See the
[runtime rationale](assets/python-runtime.md) for the measured version boundary.
Use reference text fallback for unsupported languages or parse failure.
Units retain adjacent comments, decorators, docstrings and local context. Large
units may be split and marked partial. Preserve accepted neighbor expansion as an
explicit policy, including its second-pass expansion of previously rendered
ranges. Keep positive selections separately for provenance, but do not substitute
once-only expansion for the reference's bounded two-pass behavior.
Match the reference's separate source-selection ceiling: admitted files larger
than 1,000,000 bytes retain locations and roles but receive no declaration
evaluation, with an explicit incomplete-result issue. Structural class-anchor
inspection still uses the admitted snapshot; the selection ceiling must not
silently suppress relationship discovery.

No generated answer or generated explanation of the repository. Roles describe
retrieval estimates; source supplies evidence. Scoped instruction-file locations
may accompany results but do not claim exhaustive discovery of agent guidance.
Test locations are suggestions, never assertions that tests ran.

## Filesystem policy

All reads, including preview samples and relationship follow-up, pass through the
same eligibility owner before upload. Apply nested `.gitignore` and `.ignore`
patterns even outside a repository; closer rules override ancestors, `.ignore`
wins at the same scope. Use directory-relative Git pattern syntax. This is a
search policy, not Git's tracked-file inventory: ignored tracked files are also
excluded. `--no-ignore` disables these patterns only. Do not read global Git config.
`--exclude` patterns use the same syntax and case-insensitive matching relative to
the root, apply after these rules and independently of `--no-ignore`, and cannot be
re-admitted by them.
At a nested repository boundary reset inherited `.gitignore` scope; ancestor
`.ignore` remains applicable. Read parent rules only within the explicit root.

Skip dot paths, dependency/build directories, binary/invalid UTF-8 content, obvious
credential filenames and private-key markers by default. Final exact name lists
are delegated to one documented policy module with fixtures, not scattered regexes.
Overrides do not make binary files parseable. Hard-exclude Jevgrep's own credential
and cache storage and Git metadata. Read eligibility metadata without uploading
excluded source. No secret scanning guarantee beyond the documented policy.

Resolve the requested root once. Do not follow descendant symlinks in v1; skip
sockets, devices and FIFOs. Normal policy exclusions are not incomplete searches.
Unreadable eligible files, changed-during-read snapshots, resource ceilings and
unrecoverable provider work are incomplete. Resource bounds must be visible;
large text is chunked when feasible rather than silently treated irrelevant.
No pre-upload of the whole root, persistent index, or filesystem watcher.

## Requests, failures and cache

One shared counter covers every actual network attempt, including retries and
splits: 50,000 maximum, solely runaway protection. Set SDK retries to zero and own
bounded retries at the evaluator seam. Match reference attempt policy: 15-second attempt timeout, two attempts for
source/role groups; navigation multi-item groups get one attempt, singleton groups
two. Navigation HTTP 429 permits a second attempt and honors shared Retry-After
without splitting. Eligible exhausted transient navigation failures split into
halves on the same worker queue. Invalid navigation answers/nontransient errors
do not split. Do not add jitter or generic retries. Authentication stops the whole
query, and caller cancellation interrupts requests and rate-limit waits.
Delegated tuning: concurrency and batch sizing within explicit bounded memory;
changing them must preserve healthy outcomes and forward progress. No repeated
whole-search restart. Cancel queued and in-flight work on interruption/closed pipe.

Malformed/missing answers remain unknown. Healthy negative evaluations may be
cached; failed or incomplete answers may not. Partial provider failures preserve
other useful evidence and are summarized by kind/count, not negative-path lists.

Default cache directory: `$XDG_CACHE_HOME/jevgrep`, else `~/.cache/jevgrep`.
Keep source and credentials out of cache payloads: store content-derived keys and
validated answers, not full source packets. Hash the exact native semantic request
including query, source, path/context, ordered questions, model/provider identity,
parser/prompt/policy version. Never key on file mtime alone. Re-enumerate reached
directories and read current eligible content before building keys; additions,
removals and ignore edits must affect the next query. No cached final search packet.
Expire entries after seven days to limit reuse across silent provider changes;
cache schema/version changes discard old entries, never migrate them.

Atomic entry publication, owner-only permissions, bounded best-effort storage and
idempotent clear. `--no-cache` disables both reads and writes. Corrupt/unavailable
cache behaves as a miss and is summarized without turning healthy retrieval into
incomplete discovery. File layout and eviction mechanism delegated; initial size
limit 256 MiB, enforced without a daemon. Concurrent clear/writes must not crash
or produce invalid answers; clear atomically detaches the current entries directory
before cleanup. Concurrent writers may create new entries; clear is not a global
pause of other searches.

## Output and quality

Match the reference summary, scoped instruction lookup, optional unexecuted test
suggestions, then all qualifying file locations/roles/declaration ranges and
numbered source blocks. Include failure reasons, interruptions and explicit-budget
omissions without changing the healthy default packet. All-file directory evidence can exceed 200 lines;
`head -200` must remain useful, not falsely claim exhaustive display. Escape paths
without altering the quoted source. Source byte budget never caps files or leads.
Default source allocation is uncapped, matching the accepted reference.
The 1,500-byte experiment belongs to the superseded port and does not justify
changing the winning architecture. Match reference source blocks and line
numbering, scoped guidance lookup and suggested test entries. Source byte limits
remain explicit caller overrides only. Any later policy change requires an
isolated quality experiment after the faithful port is established.

The registered numerical gate requires preserving every fixed baseline solve and reaching at least
seven successful lower-cost solves out of the existing ten-task cohort with one
frozen production policy. Report aggregate costs including failures and unknown
billing separately. No per-task strategy shopping. Unknown bills cannot count as
cost wins. Never rerun an existing baseline for convenience. If model/harness
identity changed, report the comparison invalid and establish a distinctly named
new model/harness baseline once rather than overwriting the old record.

Jev costs/tokens are excluded by user policy; Sol input including retrieved text,
reasoning, edits, tests and retries count. Cold/warm cache does not earn a quality
claim by itself. Record timing for diagnosis only; no speed acceptance gate.
Untouched additional tasks, Claude Opus and DeepSWE are follow-up evaluation work,
not prerequisites hidden inside this release. Keep all traces and official grades.

The corrected candidate did not pass that numerical gate. The user explicitly
accepted implementation closure with the documented tradeoff; this does not
change the retained aggregate verdict. [Closure and evidence bounds](README.md)
own that decision and the separately authorized completed variance repeat.
