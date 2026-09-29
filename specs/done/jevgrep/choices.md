# Implementation choices

This ledger describes the decisions embodied in the implementation, not its
verification status. `jg` is the installed CLI; Jev is the relevance classifier
it calls. “Reference” means the accepted experimental retrieval implementation.
The [implementation record](README.md) owns the closure decision and the
[corrected confirmation](assets/freshness-confirmation.md) owns measured outcomes.

Review these medium-confidence choices first: the benchmark work clock, ordering
inside cross-file evidence, and the shared Python interpreter. They preserve the
intended behavior but create boundaries that future changes must respect.

## Sound — medium confidence

### Measure benchmark work separately from waiting for retrieval

**When:** prospective benchmark timing correction.

A coding agent spends twelve minutes waiting for a standalone `jg` search, then
five minutes editing and testing. The monitor charges the five minutes against
its fifteen-minute work allowance. If another command runs during that search,
the overlapping time counts as work. Two searches running together do not earn
twice the waiting credit. All coding-agent requests still count toward its bill.
The alternative is a wall-clock deadline that can make the agent cancel useful
retrieval merely to reserve coding time.

The clock observes native command-start and command-finish events, not CPU use or
provider execution time. Ambiguous shell programs receive no credit. A transient
error message does not end an active command; command completion or cancellation,
the agent reporting its turn finished or failed, or process exit does. Its rule is:

```text
if a recognized search is active and no other command is active:
    count elapsed time once as retrieval waiting
else:
    charge elapsed time as work
```

**Gap:** the objective treats elapsed time as diagnostic but still needs a runaway
limit. **Reach:** a separate twenty-four-hour wall guard remains; the task
container lives through setup and evidence capture, then cleanup removes it.
A host crash can still leave an owned container behind. Each new study freezes
its timing instruction and policy; old studies retain their original clock.
**Verdict:** sound for the cost/quality objective. **Confidence:** medium, because
observed events are an approximation and the changed instruction is part of the
comparison. Owner: [installed runner](../../../evals/implementation/swebench/installed.py).

### Preserve order inside requests while comparing independent requests fairly

**When:** reference harness and source-selection integration.

Files A and B both produce selected source. If B finishes first, its source enters
the next cross-file request first. A cached answer can change which file finishes
first, so it can legitimately produce a differently ordered later request. Sorting
that source by filename would introduce a different input to Jev, the relevance
classifier, even if every source byte were retained.

The reference fixture controls which source is selected so its comparison is
stable. It may sort independent whole HTTP requests before comparing them, but
never sorts the ordered questions or evidence inside a request:

```text
record each request exactly as constructed
compare the collection of independent requests
preserve every request's internal array and question order
```

