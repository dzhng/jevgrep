# Cloudflare provider choices

Every decision the implementation made that the request left open. Review these
first: the shared validator's error wording and the Cloudflare timeout and pacing
defaults are the two calls a maintainer is least likely to have made the same way.

## Needs user

### The shared base URL validator now says "Provide the endpoint base URL."

- **When:** the re-port onto the custom endpoint seams.
- **The choice:** `validateBaseURL` is the one function that checks any saved
  endpoint URL. Before Cloudflare existed, only the custom provider called it, so an
  empty URL produced "Provide a base URL for the custom endpoint." Now suppose a user
  picks Cloudflare AI Gateway in `jg auth` and presses Enter at the gateway URL
  prompt without typing anything. With the old wording they would be told about a
  "custom endpoint" they never chose. The message is now neutral, so both providers
  get a sentence that is true for them. The unbuilt alternative kept upstream's
  wording and gave Cloudflare its own empty-value check before calling the
  validator, which duplicates a check the validator already makes.
- **The gap:** the custom provider's validator predates a second caller.
- **The reach:** anyone reading the custom provider's errors sees the new wording;
  no test pins either text.
- **Verdict:** needs-user, because the wording is upstream-owned. Provisional call:
  keep the neutral message. To reverse it, restore the old string and add an
  empty-value check in `cloudflareEndpoint`.
- **Confidence:** low.

### Cloudflare uses the default 15 second timeout and no token pacing

