# Review decisions

Tree-sitter replaces the embedded Python interpreter while retaining the
Python retrieval contract. New language support is outside this change;
Go and Rust continue through the existing text fallback.

The worker owns initialization and cancellation, syntax analysis owns source
ranges and reading leads, and preview rendering owns byte budgets. No parser
cache or parallel worker pool is introduced.

The closeout review found two call-context regressions: concrete syntax retains
parentheses that CPython's AST removes, and a multiline call must be associated
with the range containing its opening line. Both now have regression tests that
failed before the fix. Parenthesis handling is shared across the syntax consumers. Comments are
excluded from expression children, base classes, and concatenated-string checks;
regressions cover commented receivers, byte strings, and docstrings. Valid
parenthesized deletion targets use the same expression handling.

Registry verification must prepare canonical grammar assets from locked packages
before validating the downloaded archive. The release workflow owns that setup.

The test-only CPython helpers remain differential oracles, not runtime dependencies.
[Parser contracts](../../test/parser/README.md) document the deliberate compatibility
limits; [validation](VALIDATION.md) records the final checks.
