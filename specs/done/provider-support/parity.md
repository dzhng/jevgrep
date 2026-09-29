# Preservation gates

Historical provider-port evidence: the frozen-spike compatibility requirements
below were retired in favor of [official task completion and cost](../../../evals/cost-quality-policy.md).
They do not constrain current retrieval, skill wording or output formatting.

The immutable input tree and historical hashes are identified in
[research](research.md). Keep the original oracle executable, corpus, manifest,
manifest-covered files and prior studies byte-for-byte unchanged. The production
harness may change its setup/routing; it must not loosen the expected result.

| Preserved behavior                                             | Existing evidence                                                                                   | Owner and acceptance gate                                                                                                                   |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Structured state, exact instructions and question IDs/order    | `test/reference/requests.test.ts`, `corpus.json`                                                    | Evaluator: compare new-wire semantic requests to frozen corpus through built production CLI                                                 |
| Hierarchy, thresholds, role/evidence/reference decisions       | `test/reference/discovery-parity.test.ts`, `selection.test.ts`, `repository-context-parity.test.ts` | Evaluator: existing decision regressions remain green                                                                                       |
| Full stdout, source selection/order and excerpts               | `replay.test.ts`, `evidence-order.test.ts`, Python/comment parity tests                             | Evaluator: exact complete stdout plus existing ordering/parser tests                                                                        |
| Retries, cooldown, auth abort, timeout and attempt guard       | `test/evaluator.test.ts`                                                                            | Evaluator: real native-wire HTTP failure matrix                                                                                             |
| Source freshness on cache reads and every retry                | `test/retrieval-freshness.test.ts`                                                                  | Evaluator: mutation/deletion during wait cannot upload stale source                                                                         |
| Validated answer-only cache                                    | `packages/core/test/cache.test.ts` and evaluator validation                                         | Evaluator: same namespace hits; provider/endpoint/model/protocol differences miss; invalid/missing answers never cache as negative evidence |
| Private atomic auth, cancellation and key validation           | `apps/cli/test/auth.test.ts`, `apps/cli/test/process.test.ts`                                       | Auth: new/legacy records, replacement and failure paths; assert old bytes survive cancellation                                              |
| Installed runtime, ignores, signals, pipe closure, stdout-only | `test/installed.test.mjs`, `scripts/test-native.mjs`                                                | Installed CLI: actual packed CLI with controlled HTTP; all new provider cases selected by native gate                                       |
| Frozen research skill policy and installation                  | `test/reference/skill.test.ts`, release/skill tests                                                 | Auth: only setup/auth guidance changes, research body preserved                                                                             |
| Raw eval observations and honest missing billing               | `evals/implementation/swebench/test_installed.py`                                                   | Harness: offline broker/receipt fixtures, frozen baselines/studies unchanged                                                                |

## Permitted differences

Assert native request destination, method, bearer auth, content type, model and
full body independently **before** normalizing. The new SDK wire body contains
`model`, `state`, and `questions`, with `noul` question types. The old reference
body contains state/questions with boolean types and empty `providerOptions`;
model identity is in Gateway headers. Accept only these documented transport
changes and SDK-specific transport headers. Native noul answers must map to the
same associated boolean probabilities. Unknown body/question fields must cause a
fixture failure, not be silently dropped by a permissive normalizer.

Production replay may reconstruct the old envelope for comparison after strict
validation. Preserve state values and object/array ordering rather than sorting
their contents or stringifying structured state. The existing corpus sorts whole
request strings to ignore independent HTTP arrival order; it does not prove a
global dispatch chronology. Retain separate deterministic decision/order tests.

Auth/help/doctor text intentionally changes for provider setup. Successful search
stdout under identical responses does not. Legacy credentials are read without
mutation. Cache namespace intentionally changes; no old-wire answer reuse or
cache migration is required. Live model outputs may vary and are not replaced by
deterministic fixture claims.
