# Choosing a search scope

A repository can contain source alongside datasets, logs, recordings and generated
artifacts. Relevance scoring costs money even when the eventual answer discards
those files. Category filters narrow eligibility locally, before file contents or
filenames enter provider evaluation. They use filenames, plus a shebang peek for
extensionless scripts; they are not an AI classifier.

Preview the intended scope without credentials or provider requests, then use the
same filters for search:

```sh
jg files . --only code,config,docs --list
jg "Where are retries implemented?" . --only code,config,docs
```

`--only` selects a union of categories; repeated flags add to that union.
`--exclude-types` subtracts categories and wins over `--only`. Without either flag,
existing eligibility is unchanged. Both compose with `--exclude`, ignore files,
and the independent hidden/dependency/sensitive-file controls. Selecting a category
does not bypass any other exclusion.

Use `jg --help` for the category names. The filename registry in
[`file-types.ts`](../packages/core/src/file-types.ts) owns their defaults. Code
includes recognised source extensions, common build/script names, and extensionless
files whose shebang names a recognised interpreter (Python, PyPy, Node, Bun, tsx
or Deno — the same detection used to parse those scripts). Config and docs are
separate because they often provide essential evidence. Generic JSON is data, while
package and compiler manifests (`package.json`, `tsconfig*.json`), `*.config.json`,
`biome.json`, and dotfile JSON (for example `.eslintrc.json`) are config. Ambiguous
extensions have a single default; these are useful heuristics, not proof of what
any file contains.

Unknown extensions stay `unknown`. An extensionless file without a recognised code
shebang is also `unknown`. Add `unknown` explicitly to a restricted selection when
completeness matters. Directories are traversed regardless of their names: a
directory named `data` can contain relevant Python code.

## What filtering can save

Text data and logs can otherwise be eligible for paid scoring. Filtering them
out removes that work. Audio, video and archives are filename categories only;
selecting them does not add transcription, decompression or binary search.
Search-time binary checks remain active, and the metadata-only preview can count
files those checks will later reject.

The preview reports eligible file counts and bytes and exclusions by category.
It is not a bill estimate: traversal choices, batching, caching, provider pricing
and retries affect actual cost. Directory navigation can still require provider
work even where files are excluded. Use the existing `--max-requests` ceiling to
bound requests separately, and avoid assuming smaller scope guarantees the same
answer. Excluded evidence is outside the search's claim.
