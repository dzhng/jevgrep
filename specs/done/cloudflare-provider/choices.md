# Cloudflare provider choices

## Sound: high confidence

### The gateway URL is saved by auth, not supplied per search

The provider-support record rules out endpoint overrides on search and doctor.
A Cloudflare gateway URL is account-specific, so some input is unavoidable. Saving
it in the one auth record keeps the rule intact: a human chooses provider, key and
gateway once, and agents search without routing decisions. An environment variable
or a search flag would reopen the precedence questions that record closed.

### Share the custom endpoint's `baseURL` field and `--base-url` flag

The custom provider already defines how a saved record names its endpoint and how
that URL is validated. A Cloudflare-only `gatewayURL` field and `--gateway-url`
flag would duplicate both. Cloudflare reuses them and differs only in having no
`model`, which its route fixes.

### A provider of its own, not a custom endpoint preset

A custom endpoint is a TypeSafe-compatible base URL plus a model. Cloudflare's route
takes a different path, auth header and envelope, so saving it as a custom record
would send requests Cloudflare rejects. It is listed after the fixed presets and
before "Custom endpoint", which stays last as the catch-all.

### Adapt the request in the evaluator's fetch hook

The alternatives were a separate evaluation model for Cloudflare or an unpublished
change to the TypeSafe SDK adapter. Adapting the one request inside the existing
fetch hook keeps a single adapter. It also keeps retries, the attempt guard and
answer validation on one path. The adaptation is limited to destination, auth
header, the `model` field and the envelope.

### `cf-aig-authorization` only, redirects refused

Both headers authenticated during research. The gateway header is the one
Cloudflare documents for gateway authentication and Unified Billing, so the token
is sent once, under that name. Refusing redirects closes the one case where fetch
forwards a custom header across origins.

## Within the specification

Loopback `http` exists only so tests and local proxies can reach a fixture. Tests
still use a canonical `https` gateway URL through the test-only preload wherever the
packed CLI is exercised.