- **When:** the first implementation, kept by the re-port.
- **The choice:** the evaluator gives native TypeSafe a 60 second request timeout and
  a token-rate budget (a local limit that spaces requests so a burst does not
  exceed the provider's tokens-per-second quota). Every other provider, Cloudflare
  included, gets 15 seconds and no budget. On a large repository a Cloudflare search
  therefore sends requests as fast as the concurrency limit allows. Workers AI has
  its own rate limit for Jev: one live search received 42 HTTP 429 ("too many
  requests") replies without a `retry-after` header, backed off one second each time,
  and ended incomplete. The unbuilt alternative gave Cloudflare the TypeSafe budget
  and timeout, but Cloudflare publishes no quota to size the budget from.
- **The gap:** the request did not say how a gateway-fronted Workers AI model should
  be paced.
- **The reach:** throttled Cloudflare searches can end incomplete more often than
  direct TypeSafe ones. They never report a false "nothing found".
- **Verdict:** needs-user. Provisional call: keep the defaults and revisit with a
  measured budget if incomplete runs recur. Reversible by extending the evaluator's
  `typesafe` condition.
- **Confidence:** medium.

## Sound

### Cloudflare shares the custom endpoint's `baseURL` field and `--base-url` flag

- **When:** the re-port.
- **The choice:** a Cloudflare gateway URL looks like
  `https://gateway.ai.cloudflare.com/v1/ACCOUNT/GATEWAY` or a custom domain, and it
  is different for every account, so auth must save it. The custom provider already
  saves an endpoint URL as `baseURL`, sets it with `--base-url`, and validates it
  with `validateBaseURL`. Cloudflare reuses all three, so its saved record is
  `{provider: "cloudflare", baseURL, apiKey}`. It has no `model`, because the route
  fixes the model, and `--model` is rejected for it. The unbuilt alternative gave
  Cloudflare its own `gatewayURL` field, flag and validator, which would be a second
  owner for "the endpoint this record points at".
- **The gap:** the request did not name the record shape or flag.
- **The reach:** tooling that writes Cloudflare records, such as setup scripts, uses
  `--base-url`.
- **Verdict:** sound. One field and one validator own the saved endpoint.
- **Confidence:** medium.

### Cloudflare is listed after the fixed presets and before "Custom endpoint"

- **When:** the re-port.
- **The choice:** `jg auth` shows a menu of providers. The order is the fixed presets,
  then Cloudflare AI Gateway, then Custom endpoint, so the open-ended catch-all stays
  last. One exported list, `credentialProviders`, now owns that order. The menu,
  the `--provider` validation and the error messages all read that list instead of
  restating it. The unbuilt alternative appended Cloudflare after Custom, which would
  leave upstream's menu test untouched but bury a named provider below the
  catch-all.
- **The gap:** menu order was unspecified.
- **The reach:** adding a provider later means adding it to one list.
- **Verdict:** sound.
- **Confidence:** medium.

### A gateway URL containing a `/workers-ai` or `/compat` route is rejected

- **When:** the re-port, after review.
- **The choice:** Jevgrep appends `/workers-ai/run/typesafe/jev` to the saved gateway
  URL. A user who copies a full route from Cloudflare's dashboard, for example
  `.../GATEWAY/workers-ai/run/typesafe/jev`, would otherwise save it, and every
  request would go to `.../workers-ai/run/typesafe/jev/workers-ai/run/typesafe/jev`
  and fail at `jg doctor` with an opaque 404. Auth now refuses it and asks for the
  gateway URL itself. A trailing slash is simply removed, because it is unambiguous.
  The unbuilt alternative stripped the route silently, which guesses at what the user
  meant.
- **The gap:** URL shape was specified only as "the gateway URL".
- **The reach:** a gateway whose custom domain path legitimately contains
  `/workers-ai` or `/compat` would be refused; none is known.
- **Verdict:** sound.
- **Confidence:** medium.

### The request is adapted inside the evaluator's existing fetch hook

- **When:** the first implementation, kept by the re-port.
- **The choice:** the TypeSafe SDK builds every Jev request as
  `POST <baseURL>/systemone` with `{model, state, questions}` and a Bearer token. The
  evaluator already wraps the SDK's `fetch` to count requests and honour 429
  cooldowns. For Cloudflare, that wrapper rewrites the one request: new
  destination, token moved to another header, `model` removed, and the
  `{state, result}` reply unwrapped. The unbuilt alternatives were a second
  evaluation model for Cloudflare, or a change to the published SDK.
- **The gap:** the SDK has no Workers AI mode.
- **The reach:** question mapping, answer validation, retries and error
  classification stay on one path for every provider. An SDK change to the request
  body would reach Cloudflare through this adapter.
- **Verdict:** sound.
- **Confidence:** high.

### The token travels only as `cf-aig-authorization`, and redirects are refused

- **When:** the first implementation.
- **The choice:** research showed the gateway accepts the token either as
  `Authorization` or as `cf-aig-authorization`, the header Cloudflare documents for
  gateway authentication and Unified Billing. The token is sent once, under the
  documented name. Browsers' `fetch` strips `Authorization` when a redirect crosses
  origins, but it would forward a custom header like `cf-aig-authorization`. So if
  the gateway ever answered with a redirect to another host, the token could leak.
  The request sets `redirect: "error"`, so it fails instead.
- **The gap:** header choice and redirect policy were unspecified.
- **The reach:** a gateway that redirects cannot be used; none does today.
- **Verdict:** sound.
- **Confidence:** high.

### Only a `{state: "Completed", result}` reply yields an answer

- **When:** the first implementation.
- **The choice:** Workers AI wraps answers as `{state, result}`. If the state is
  anything but `Completed`, or `result` is missing, the adapter passes `null` on, which
  fails the SDK's answer validation. That makes it an invalid answer, which is retried
  and then reported as incomplete. It is never read as "the file is irrelevant". The
  unbuilt alternative took `result` whenever present, which could score a
  half-finished job.
- **The gap:** only the Completed shape was observed live.
- **The reach:** a future asynchronous mode would need explicit polling support.
- **Verdict:** sound.
- **Confidence:** high.

### The gateway URL is saved by auth, not supplied per search

- **When:** the first implementation.
- **The choice:** the provider-support record rules out endpoint overrides on search
  and doctor, so a human chooses provider, key and endpoint once and agents search
  without routing decisions. The Cloudflare URL is saved in the same record. An
  environment variable or a search flag would reopen the precedence questions that
  record closed.
- **The gap:** Cloudflare is the first preset-like provider with an account-specific
  URL.
- **The reach:** switching gateways means rerunning auth.
- **Verdict:** sound.
- **Confidence:** high.

### Cloudflare is a provider of its own, not a custom endpoint

- **When:** the re-port.
- **The choice:** the custom provider posts a TypeSafe body to `<baseURL>/systemone`.
  Cloudflare returns `2008 Invalid provider` for that path, so a user who configured
  Cloudflare as a custom endpoint would fail at doctor. Cloudflare therefore keeps its
  own provider id and wire adaptation.
- **The gap:** upstream added the custom provider after the first implementation.
- **The reach:** two providers share `baseURL` but differ in transport.
- **Verdict:** sound.
- **Confidence:** high.

### The answer cache needs no Cloudflare-specific identity

- **When:** the re-port.
- **The choice:** cached answers are keyed by a namespace that includes the provider
  name and the endpoint base URL. A Cloudflare answer is keyed by
  `provider: "cloudflare"` plus that account's gateway URL, so it can never satisfy
  another provider's or another gateway's lookup. An extra route or protocol tag in
  the key would add no separation.
- **The gap:** cache identity for a transport-adapted provider was unspecified.
- **The reach:** a future change to Cloudflare's wire format should bump the shared
  protocol or prompt version, as for any provider.
- **Verdict:** sound.
- **Confidence:** high.

## Trivial discretion

Two calls: auth and doctor label the provider with the gateway host, as the custom
provider does; and loopback `http` is accepted because the shared validator already
allows it for local proxies and test fixtures.
