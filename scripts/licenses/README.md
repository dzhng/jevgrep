# License sources omitted or abbreviated upstream

`vercel-ai.LICENSE` is the Vercel AI repository license, verified byte-for-byte at
[provider-utils 5.0.45](https://github.com/vercel/ai/blob/08ae5ad05bc12496dd1ffcf64e34419e0831300d/LICENSE)
and [provider-utils 5.0.49](https://github.com/vercel/ai/blob/ee3169b3c4880e2abe4d0d7c781243bb81822ec4/LICENSE).
Both npm packages declare Apache-2.0 but omit their license file. The notice
owner allows only these verified versions; a new version requires inspection.

`Apache-2.0.txt` contains the [Apache Software Foundation's full license terms](https://www.apache.org/licenses/LICENSE-2.0.txt).
The notice generator retains package copyright notices and includes these terms
when emitted dependencies use Apache-2.0. Builds read these retained sources;
there is no build-time or runtime license download.

## Parser grammars

The build copies license notices directly from the pinned official Tree-sitter
grammar packages. Their WASM files are shipped unmodified. The external
web-tree-sitter and TypeScript packages retain their installed license files.
