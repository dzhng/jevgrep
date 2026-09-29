# Cloudflare provider verification

Re-ported onto upstream's custom-endpoint seams after merging upstream main (0.6.0
and later). 2026-09-29, macOS arm64, the pinned bun 1.3.14 and Docker for
the suite. No npm release or paid benchmark was run.

| Gate                           | Result                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run check-types`, `lint`  | Exit 0 (one upstream warning in `packages/core/src/filesystem.ts`)                                                                    |
| `bun run test` (Docker)        | Exit 0: 125 core/CLI, 18 provider protocol, 39 parser, 4 release, 30 maintained harness                                               |
| `bun run test:installed`       | Exit 0: 42/42, including the `cloudflare` saved-provider journey and the invalid Cloudflare records                                   |
| Installed journey `cloudflare` | Pass: auth with `--base-url`, doctor, cold and warm search, replacement by Vercel, unauthorized doctor                                |
| Evaluator mutation checks      | Sending the token as `Authorization`, dropping `redirect: "error"`, or accepting any envelope state each fails its own evaluator test |

`oxfmt --check .` reports only upstream files outside this change.

Live checks used the built development CLI with an isolated `XDG_CONFIG_HOME` and a
token scoped to Account > AI Gateway Run only, against a gateway custom domain:

| Check                                                               | Result                                                                     |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `jg auth --provider cloudflare --base-url <custom domain>/ --stdin` | Saved `{provider, baseURL, apiKey}` with the trailing slash removed        |
| `jg doctor`                                                         | `Jev connection verified through Cloudflare AI Gateway (<custom domain>).` |
| Search over `packages/core/src` for where the gateway header is set | Exit 0 in 2s; `evaluator.ts` first with `cloudflareTransport`'s source     |

The first implementation (before the merge) was also verified live against
`https://gateway.ai.cloudflare.com/v1/ACCOUNT/GATEWAY` and with an invalid token
(exit 1, connection check failed). A live check proves the route and
authentication, not probability equality with other providers, solve quality or
cost.
