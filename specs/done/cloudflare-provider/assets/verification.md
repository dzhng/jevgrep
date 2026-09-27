# Cloudflare provider verification

2026-09-27, macOS arm64, Node v26.9.0, bun 1.4.2. No npm release or paid benchmark was
run. The reference manifest, covered files, corpus and frozen research skill are
unchanged.

| Gate                                | Result                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun run verify`                    | Exit 0: types, lint, 132 core/CLI/reference, 18 Node protocol, 23 parser, 4 release, 27 maintained harness and 33 installed Docker tests                                                                           |
| `bun run format:check`              | Exit 0                                                                                                                                                                                                             |
| After the Completed-envelope change | `bun run test` exit 0 (133 core/CLI/reference, 18 protocol, 23 parser, 4 release, 27 harness); installed cloudflare, saved-credential, invalid-record, legacy and authentication cases 11/11; live doctor verified |
| Installed journey `cloudflare`      | Pass: auth with `--gateway-url`, doctor, cold and warm search, replacement by Vercel, unauthorized doctor without retry                                                                                            |
| Provider replay `cloudflare`        | Pass: frozen request multiset and complete stdout; missing and invalid answers stay incomplete                                                                                                                     |
| Evaluator mutation checks           | Removing the envelope unwrap or `redirect: "error"` fails the matching evaluator test; accepting a `Queued` envelope failed the Completed-only test before it was enforced                                         |

Live checks used the development CLI with an isolated `XDG_CONFIG_HOME` and a token
scoped to Account > AI Gateway Run only:

| Check                                                                              | Result                                                          |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `jg auth --provider cloudflare --gateway-url <custom domain> --stdin`, `jg doctor` | Saved; `Jev connection verified through Cloudflare AI Gateway.` |
| Same with `https://gateway.ai.cloudflare.com/v1/ACCOUNT/GATEWAY`                   | Saved; doctor verified                                          |
| Doctor with an invalid token                                                       | Exit 1, connection check failed message                         |
| Search over `apps` for the gateway URL auth flow                                   | Exit 0 in 5.6s; `cli/src/auth.ts` first with its declarations   |

A live check proves the route and authentication, not probability equality with
other providers, solve quality or cost.
