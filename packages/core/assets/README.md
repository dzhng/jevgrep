# Parser assets

The build copies Python, Go and Rust grammar WASM from exact-version official
Tree-sitter packages into `tree-sitter/`. The generated assets and their license
notices ship in the CLI archive; searches never download a grammar. The external
`web-tree-sitter` runtime supplies its own WASM and license.

[Asset preparation](../../../scripts/parser-assets.mjs) owns the copy and license
provenance. It also prepares the canonical grammars used by release validation;
a clean validation checkout must install the locked development dependencies first.
