# Jevgrep (`jg`)

Ask a repository question and get relevant file locations plus verbatim source
excerpts. Jevgrep helps a coding agent begin unfamiliar multi-file work with
useful context; the agent still owns implementation and verification.

Requires Node.js 22 or newer on macOS or Linux. Install and authenticate:

```sh
npm install --global @dzhng/jevgrep
jg auth
jg doctor
jg "How are telemetry events recorded and sent?" ./my-project
```

`auth` asks you to choose a provider or a custom endpoint, then saves its key in an
owner-only config file. Run `jg --help` for the supported provider names. Searches
use that provider until you run auth again.
`doctor` verifies access with synthetic input and names the selected provider or
endpoint host.
When the provider rejects the request, doctor reports the HTTP status and its
error message, when available. A working key can still lack model access or paid
credits; follow the provider’s explanation before replacing the key. Saved keys
and raw response bodies are excluded from diagnostic output. If a provider echoes
a key with inserted separators, its message is omitted.
For unattended setup, pipe the key from your secret manager to:

```sh
jg auth --provider opencode --stdin
```

Both options are required for piped setup. To send traffic through your own
TypeSafe-compatible gateway, choose “Custom endpoint” in `auth` and enter its base
URL and model ID, or pass both explicitly:

```sh
jg auth --provider custom --base-url https://gateway.example.com/typesafe/v1 --model gateway/jev-2 --stdin
```

Custom endpoints must use `https://`; `http://localhost` and `http://127.0.0.1`
are accepted for a local proxy. Auth and doctor name only the endpoint host, never
the key. The saved endpoint and model are part of the cache identity, so custom
answers stay separate from the preset providers’ answers and from other endpoints.

Credentials are saved under
`$XDG_CONFIG_HOME/jevgrep/credentials.json`, or `~/.config/jevgrep/credentials.json`.
Existing saved records without a provider still mean Vercel, without a migration.
API-key, endpoint, and model environment overrides are ignored; users who only
configured an environment key must run auth. There is no automatic fallback or
per-search provider override. Searches send eligible source to the saved service.
Run `jg files ./project` first to see how many files and bytes that root makes
eligible and how many paths each filter skips; it needs no key and sends nothing.
Evaluation answers are cached locally; `jg --help` describes cache controls.

For a slow or unstable connection, try `jg "question" ./project --concurrency 4`
(or `1` to serialize requests). The default limit is 32 across all search stages,
including retries. Waiting for a slot does not consume the request timeout, and
queued source is revalidated before upload. This controls transport pressure,
not relevance thresholds or cache identity.

An incomplete search reports one sanitized, unrecovered provider error alongside
its issue counts, distinguishing HTTP failures, timeouts, and connection failures.
A batch failure that recovers through splitting is not used as the diagnostic. The
reported concurrency limit helps tune the next run. Only validated evaluation
answers are cached: provider errors and the final search result are never stored.
Rerunning after the connection recovers retries failed work while reusing valid
answers; `--no-cache` additionally bypasses those valid cached answers.

The summary comes first, followed by file and declaration locations and selected
source. Locations are reading leads, not a checklist. Omitted excerpts are marked;
`--max-source-bytes 0` includes all selected source. An incomplete result can still
be useful. Read what it supplies, then fill specific gaps with ordinary tools.
Application output goes to stdout; `jg` does not create a report file.

## Agent skill

**Installing the CLI is only half of agent setup: install the skill too.**

Install the canonical skill into the project where your coding agent works:

```sh
jg skill
```

The installer detects your coding agents (Claude Code, Codex, OpenCode and
others) and asks where to install. `jg skill` also accepts `--agent NAME`
(repeatable), `--global`, and `--yes`; these options come from the
[skills CLI](https://github.com/vercel-labs/skills#install-a-skill), which it
delegates to, so it requires npm/npx and network access. You can run that
installer directly as well:

```sh
npx skills add dzhng/jevgrep --skill jevgrep
```

Installing the skill does not install the `jg` executable or configure its key.
The current repository skill installs a missing CLI when the agent first uses it;
0.1.0's bundled skill predates that setup step, and its `jg skill` only prints
text, so use `npx skills` directly with that version.

Search does not install skills or edit agent configuration. Only an explicit
skill installation command invokes the installer. The skill directs the agent
to read returned excerpts before further discovery, skip redundant searches when
the needed context is already known, and handle incomplete results honestly.

There is no built-in upgrade command. Use `npm install --global @dzhng/jevgrep@latest`
to upgrade the CLI, then rerun `jg skill` to update
the agent's copy too.

See the [repository](https://github.com/dzhng/jevgrep) for architecture, official
benchmark evidence and development. Jevgrep is MIT licensed.
