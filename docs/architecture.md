# Jevgrep architecture

Jevgrep retrieves evidence for a coding agent. Jev classifies repository content;
the caller owns explanations, implementation, and verification. Retrieved source
is data, never instructions.

## Discovery and evidence

Hierarchical traversal uses directory metadata and content previews to decide where
to explore. It does not upload the entire tree first. Keep files that pass relevance
criteria without a fixed top-N limit. Unread descendants and failed classifications
remain unknown; partial discovery must be reported honestly. Navigation batches
apply backpressure while source is read, so a wide level does not retain all its
source text before evaluation. Split retries share the scoring queue; they
partition existing source rather than admitting more unbounded work.

Discovery result-processing errors propagate after active evaluations drain; they
are not reported as provider failures. Admission stops when such an error occurs.

Source relevance and scope are separate judgments. The current implementation
counts even when it contains the bug. Contextual follow-up can recover concretely
referenced code and retract earlier selections when valid evidence rejects them.
A failed judgment must not erase previously obtained evidence.

Source selection and presentation are separate. Declaration units, comments,
structural class headers and bounded local-call context preserve meaning without
requiring complete files in the initial output. Parsing supports Python and
TypeScript/JavaScript; other or invalid text falls back to bounded source chunks.
Source ranges always refer to the same immutable snapshot used for classification.

## Output and agent workflow

Stdout begins with status and a compact file summary, then verbatim source blocks,
then detailed declaration and call locations. Useful source should be visible early.
Paths without excerpts remain optional reading leads, not a compulsory checklist.
No separate report file or negative-path inventory is required.

Reading priority depends on the query, ancestor folders and content preview.
Folder names are clues rather than hard exclusions: specs may lead for design
questions, while implementation queries generally favor executable code.

The [public skill](../skills/jevgrep/SKILL.md) owns installation and agent usage.
The skill explains invocation and output semantics; the calling agent owns its
research, implementation and testing workflow. Suggested test commands have not been executed and do not
prove coverage.

## Providers and eligibility

The [core](../packages/core/src/) owns traversal, source eligibility, evaluation
and cache identity. Native state and question objects pass through the AI SDK;
source text is a field inside those objects. Provider selection changes transport
and authentication, not retrieval semantics. Bounded retries, cancellation and
freshness checks apply before source is uploaded or returned.

Ignore rules are reused within a search only while fresh filesystem identity and
canonical-path checks still match. Edits, replacement and deletion invalidate
that reuse. Source snapshots retain their existing read and freshness checks.

## Version improvement

The [evaluation policy](../evals/cost-quality-policy.md) owns version improvement:
official task completion is primary, full coding-agent cost is reported, and Jev
cost is separate. Preserve fixed baselines and identify measured artifacts and
any skill changes. Historical spike parity is not a release requirement.

Product tests cover behavior, source accuracy, provider failures, eligibility and
packaged CLI execution. They do not require old spike prompts, source bytes,
heuristics or output formatting to remain unchanged.
