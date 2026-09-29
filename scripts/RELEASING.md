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
artifact and dry-runs npm publication. A fresh publish job verifies the archive
hash and package identity against the pushed tag, then publishes those bytes without checking out the repository, installing
project dependencies, or executing package scripts. Only that job can request
an OIDC token. Hash verification preserves the tested bytes; it cannot detect
malicious code already present in the build inputs.

Before merging this workflow, a maintainer must configure an npm trusted
publisher for `@dzhng/jevgrep`: GitHub owner `dzhng`, repository `jevgrep`, workflow
`publish.yml`, environment `npm-release`. In [Allowed actions](https://docs.npmjs.com/trusted-publishers/#for-github-actions),
permit direct publication with `npm publish`; this workflow does not use staged publication.
Create that GitHub environment before merging: a missing environment can be
created automatically without protection on its first use. Configure required
reviewers and restrict deployment
to release tags; protect creation of those tags with repository rules. The build
job must never reference this environment. A reviewer should inspect the tag,
workflow changes, and build evidence before approving a release.

The publish job uses Node 24 with npm 11.5.1 or newer, as required by
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).
There is no token fallback: missing publisher configuration must fail publication.
After verifying a successful trusted release, revoke the old npm publishing token
and remove the `NPM_TOKEN` Actions secret. These account settings cannot be applied
by merging this workflow. Credentials never belong in a committed file.

A separate job fetches the exact registry version, checks its integrity against
the verified archive, and installs it into a fresh Node-only runtime for the same
fixture-backed journeys. This job executes checkout code but has neither publishing
credentials nor OIDC permission. If registry availability or smoke verification fails
after publication, rerun the failed registry-verification job; a published version
is immutable and must not be replaced.

[Package validation](validate-release.mjs) owns the allowed payload and canonical
asset checks. [The build](build-cli.ts) copies the authored MIT license and
[collects third-party notices](package-notices.mjs) from emitted bundle inputs.
[Retained license sources](licenses/README.md) document upstream distribution gaps.
The archive excludes test fixtures, evaluation evidence, node_modules directories, source maps,
and unbundled development source. Authored Python helpers and the Node worker
are required runtime assets and are included. Direct runtime parser dependencies
install from exact npm pins; transitive dependencies resolve during npm installation.

On an Apple Silicon Mac, run `node scripts/test-native.mjs` after the normal
`bun install --frozen-lockfile` setup. This builds and packs the candidate, installs
it with npm outside the checkout, and runs the credential-free commands and
synthetic Python search against a loopback Gateway fixture. To verify an existing
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
