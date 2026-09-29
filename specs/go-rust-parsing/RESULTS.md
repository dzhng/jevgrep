# Go/Rust parsing measurements

Three fresh-process trials of the final candidate on darwin/arm64 with Node
24.14.0 are compared with the unchanged `ae10a9e` baseline trials from
[development](development-measurements.json). Baseline trials were not rerun. Cold time
includes module import and first inspection; warm time is the median of ten
inspections, summarized across the three processes. No provider calls were made.

| Language | Functions | Cold before → after (ms) | Warm before → after (ms) | Target unit bytes before → after |
|---|---:|---:|---:|---:|
| go | 100 | 143.38 → 281.41 | 0.06 → 2.65 | 5,195 → 52 |
| go | 1,500 | 151.98 → 454.15 | 0.63 → 30.63 | 23,976 → 54 |
| rust | 100 | 148.12 → 275.91 | 0.06 → 2.42 | 5,180 → 52 |
| rust | 1,500 | 152.00 → 257.82 | 0.62 → 22.19 | 23,976 → 54 |

This is a deliberate precision/cost tradeoff. Parsing adds work and worker memory;
text fallback had no parser worker. The measured unit contains a known target
marker, not a model-selected final excerpt. Smaller units do not establish lower
end-to-end cost, better recall, or faster coding-agent tasks. Worker RSS snapshots
and source identities are in the [raw measurements](measurements.json).

The installed search fixture supplies deterministic relevance answers. It verifies
that late methods reach large-file declaration indexes, named selection returns
their source and Rust attributes, and distant noise is not returned. This is a
capability check, not a live-provider quality benchmark.

Reproduce each workload in prepared baseline/candidate checkouts using the same
[measurement script](bench.mjs), with `go` or `rust` and 100 or 1500 functions:

```sh
node --experimental-strip-types specs/go-rust-parsing/bench.mjs /absolute/checkout/packages/core/src/source.ts go 1500
```

Run each arm in alternating fresh processes. The candidate must first prepare its
pinned grammar assets through the CLI build. Further extraction fixes may change
timings; the recorded source hashes identify this measurement cohort.
