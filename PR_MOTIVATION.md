# Motivation: narrow paid discovery with file categories

I use Jevgrep in repositories containing large amounts of research data alongside
source code. Jevgrep was considering data files during discovery, and the
resulting provider usage became expensive enough that I wrote a local `jg`
wrapper to add exclusions. The wrapper excludes logs, JSONL/NDJSON and profiling
outputs globally, with additional repository-specific patterns and a request cap.

The underlying problem is broader than my repository: a directory being relevant
to a question does not mean every kind of file in it is appropriate for paid
relevance scoring. Datasets, logs and temporary outputs can be readable text,
so binary rejection does not solve this. Media and archives can also contribute
irrelevant filenames to discovery even when their contents would be rejected.

Existing `--exclude` patterns and ignore files are useful escape hatches, but
users must identify and maintain all the patterns themselves. This change adds
an opt-in vocabulary for the intended scope, using local filename rules before
provider evaluation. For example:

```sh
jg files . --only code,config,docs --list
jg "Where are retries implemented?" . --only code,config,docs
```

The implementation reuses the shared filesystem eligibility policy, the existing
free `files` inventory and existing request budgets. It introduces no new runtime
dependency or paid classification step. Repository mappings handle ambiguous
filenames; category exclusions win over selections, and existing ignore, binary
and sensitive-file checks remain in force. Searches without category flags retain
their existing behavior.

This PR does not claim measured dollar savings or unchanged retrieval quality.
It makes unnecessary file evaluation avoidable and lets users inspect that scope
before spending. Actual savings depend on repository contents, traversal,
batching, cache state and provider prices. Media selection does not add media
understanding, and filtered-out evidence cannot support conclusions about the
whole repository.

## Validation contract

- Exercise categories through both the command-line preview and shared filesystem.
- Confirm excluded filenames and contents never appear in captured provider payloads.
- Cover category unions, exclusion precedence, unknown files, repository overrides,
  malformed mappings, live mapping changes (including coarse timestamps), and
  existing ignore/binary/sensitive-file gates. Both source uploads and queued
  filename-only navigation must respect the active mapping.
- Use synthetic provider responses only; no paid benchmark is needed to prove
  the filtering contract. A savings percentage would require a separate measured study.