**Gap:** the spec did not prescribe how to control concurrent reference calls in a
fixture. **Reach:** fixture equality is not a promise of identical arrival or
completion order in a live repository. Production retains completion order for
cross-file evidence. **Verdict:** sound because it avoids hiding a semantic input
change. **Confidence:** medium. Owners: [retrieval](../../../packages/core/src/retrieve.ts)
and [reference tests](https://github.com/dzhng/jevgrep/blob/80a216bfa0bf04b2ec615ede81f7af32f1c14153/test/reference/).

### Use one child process for the bundled Python interpreter

**When:** bundled-CPython integration.

Two callers have Python parsing work pending. Caller A cancels while the
interpreter is busy. The parent terminates that interpreter, rejects A's work,
and submits B's still-pending request to a replacement. The helpers only inspect
source supplied as data; they do not execute that repository source or modify
files, so replaying B does not repeat a user action. A separate interpreter per
caller would use more resources; leaving parsing in the parent would make a busy
synchronous helper harder to cancel.

```text
on caller cancellation:
    discard the interpreter process
    reject requests whose callers cancelled
    replay other pending, side-effect-free helper requests
```

The same Node child-process owner serves the Node CLI and Bun development host.
An idle child does not keep the CLI alive and exits when its parent disconnects.
Source parse failures use the caller’s reference fallback, such as plain text
chunks when declarations cannot be parsed; missing assets or a failed child
remain fatal. Child diagnostic streams cannot bypass the CLI's stdout policy.
The unchanged helpers retain Python's line coordinates, including carriage-return
lines, while excerpt extraction retains the reference's newline-splitting rule.

**Gap:** Node-only operation and cancellation were required; interpreter ownership
and recovery were unspecified. **Reach:** the package owns runtime assets and one
child process, without a system-Python dependency or an interpreter pool.
**Verdict:** sound because cancellation has one owner and replay is confined to
pure inspection. **Confidence:** medium. Owner: [Python host](../../../packages/core/src/python.ts);
[runtime rationale](assets/python-runtime.md) owns the version boundary.

### Keep directory enumeration order distinct from preview order

**When:** filesystem and discovery integration.

A directory contains more names than fit in one page. The reader keeps an open
cursor—a handle marking where enumeration will continue—and returns pages in the order returned by the filesystem. An empty page of eligible entries does not mean the directory ended;
excluded names may have occupied that page. Full expansion collects and sorts
its entries before constructing requests. A preview instead takes a bounded
native-order prefix and sorts only that sample. Sorting the entire directory
before sampling would show Jev different children.

**Gap:** bounded pages were required, but reader ordering was unspecified.
**Reach:** callers must distinguish exhausted cursors from deliberate preview
truncation or branch pruning, and close unused cursors. Streaming the reader does
not bound all memory used by a caller that collects a whole directory.
**Verdict:** sound because it preserves the reference's sampling distinction.
**Confidence:** medium. Owners: [filesystem reader](../../../packages/core/src/filesystem.ts)
and [discovery](../../../packages/core/src/retrieve.ts).

### Retain declaration questions even when their source overlaps

**When:** reference restoration.

A minified file puts several named declarations on one line. The reference can ask
about the same line under each declaration's name. Combining those questions
would save work, but it would also change what the classifier judges. The port
retains the questions and the visible request guard rather than assuming the
names are redundant.

**Gap:** the implementation had to reconcile a performance concern with the
requirement to preserve unknown contributions of the winning strategy.
**Reach:** preserving this behavior does not promise efficient whole-computer
search or optimal treatment of minified source. A change to question grouping is
a separate retrieval-policy experiment. **Verdict:** sound under the preservation
constraint. **Confidence:** medium. Owner: [selection](../../../packages/core/src/selection.ts).

### Enforce the cache bound by scanning stored entries

**When:** cache integration and performance review.

A new answer is ready to save while the cache is near its disk limit. The cache
publishes the complete answer atomically, then scans stored entries in filesystem
enumeration order and removes entries beyond the retained byte budget. This is
not oldest-first eviction. It does not maintain a separate persistent index or run a
background cleanup service. With many entries, repeating that scan for many new
answers adds overhead; an indexed eviction design would trade that work for
another stateful component to maintain.

**Gap:** the cache size bound was fixed but its maintenance mechanism was open.
**Reach:** storage is best effort, and large-cache write throughput is limited by
repeated scans. This mechanism makes no throughput claim. **Verdict:** sound as a
simple bounded-storage owner with a disclosed cost. **Confidence:** medium.
Owner: [cache](../../../packages/core/src/cache.ts).

## Sound — high confidence

### Revalidate buffered source through the same filesystem policy

**When:** filesystem integration, cross-file evidence handling and freshness correction
`92ca7f9`.

A request is queued with source from A and B. While it waits, the user edits A or
adds an ignore rule excluding it. The request retains A's original content hash,
a fingerprint of the bytes it used, outside the data sent to Jev. Before evaluating
the buffered request, and before each provider attempt after any waiting, the
same reader checks eligibility and compares current bytes with that hash. A
changed source cannot knowingly be submitted again. If a navigation group has
both invalid and healthy members, finite splitting lets the healthy siblings
continue instead of discarding the entire group.

The same rule applies when one file supplies context for another. Each distinct
source donor is checked; stale excerpts are removed and the result becomes
incomplete while admitted locations remain available. A final pass also checks
candidates after role classification, for every language. Successful cache reuse
still follows the caller's initial source validation.

```text
bind buffered content to its snapshot
queue validation in arrival order
if a required source changed or became excluded:
    remove its stale evidence; report incomplete
    retain independently valid work where possible
else:
    evaluate with the unchanged semantic request
before returning, recheck candidate snapshots
```

**Gap:** fresh-source requirements did not settle all deferred validation points.
**Reach:** one reader's policy remains fixed for its lifetime; changing policy
requires another reader. Validation readiness is queued in order while provider
work remains concurrent; this is not a guarantee of network arrival or completion
order. Checks are observations, not locks: changes after a check and bytes already
transmitted cannot be undone. **Verdict:** sound for detected changes, without
claiming atomic filesystem consistency. **Confidence:** high. Owners:
[reader](../../../packages/core/src/filesystem.ts),
[retrieval](../../../packages/core/src/retrieve.ts) and
[attempt boundary](../../../packages/core/src/evaluator.ts).

### Separate cache trouble from missing retrieval evidence

**When:** cache integration.

A cache entry is corrupt or its directory is unreadable. The query asks the
provider instead and reports a cache warning. If the provider supplies the needed
answers, retrieval can still be complete. Treating the cache failure itself as
missing source would incorrectly label that healthy result incomplete.

Stored entries contain validated numeric answers, a schema number identifying the
format, and creation time. The exact request and namespace—the model, provider
and parser/prompt/policy identity—are represented only by a digest filename;
source packets and credentials are not cache payloads. Clearing the cache renames
the current entries directory away before removing it. A concurrent writer can
create a new directory, so clearing does not pause other searches or promise to
remove their later writes.

**Gap:** the result schema needed to distinguish persistence trouble from failed
retrieval, and concurrent clear needed an ownership rule. **Reach:** callers must
preserve warnings separately from incomplete-evidence issues; cache answers remain
disposable and incompatible formats are discarded rather than migrated.
**Verdict:** sound because the cache accelerates retrieval without becoming its
source of truth. **Confidence:** high. Owner: [cache](../../../packages/core/src/cache.ts).

### Cancel a query's sibling requests when authentication fails

**When:** provider-failure integration.

One request receives a rejected-key response while another is sleeping before a
retry. The evaluator owns a shared cancellation signal for authentication failure,
so the sleeping sibling and other in-flight work stop using that key. The caller's
own cancellation remains a distinct reason. Without the shared signal, siblings
could wait or make more requests after the query already knows its key cannot work.

**Gap:** whole-query authentication failure was required; cancellation ownership
was unspecified. **Reach:** each request and retry wait must listen to both caller
cancellation and the shared authentication signal. **Verdict:** sound because one
authentication failure cannot leave siblings spending work independently.
**Confidence:** high. Owner: [evaluator](../../../packages/core/src/evaluator.ts).

### Retain acquired evidence on interruption, but not on invalidation

**When:** partial-result and cancellation integration.

The user interrupts after the first declaration group returns useful source but
before the second group finishes. The result retains acquired evidence and marks
it interrupted. Cancellation alone is not evidence that the file changed. If a
freshness check instead finds different or newly excluded source, that file's
stale evidence is removed. Conflating these cases would throw away useful partial
results whenever the user stopped a search.

**Gap:** cancellation and changed snapshots met at the same preparation boundary
but require different effects on stored evidence. **Reach:** later preparation
paths must retain the distinction; partial output cannot claim complete discovery
or an atomic filesystem snapshot. **Verdict:** sound because the reason for
stopping determines which evidence remains usable. **Confidence:** high.
Owners: [selection](../../../packages/core/src/selection.ts) and
[retrieval](../../../packages/core/src/retrieve.ts).

### Exclude deprecated evaluation packages from workspace discovery

**When:** workspace cutover.

A developer runs the ordinary workspace install or test command. The root includes
core and TypeScript configuration explicitly, so an old personal-repository eval
package is not discovered merely because it sits beside them. Historical local
files remain available; supported root commands point to the official workflow.
Keeping the broad package glob would let deprecated tooling rejoin ordinary work.

**Gap:** removing deprecated entry points did not specify workspace discovery.
**Reach:** new packages must be added deliberately. **Verdict:** sound because
local historical evidence should not become an active dependency by proximity.
**Confidence:** high. Owner: [workspace manifest](../../../package.json).

### Rebuild bundled code and skill whenever a build is requested

**When:** packaging integration.

A developer changes the canonical skill or a core module, then builds the CLI.
The executable embeds both, even though they live outside the CLI package.
Build caching is disabled, so the build cannot reuse an executable whose tracked
inputs omitted that change. A cached build would need complete cross-package
input tracking to make the same guarantee.

**Gap:** the spec did not choose development build caching. **Reach:** builds do
more work, but their outputs reflect current source and skill content. This does
not replace checking the resulting archive. **Verdict:** sound because a stale
embedded skill would change installed behavior. **Confidence:** high.
Owners: [task configuration](../../../turbo.json) and [build](../../../scripts/build-cli.ts).

### Derive notices from bundled inputs and pin external runtime provenance

**When:** release packaging.

A dependency is added to the JavaScript bundle. Bun's emitted-input metadata tells
the notice generator which installed packages contributed code, and their license
texts enter the package. If a contributing package has no license text, the build
fails unless an exact-version upstream override is retained. Copying a static
list by hand could miss a newly bundled dependency.

The separately installed Pyodide runtime includes compiled components that are
not discoverable from JavaScript bundle metadata. Its component notices and source
links are pinned separately, including the distinction between npm metadata and
the upstream license. A runtime upgrade must not silently inherit an unchecked
notice set. Jevgrep's own MIT license remains separate from these dependencies.

**Gap:** licenses were required, but collection and omitted-upstream-file handling
were unspecified. **Reach:** dependency changes can require notice review; ordinary
builds read retained texts without downloading licenses. **Verdict:** sound because
notice ownership follows what is distributed. **Confidence:** high.
Owners: [notice generator](../../../scripts/package-notices.mjs) and
[license provenance](../../../scripts/licenses/README.md).

### Publish one archive, then verify that exact registry version separately

**When:** release workflow integration.

A release tag names a version. The workflow verifies tag/version agreement,
packages one archive, tests it, dry-runs publication and publishes those same bytes.
A separate job retrieves that exact version from npm, compares its integrity—the
hash identifying the archive—and runs installed journeys again. If registry
verification fails, that job can be retried without trying to republish an immutable
version. Stable versions use `latest`; prereleases use `next`.

**Gap:** the user chose tag-triggered publishing and the secret, while artifact
identity, channel selection and post-publication job layout required implementation
choices. **Reach:** release checks follow one archive through publication. This
workflow does not itself authorize a tag or publication. **Verdict:** sound because
build-time and registry-install claims remain separately checkable.
**Confidence:** high. Owner: [publish workflow](../../../.github/workflows/publish.yml).

### Bind a benchmark cohort to one installed package

**When:** maintained benchmark runner integration.

Preparation installs one package and freezes its bytes, skill, safe task inputs,
dataset and runner sources for every cell—a single task attempt—in the cohort.
If a runner stops, the existing attempt is retained; a terminal attempt is not
silently replaced. A new study receives a distinct identity and cannot borrow
cheap outcomes from an older candidate. Saved baseline agents have no execution
path in this runner.

**Gap:** immutable comparisons were required, but attempt storage and lifecycle
mechanics were unspecified. **Reach:** all outcomes and incomplete bills remain
visible; a smaller diagnostic study cannot stand in for a full cohort. Schema
changes retain older studies with their archived runners instead of reinterpreting
them. **Verdict:** sound because artifact and attempt identity prevent result
pooling. **Confidence:** high. Owner:
[installed benchmark runner](../../../evals/implementation/swebench/installed.py).

### Reuse installed journeys for native macOS checks

**When:** supported-platform integration.

A Mac may already have Python and development tools installed. The native harness
installs a tarball in a temporary npm prefix, then runs the installed CLI with a
runtime PATH containing only Node. It reuses the local-command and Python HTTP
search journeys from the Docker tests, with temporary credentials and cache.
Thus system Python cannot quietly satisfy a missing product dependency.

**Gap:** the spec required native Mac evidence but did not specify the harness.
**Reach:** shared portable journeys avoid separate platform expectations. Docker's
filesystem and failure coverage is not claimed for the narrower native smoke;
results identify the actual runtime and archive. **Verdict:** sound because the
installation boundary is exercised without borrowing checkout tools.
**Confidence:** high. Owner: [native harness](../../../scripts/test-native.mjs).
