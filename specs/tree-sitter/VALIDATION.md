# Verification

The release gate is `bun run verify`: source tests, provider-protocol tests,
parser differential tests, evaluation-harness tests, and installed Node-only
journeys run alongside type and lint checks. Provider requests use local fixtures.
No paid-provider or coding-agent task-quality claim follows from these checks.

`node scripts/test-native.mjs` exercises a fresh npm installation on Apple Silicon
with only Node on its runtime PATH. It complements Linux Docker verification;
neither environment silently supplies a Python executable or native compiler.

Archive validation must also run from a clean checkout after locked dependency
installation and grammar preparation, matching the registry-verification job.
Without preparation, canonical grammar comparison must fail; with preparation,
the archive identity, bytes, notices, and integrity must match.

The frozen Python helpers are differential oracles. Real-source comparisons must
distinguish retrieval regressions from documented syntax-version and class-header
boundaries in the [parser contracts](../../test/parser/README.md). Golden fixtures
cover each corrected regression and must fail when its fix is removed.

## Recorded closeout — 2026-09-29

Integrated with main `6e9bc588`. `bun run verify` passed: 204 source checks
(119 Bun, 18 provider protocol, 33 parser, four release, 30 evaluation-harness)
and 40 installed-package journeys. Typechecks passed; lint reported only the
existing filesystem control-regex warning. Native smoke passed all ten journeys
on darwin/arm64 with Node 24.14.0; Docker uses Node 22.

The native-installed archive and canonical archive validation shared SHA-256
`3309d67d7ae8d5a9ca824eaf7d1d5a0c2193df6422998d18cd8f34d61c2cff38`.
Clean-checkout grammar preparation was verified with a failing missing-asset
control and a successful canonical-byte, notice, and integrity comparison.

A 155-module Python 3.14 standard-library probe compared all four helpers
(620 comparisons). Differences were the documented decorator header and
Python 3.14 unparenthesized exception tuples: the prior embedded Python 3.11
runtime also rejects that newer syntax. Neighbourhood comparisons disregard
ordering, as their consumer does. Go/Rust text fallback matched main on small
and split Unicode fixtures. These probes do not establish task-quality gains.

Independent review findings were reproduced, fixed, and covered by tests that
failed without the fixes. The [review decisions](REVIEW.md) explain their scope.
