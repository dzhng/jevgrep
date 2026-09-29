"""Generate RESULTS.md from the final paired benchmark, not hand-edited timings."""
import json
from pathlib import Path
from statistics import median
root=Path(__file__).resolve().parent
records=[json.loads(line) for line in (root/'assets/confirmation.jsonl').read_text().splitlines()]
rows=[row for row in records if 'arm' in row]
text='''# Tree-sitter replacement results

Performance Improvement

Fixed baseline: upstream `2dc1d3c`. Five fresh processes per arm/workload,
interleaved before/after in Docker (Linux/amd64, Node 22, two CPUs, 2 GiB,
network disabled). Each process measures the first production `inspect()` call
and ten subsequent calls on new snapshots. No provider calls were made.

Cold time includes importing the source module and starting the parser worker;
it excludes container/Node process launch. Warm time is the median of ten calls,
then the median across five processes. These are local inspection measurements,
not end-to-end search latency. Output SHA-256 hashes match between arms for every
fixture. The source files contain Unicode comments and function bodies.

| Language | Declarations | Cold before → after (ms) | Cold reduction | Warm before → after (ms) | Warm change |
|---|---:|---:|---:|---:|---:|
'''
for lang in ['python','typescript']:
 for count in [100,1500]:
  arms=[[r for r in rows if r['arm']==arm and r['language']==lang and r['count']==count] for arm in ['before','after']]
  assert all(len(a)==5 for a in arms)
  assert len({r['outputHash'] for a in arms for r in a})==1
  cold=[median(r['coldTotalMs'] for r in a) for a in arms]
  warm=[median(median(r['warmMs']) for r in a) for a in arms]
  text+=f'| {lang} | {count:,} | {cold[0]:.1f} → {cold[1]:.1f} | {(1-cold[1]/cold[0])*100:.1f}% | {warm[0]:.2f} → {warm[1]:.2f} | {(warm[1]/warm[0]-1)*100:+.1f}% |\n'
text+='''
Negative warm change means faster. TypeScript is unchanged and is included as a
noise/control workload; its fluctuations are not attributed to Tree-sitter.
The supported performance claim is lower cold Python inspection latency.
Earlier cohorts included warm regressions, and the unchanged TypeScript control
also fluctuates. Treat warm differences as noisy, not a general speedup.

| Python declarations | Worker RSS before → after (MiB) |
|---|---:|
'''
for count in [100,1500]:
 rss=[median(r['workerRSSKiB']/1024 for r in rows if r['arm']==arm and r['language']=='python' and r['count']==count) for arm in ['before','after']]
 text+=f'| {count:,} | {rss[0]:.1f} → {rss[1]:.1f} |\n'
text+='''
Worker RSS is a Linux `/proc` snapshot after the repeated inspections, not peak
whole-search memory. Parent peak RSS is retained in the raw data separately.

## Language support and correctness

Python uses Tree-sitter; TypeScript/JavaScript retain their compiler parser.
Go and Rust now provide named declarations. Tests cover Go functions, receivers,
types, variables, constants and grouped specs; Rust functions, impls, traits,
modules, attributes and foreign declarations. Installed tests assert that large
Go/Rust files send named declarations in role previews and selection requests,
and return their locations. This proves structural coverage, not language-server
semantics, provider accuracy or support for every Tree-sitter grammar.

Python-specific preview, neighbourhood and inherited-call analyses remain
Python-specific. Frozen test-only Python helpers check compatible outputs.
Modern Python syntax is accepted; Tree-sitter is not a CPython semantic validator.
Bare-CR Python uses lossless text fallback; LF and CRLF structural parsing work.
Missing/corrupt packaged assets fail closed; no runtime parser downloads, Python
installation, native compiler or repository-source execution is required.

## Reproduction and evidence

Create a separate clean checkout at `2dc1d3c`, then from this branch run:

```sh
python3 test/parser/run-tree-sitter-bench.py /path/to/baseline > specs/tree-sitter/assets/confirmation.jsonl
python3 specs/tree-sitter/summarize.py
```

The runner builds both actual source images and records image identities and
candidate source hashes. Both use exactly the same benchmark script. It rejects
output mismatches and unsupported benchmark language labels.

[Final raw data](assets/confirmation.jsonl),
[initial cohort](assets/development.jsonl), and
[query-development confirmation](assets/query-confirmation.jsonl), and
[pre-review confirmation](assets/pre-review-confirmation.jsonl) retain all
recorded trials. The initial implementation improved startup but regressed warm
inspection; syntax-node filtering was revised before final confirmation.
See [review disposition](REVIEW.md) and [validation](VALIDATION.md).

These measurements precede the final Python-only scope and call-context fixes.
[Final validation](VALIDATION.md) records the integrated candidate separately.

Limits of this cohort: synthetic inspection fixtures; no paid/live-provider evaluation, macOS,
ARM, full repository search-latency benchmark, or integration with the separate
unsubmitted calibration/parsed-reuse branches. This cohort is historical evidence rather than a timing guarantee for the final merge.
'''
(root/'RESULTS.md').write_text(text)
