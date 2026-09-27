# Cloudflare provider choices

## Sound: high confidence

### The gateway URL is saved by auth, not supplied per search

The provider-support record rules out endpoint overrides on search and doctor.
A Cloudflare gateway URL is account-specific, so some input is unavoidable. Saving
it in the one auth record keeps the rule intact: a human chooses provider, key and
gateway once, and agents search without routing decisions. An environment variable
or a search flag would reopen the precedence questions that record closed.

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
