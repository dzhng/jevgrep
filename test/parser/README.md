# Parser behavior

These tests cover source coordinates, Unicode byte boundaries, decorators,
comments, invalid-syntax fallback, structural class ownership and cancellation.
They exercise the bundled Python runtime and TypeScript parser directly, without
requiring a system Python installation or matching a historical spike.

Keep selected units tied to their immutable source snapshot. Splitting large
units must preserve source bytes, and duplicate declaration names must not attach
the wrong class context. A malformed source file may use text fallback; a broken
bundled runtime must surface a setup failure.

Run `bun run test:parser` for isolated Docker checks and packaged CLI coverage.

Source encoding work should grow with source size, not fragment count. The
allocation regression covers that bound; `source.bench.mjs` measures complete
splitting and extraction on fresh snapshots. Run it with
`bash scripts/test-docker.sh node --experimental-strip-types test/parser/source.bench.mjs`.
Compare the same fixture and runtime across revisions; these timings do not
measure provider latency or whole-search throughput.
