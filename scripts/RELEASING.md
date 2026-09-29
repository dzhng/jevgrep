# Release identity and evidence

A release is selected by the version in `apps/cli/package.json` and an exactly
matching `vVERSION` tag. The development version `0.0.0` is not publishable through
this workflow. Stable versions publish to `latest`; prereleases publish to `next`.
The package is `@dzhng/jevgrep`, and its executable is `jg`.

Review the [recorded quality decision](../specs/done/jevgrep/README.md) and
supported-runtime evidence before requesting a release. Implementation closure
is not a claim that the original numerical quality gate passed. Ubuntu CI is not native macOS evidence and does not run paid
model evaluations. The root `bun run verify` command is the common deterministic
gate. Preparing a workflow or a candidate does not authorize creating a tag or
publishing a development checkpoint.

The [tag workflow](../.github/workflows/publish.yml) verifies, builds, packs, and
checks canonical package content before exercising that exact archive through the
installed Docker journeys. It retains the tarball and manifest as a workflow
artifact and dry-runs npm publication before publishing those same bytes.
Configure `NPM_TOKEN` as a repository Actions secret; only the publish step receives
it as `NODE_AUTH_TOKEN`. Credentials never belong in a committed file.

A separate job fetches the exact registry version, checks its integrity against
the verified archive, and installs it into a fresh Node-only runtime for the same
fixture-backed journeys. If registry availability or smoke verification fails
after publication, rerun the failed registry-verification job; a published version
is immutable and must not be replaced.

[Package validation](validate-release.mjs) owns the allowed payload and canonical
asset checks. [The build](build-cli.ts) copies the authored MIT license and
[collects third-party notices](package-notices.mjs) from emitted bundle inputs.
[Retained license sources](licenses/README.md) document upstream distribution gaps.
The archive excludes test fixtures, evaluation evidence, node_modules directories, source maps,
and unbundled development source. The parser worker, extraction code, and packaged grammars
are required runtime assets and are included. Direct runtime parser dependencies
install from exact npm pins; transitive dependencies resolve during npm installation.
The registry-verification checkout installs locked development dependencies and
runs [asset preparation](parser-assets.mjs) before comparing canonical grammar
bytes and license notices with the downloaded archive.

On an Apple Silicon Mac, run `node scripts/test-native.mjs` after the normal
`bun install --frozen-lockfile` setup. This builds and packs the candidate, installs
it with npm outside the checkout, and runs the credential-free commands and
synthetic Python/Go/Rust searches against a loopback Gateway fixture. To verify an existing
archive without Bun, use `node scripts/test-native.mjs --prebuilt /path/package.tgz`.
The command prints the archive hash and actual Node/macOS runtime for retained
evidence. It requires Node 22 or newer; a result proves the printed version only.

Native installation uses temporary npm configuration, HOME, and XDG directories.
The installed process receives a PATH containing only Node, so host Python, Bun,
and compiler installations cannot satisfy runtime dependencies. All fixture
credentials are synthetic, and local commands must make no Gateway requests.
This bounded smoke complements the Docker suites; filesystem-policy tests still
run only in their isolated Docker environment. npm installation needs network
access to resolve the exact runtime dependencies; search uses only loopback HTTP.
