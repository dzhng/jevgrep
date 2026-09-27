# Cloudflare route evidence

Inspected 2026-09-27 against a live gateway with Unified Billing and a stored
TypeSafe BYOK key. A token scoped to Account > AI Gateway Run only was used. These are
live observations, recorded here because Cloudflare's provider list does not
document a TypeSafe route.

Cloudflare's model page documents Jev as `typesafe/jev`, with `state` and
`questions` as input and `{model, answers, usage}` as output
([Cloudflare Jev model](https://developers.cloudflare.com/ai/models/typesafe/jev/)).
The [provider-native list](https://developers.cloudflare.com/ai-gateway/usage/providers/)
has no TypeSafe entry.

| Request (POST, gateway token)                                                                              | Result                                                        |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `<gateway>/workers-ai/run/typesafe/jev`, body `{state, questions}`                                         | 200, `{"state":"Completed","result":{model, answers, usage}}` |
| Same, token as `Authorization` or as `cf-aig-authorization`                                                | Both 200                                                      |
| Same, custom domain or `gateway.ai.cloudflare.com/v1/ACCOUNT/GATEWAY`                                      | Both 200                                                      |
| Same, with `cf-aig-byok-alias: default`                                                                    | 200, `gatewayMetadata.keySource` still `Unified`              |
| `<gateway>/typesafe/v1/systemone` and `<gateway>/typesafe/systemone`                                       | 400, `2008 Invalid provider` (either header)                  |
| `typesafe-ai`, `typesafeai`, `type-safe` path slugs                                                        | 400, `2008 Invalid provider`                                  |
| `<gateway>/compat/chat/completions`, models `typesafe/jev`, `typesafe/jev-1.13.0`, `typesafe/typesafe/jev` | 400, `2008 Invalid provider`                                  |
| `<gateway>/compat/chat/completions`, model `workers-ai/typesafe/jev`                                       | `7003`: reaches Jev, rejects `messages`, requires `questions` |
| Universal endpoint, provider `typesafe`                                                                    | 400, `2008 Invalid provider`                                  |
| `<gateway>/workers-ai/typesafe/jev` (no `run`)                                                             | `7003`/`7000`: no route for that URI                          |
| `<gateway>/workers-ai/run`, model in body                                                                  | `10000 Authentication error`                                  |

The SDK adapter posts `{model, state, questions}` to `<base>/systemone` with `noul`
question types, and its response schema accepts the unwrapped `result`. The
adapter therefore keeps its question mapping and validation. Only the destination,
auth header, model field and envelope differ.
