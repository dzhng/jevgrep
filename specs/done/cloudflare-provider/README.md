# Cloudflare AI Gateway provider

Jevgrep supports Cloudflare AI Gateway as a saved provider, next to the fixed
presets and the custom TypeSafe-compatible endpoint. It follows the
[saved-provider record](../provider-support/README.md) and keeps every invariant
listed there. This record covers only what Cloudflare needs beyond that.

## Why it is shaped this way

Cloudflare serves Jev (`typesafe/jev`) with Unified Billing, but only on the
gateway's Workers AI route, `<gateway>/workers-ai/run/typesafe/jev`. There is no
TypeSafe provider-native path. The probes in [research](research.md) record the
routes that fail. So Cloudflare cannot be one more fixed base URL for the same
adapter, and it cannot be a custom endpoint either: the custom provider appends
`/systemone` and sends a TypeSafe body, which this route rejects. It needs two
things the other providers do not combine:

- **An account-specific endpoint.** The gateway URL contains the account and gateway
  IDs, or it is the gateway's custom domain. `jg auth --base-url` saves it as the
  record's `baseURL`, the same field and flag the custom provider uses, with the
  token in the same single private record. Search and doctor still take no endpoint,
  provider or environment override. `endpointFor` validates it with the shared
  `validateBaseURL`, so `createEvaluator` throws for a Cloudflare provider without a
  valid URL, before any request. The CLI validates the saved record first, so users
  see the auth message instead.
- **A different wire shape for one request.** The route takes the model from its
  path, authenticates the gateway token from `cf-aig-authorization`, and wraps the
  TypeSafe answer as `{state, result}`. The evaluator adapts that single request
  inside its existing fetch hook. The SDK adapter, question mapping, answer
  validation, retries, cooldown, attempt guard and error classification stay the
  same as for the other presets.

## What must stay true

- A Cloudflare record is `{provider, baseURL, apiKey}` with no `model`; the model is
  fixed by the route. A Cloudflare record without a valid URL is invalid credentials.
  It never falls back to another provider. Other providers' records are unchanged.
- The gateway URL follows the custom endpoint's rules: `https`, with plain `http`
  only for `localhost` and `127.0.0.1`, and no query, fragment or userinfo. A
  trailing slash is normalized away because the route is appended to it, and a URL
  that already contains a `/workers-ai` or `/compat` segment is rejected rather than
  doubled.
- Auth and doctor name the provider and the gateway host, never the key or the
  account path.
- The token travels only as `cf-aig-authorization`. The request omits `Authorization`,
  and redirects are refused, because fetch would drop `Authorization` on a
  cross-origin redirect but would forward the custom header.
- Error responses pass through unchanged, so 401/403 still aborts as an
  authentication failure and 408/429/5xx keep their retry semantics. Only a success
  body of `{state: "Completed", result}` yields an answer. Any other state, a missing
  `result` or a bare unwrapped answer fails validation as an invalid answer. It is never
  treated as negative evidence.
- Answer-cache identity uses the full Workers AI endpoint and a distinct protocol tag
  (`typesafe-ai-3.0.8+workers-ai-run`). Answers from another provider or another
  gateway never certify this route.

## Pointers

The [provider owner](../../../packages/core/src/providers.ts) holds
`cloudflareProviderId`, its `endpointFor` branch and `cloudflareRunURL`. The
[evaluator](../../../packages/core/src/evaluator.ts) holds `cloudflareTransport`,
and the [auth module](../../../apps/cli/src/auth.ts) and
[argument parser](../../../apps/cli/src/args.ts) accept `--base-url` for it and
reject `--model`.

Tests route through a canonical fixture gateway,
`https://gateway.ai.cloudflare.com/v1/fixture-account/fixture-gateway`, which the
[test-only preload](../../../test/fixtures/provider-route.mjs) redirects to local
HTTP. The product has no transport override.
[Installed journeys](../../../test/installed.test.mjs) run auth, doctor, search,
cache and replacement against the packed CLI.
[Evaluator tests](../../../test/evaluator.test.ts) pin the route, headers, body,
unwrapping, non-Completed envelopes, authentication failure, refused redirects and
URL validation, [provider tests](../../../packages/core/test/providers.test.ts)
pin endpoint resolution, and
[process tests](../../../apps/cli/test/process.test.ts) cover the interactive
gateway prompt.

## Evidence and limits

[Verification](assets/verification.md) records the gates and the live checks
against a real gateway. The live checks prove transport through Cloudflare's
route. They do not establish identical probabilities to other providers, solve
quality, cost savings or latency claims.

Workers AI applies its own rate limit to `typesafe/jev`, separate from any gateway
rate limit. One live search received 42 HTTP 429 responses (`Rate limited`, no
`retry-after`) and reported incomplete discovery. Three back-to-back uncached
repeats of that search completed with no 429s. The existing shared cooldown and
bounded retries handle it; a throttled run is reported as incomplete, never as
negative evidence. [Choices](choices.md) records the
decisions the implementation made.
