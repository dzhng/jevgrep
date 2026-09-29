# Go/Rust declaration retrieval

Go and Rust use named source selection through the existing bounded parser
worker. Python and TypeScript behavior stays fixed; the Python prerequisite is
the official `psf__requests-1142` checkpoint against merged `ae10a9e`.

The useful contract is observable through `inspect` and installed search:
declaration names appear in large-file previews, selection can isolate a function,
and returned source preserves original UTF-8/CRLF bytes and declaration context.
This establishes structural retrieval capability, not measured model recall.

The pinned official grammars (`tree-sitter-go` 0.25.0 and `tree-sitter-rust`
0.24.0) supply syntax, following their upstream tag conventions. Grammar assets and licenses share
the existing build and release-validation owner. No new runtime download, native
compiler, worker pool, or cache is introduced.

`parser-declarations.mjs` owns Go/Rust syntax extraction; the worker owns parser
lifetime. Go declaration groups remain intact because constants can depend on
group order (`iota`). Rust modules, traits, impls, attributes and inner attributes
retain their enclosing headers. Generic receivers keep their source spelling;
this is neither type resolution nor macro expansion.

Verification: focused tests fail against text fallback and pass with named
declarations; installed tests verify declaration indexes and returned source;
malformed/oversized source keeps lossless fallback; missing grammars fail visibly.
Cold/warm cost and source-unit size are measured against `ae10a9e`; overhead
is reported without calling it a speedup. Full release gates and independent
review cover the integrated change.

References: [Go tags](https://github.com/tree-sitter/tree-sitter-go/blob/v0.25.0/queries/tags.scm)
and [Rust tags](https://github.com/tree-sitter/tree-sitter-rust/blob/v0.24.0/queries/tags.scm).

[Measured precision and parsing cost](go-rust-parsing/RESULTS.md) records the
tradeoff. Python query previews and inherited-call analysis remain Python-specific.

## Verification record — 2026-09-29

`bun run verify` passed 210 source checks and 41 installed-package scenarios.
Native Apple Silicon smoke passed all 11 journeys, including Go/Rust search.
Typechecks passed; lint retains the existing filesystem control-regex warning.
A clean checkout installed the locked grammar packages and validated the exact
archive, its canonical assets, license notices, and integrity.

Independent review's multi-name Go constant-label finding was reproduced and
fixed by excluding punctuation from identifier fields. Focused tests failed
before each extraction fix and passed afterward. Python parsing retains its
existing differential and cancellation coverage.
