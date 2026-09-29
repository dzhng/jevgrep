# Parser behavior

Tests cover original source coordinates, Unicode boundaries, declaration owners,
syntax fallback and cancellation through the production inspection API. Unsupported languages retain lossless text fallback.

Python helpers in `reference/` are frozen test-only oracles from the replaced
runtime. Differential fixtures compare declaration, preview, neighbourhood and
inherited-call output using system Python in the test container. They are never
shipped or executed by the CLI. Tree-sitter also recognizes modern Python syntax;
it is not a CPython semantic validator. Python preview class-header context stops
before the first member's decorators; the frozen CPython helper includes the
first decorator line in that header. Decorators remain attached to the member's
source. Neighbourhood ranges may also arrive in a different order; consumers
combine them as ranges rather than relying on helper order.

Build once (`bun scripts/build-cli.ts`) before running source parser tests: the
build copies pinned official grammar WASM into the generated assets directory.
`bun run dev` prepares these assets automatically.
`bun run test:parser` does this in Docker and checks the installed package too.
Missing/corrupt parser assets are setup errors, never silently downloaded or
misrepresented as malformed user source.

Inherited-call tests preserve useful reading leads when a receiver or callee is
parenthesized, or a selected excerpt contains only a multiline call’s opening
line. They assert returned locations rather than the grammar’s node shape.

Go/Rust tests exercise named selection, declaration groups, generic receivers,
Rust owner/attribute context, and byte-preserving fallback. Installed coverage
checks late-method previews, exact selected source, and missing/corrupt grammars.
