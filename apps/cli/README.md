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

`auth` asks you to choose a provider, then saves its key in an owner-only config file.
Run `jg --help` for the supported provider names. Searches use that provider until you run auth again.
`doctor` verifies access with synthetic input and names the selected provider.
For unattended setup, pipe the key from your secret manager to:

```sh
jg auth --provider opencode --stdin
```

Both options are required for piped setup. Credentials are saved under
`$XDG_CONFIG_HOME/jevgrep/credentials.json`, or `~/.config/jevgrep/credentials.json`.
Existing saved records without a provider still mean Vercel, without a migration.
API-key, endpoint, and model environment overrides are ignored; users who only
configured an environment key must run auth. There is no automatic fallback or
per-search provider override. Searches send eligible source to the saved service.
Evaluation answers are cached locally; `jg --help` describes cache controls.

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
