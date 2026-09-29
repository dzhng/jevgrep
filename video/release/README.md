# Jevgrep 0.5 release film

A 22-second, beat-driven launch film. The repo is a mountain of paper files;
`jg` core-drills previews instead of opening everything, judges a whole batch
under one shared brief, hands back verbatim source, and the Jev API cost tower
loses 59% of its coins. Ends on the install commands and the 0.5 lockup.

Standalone package (outside the CLI workspace). Node.js 24 and ffmpeg required.

```sh
npm ci
npm run music      # synthesize public/score.wav from src/timeline.ts
npm run studio
npm run draft      # half-res preview
npm run stills     # review frames, impact frames, key art, thumbnail into out/
npm run render     # master: 1080p60, H.264 CRF 14, 320k AAC -> out/jevgrep-0.5-short.mp4
npm run check-types
```

## Sound and picture share one schedule

`src/timeline.ts` owns every event time (beats, stabs, tag pops, verdicts, coin
drops, keystrokes, impacts, risers, whips). Scenes read it for motion and
`scripts/score.mjs` reads it to synthesize the music and effects, so hits land
on hits. Times are "main time"; a 0.3 s pre-roll holds the opening frame (the
social preview: wordmark, 0.5, and a finished `jg` run) and shifts picture and
sound together.

Generated audio, renders and stills are ignored. Fraunces and IBM Plex Mono are
vendored with their OFL licenses. Audio was verified by measurement (−13.7 LUFS
integrated, −0.8 dBFS peak, spectrogram impacts at cue times), not by ear.

## Claim sources (kept out of the film)

- **59% less Jev API cost** — [combined-cost research](../../evals/results/combined-cost-research-2026-09-28.md):
  estimated native Jev API cost, 0.5.0 candidate vs. the saved 0.4.3 cohort
  (59.24%, rounded). Native prices are list-price estimates with a conservative
  allowance for 19 responses with missing usage.
- **Same tasks solved (8/10 and 8/10)** — same report; the same ten tuned Python
  SWE-bench tasks. Not a speed claim and not a statistical equivalence claim.
- **Not claimed:** total coding-agent cost. The report records combined
  Sol-plus-Jev cost 2–3% higher, accepted for this release, so the film says
  "Jev API cost" only.
- **Mechanisms shown** — previews decide which files open, larger declaration
  batches, one shared question brief ([architecture](../../docs/architecture.md)).
  Drill and stamp counts are illustration, not statistics.
- **Opening terminal** — a real run, `jg "How are previews used to decide which
  files to open?" packages/core` with jg 0.5.0 on this repo: 17 relevant files;
  first three paths shown.
- **Install commands** — `npm install -g @dzhng/jevgrep`, `jg auth`, `jg skill`
  as documented in the root README.
