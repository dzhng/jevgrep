# Choosing a search scope

A repository can contain source alongside datasets, logs, recordings and generated
artifacts. Relevance scoring costs money even when the eventual answer discards
those files. Category filters narrow eligibility locally, before file contents or
filenames enter provider evaluation. They use filenames, not an AI classifier.

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
includes recognised source extensions and common build/script names; config and
docs are separate because they often provide essential evidence. Generic JSON is
data, while recognised package and compiler manifests are config. Ambiguous
extensions have a single default; these are useful heuristics, not proof of what
any file contains.

Unknown extensions and unnamed scripts stay `unknown`. Add `unknown` explicitly to
a restricted selection when completeness matters, or provide a repository mapping.
Classification does not inspect shebangs or source content, so the free preview
never needs to read source files. Directories are traversed regardless of their
names: a directory named `data` can contain relevant Python code.

## Repository overrides

An optional `.jevgrep-types.json` **in the search root** maps gitignore patterns to
categories. It is loaded only when category filtering is requested. Patterns are
relative to that root; the last matching entry wins. Mappings are not inherited
from parent directories. For example:

```json
{
  "config/**/*.json": "config",
  "fixtures/**": "data",
  "bin/*": "code"
}
```

Overrides change classification, not eligibility: mapping a private key to code
will not bypass secret checks. Empty patterns, negations, comments, invalid
categories and malformed JSON cause the filtered command to fail before any
provider request, rather than silently broaden its scope. The mapping must be a
regular, non-symlink file within the existing ignore-file size limit. Adding,
changing or removing the mapping during a search invalidates the active scope;
the search reports changed-file evidence and cannot upload further source using
the old mapping. Rerun with the new mapping to search the updated scope.

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
