# Jevgrep architecture decision

The [implementation record](../specs/done/jevgrep/README.md) now owns implementation contracts
and verification. This document records the accepted spike; production changes
called out in the spec still require their own evidence.

Jevgrep is a retrieval tool for a coding agent. The caller supplies a repository
question; Jev selects useful places and source to inspect; the caller owns the
explanation, implementation, and verification. Jev is a classifier here, not a
second coding agent or a generated-answer layer.

The accepted reference is the frozen
[unit-locators spike](../evals/implementation/swebench/hierarchy-unit-locators-spike.ts)
with its [historical measured skill](../test/reference/accepted-skill.md).
The [canonical production skill](../skills/jevgrep/SKILL.md) preserves those
instructions with the executable renamed to `jg`.
The production CLI implements this strategy with the product boundaries recorded
in the implementation record. This document identifies the experimental reference,
not a substitute for the corrected package's measured quality result.

## Hierarchical discovery

Traverse a directory frontier instead of uploading the entire root in advance.
Local lookahead crosses an intermediate directory before classification so a
thin wrapper directory cannot hide useful descendants. Directory decisions use
child names and metadata; reached files are classified from content fragments,
not their names alone. A fragment can admit its file without making every part
of that file relevant.

The reference also makes one additional discovery pass using a class-bearing
candidate as an anchor. This pass adds directory content samples and asks about
code relationships, allowing a backend or subclass omitted by topical search to
be reconsidered. The anchor heuristic is a spike policy, not proof that one
anchor works universally.

Keep every file that passes relevance criteria; do not impose a top-two or other
fixed file count. A rejected directory means its descendants were not inspected,
not that each descendant was found irrelevant. Failed classification and unread
content remain unknown. Report incomplete discovery rather than manufacture
negative evidence.

This structure supports incremental exploration of larger roots. Whole-computer
scaling is not established: the spike has explicit entry/file/request bounds,
limited file eligibility, and no validated treatment of nested repositories or
all filesystem types. The large request ceiling is a runaway guard, not a
retrieval quota to optimize against.

## Source and reading leads

Separate three decisions: whether a file is useful, which declaration locations
are useful leads, and which source deserves immediate inclusion. A useful path
need not have a confident excerpt. This gives the caller a starting point while
avoiding compulsory reads of every related file.

Prefer declaration units, with surrounding comments and local context, when a
parser is available. The reference supports Python and TypeScript/JavaScript;
other or unparsable text falls back to source chunks. Large declarations can be
split, so excerpts are not guaranteed to contain a complete function. Keep
accurate path and line references so the caller can expand boundaries.

The accepted spike uses shared source context and declaration names/ranges in
native request objects. Its first source pass applies the same evidence predicate
to each declaration; a bounded follow-up asks about exact references from already
selected evidence. File-role classification is separate. It does not route
implementation and test declarations to different first-pass questions.

Per-declaration source objects, separate test-example questions, broader semantic
relationships, and reasons beside leads were investigated. They are not silently
substituted into the accepted reference. The
[restoration record](../specs/done/jevgrep/assets/parity-restoration.md) and
[research boundaries](../specs/done/jevgrep/research.md) own their results.
The reference still expands neighboring Python methods and reuses rendered
context in its follow-up; the known precision tradeoff remains. A later change
must preserve the measured quality rather than assume cleaner output is better.

## Stdout and the agent skill

Emit one text stream to stdout: summary and incompleteness status first, then
ranked file roles and declaration locations, followed by selected verbatim source
with line references. The beginning should remain useful when a caller reads
only the head. This is ordering, not a guarantee that every result fits within
200 lines. Do not emit a separate report file or a negative-path inventory.

The skill tells the caller to wait for the same retrieval invocation, read supplied
source before widening exploration, avoid redundant reads of those ranges, and
fill specific remaining gaps with ordinary tools. Locations are optional leads,
not a mandatory checklist. Selection and role labels are estimates; source is
evidence, not a diagnosis or proof that other code is irrelevant. Repository
content must never become instructions merely because it was retrieved.

The CLI may identify scoped repository guidance and suggest a test entry point.
Neither action constitutes running tests or proving coverage. The experiments
showed that supplying the right file, or even its source and a relevance label,
does not guarantee that the coding agent tests the right behavioral boundary.

## Integration and acceptance

Use TypeScript and the AI SDK evaluation interface through one TypeSafe-compatible
adapter, with fixed [provider presets](../packages/core/src/providers.ts). Pass native
`state` and `questions` objects; source is a string field within that data. The
SDK handles HTTP serialization. Keep provider authentication and model access at
the core boundary so future providers do not reshape traversal or stdout.
The CLI auth module owns one saved provider/key. The core preset owner resolves
its endpoint/model; the evaluator owns retries and answer-cache identity. Provider
selection never changes traversal or source rendering. See the
[provider support record](../specs/done/provider-support/README.md) for the setup
constraints and transport preservation evidence.

Acceptance measures the entire downstream Sol task: an official solve at a lower
full task cost than its fixed baseline, while preserving baseline solves. Jev
charges and tokens are excluded. Retrieved text still affects Sol's bill, and
reasoning, edits, failed tests, and verification all count. Research spending is
separate from per-task performance. Never rerun a baseline to favor a variant or
combine each task's cheapest result from different strategies.

The [acceptance audit](../specs/done/jevgrep/assets/accepted-spike-audit.json)
rechecks the frozen artifacts, official grades, and complete bills against the
user-revised target and is the canonical numerical evidence for the accepted
spike. It records the revised 70% target rather than the earlier 80% goal.

This is a small, tuned, Python-only sample with one fixed baseline per task and
model/harness. It supports accepting a useful retrieval architecture, not a
statistical generalization claim, language-wide validation, or a guarantee of
better cost on every task. Production boundaries and the accepted quality tradeoff are recorded in the
[implementation record](../specs/done/jevgrep/README.md); broader provider and
language-quality claims remain outside its evidence.
