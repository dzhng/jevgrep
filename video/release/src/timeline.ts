// Single timing source. Scenes and score.mjs both import this file (times are in
// "main time": seconds after the 0.3s thumbnail pre-roll).
export const FPS = 60;
export const W = 1920;
export const H = 1080;
export const PRE = 0.3;
export const DUR = 22;
export const BPM = 120;
export const BEAT = 60 / BPM;
export const TOTAL_FRAMES = Math.round((PRE + DUR) * FPS);

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SCENES = {
  mountain: [0, 6],
  assay: [6, 12],
  cost: [12, 16],
  install: [16, 22],
} as const;

// ---- Mountain: core-drill previews ------------------------------------------
export const GRID = { colW: 110, rowH: 140, top: -2600, rows: 29 };
export const slipX = (row: number, col: number) => col * GRID.colW + (row % 2) * 55;
export const slipY = (row: number) => GRID.top + row * GRID.rowH;

export const DRILL = {
  t0: 2.75,
  dt: 0.25,
  steps: 12,
  drills: 5,
  rows: [13, 14, 15],
  colStart: -10,
};
export type Stab = { t: number; d: number; step: number; row: number; col: number; ore: boolean };
export const STABS: Stab[] = (() => {
  const rng = mulberry32(11);
  const list: Stab[] = [];
  for (let k = 0; k < DRILL.steps; k++)
    for (let d = 0; d < DRILL.drills; d++)
      list.push({
        t: DRILL.t0 + k * DRILL.dt,
        d,
        step: k,
        row: DRILL.rows[Math.floor(k / 4)],
        col: DRILL.colStart + d * 4 + (k % 4),
        ore: false,
      });
  const order = list.map((_, i) => i).sort(() => rng() - 0.5);
  // ore: 12 of 60, at most 2 per step so the rhythm stays even
  const perStep = new Array(DRILL.steps).fill(0);
  let n = 0;
  for (const i of order) {
    if (n >= 12) break;
    if (perStep[list[i].step] >= 2) continue;
    list[i].ore = true;
    perStep[list[i].step]++;
    n++;
  }
  return list;
})();

// ---- Assay: one brief, one batch -------------------------------------------
export const ASSAY = {
  tiles: 12,
  slideIn: 6.0, // tiles arrive on the belt
  tagPop: 6.4, // 12 tags, one every 0.04s
  peel: 7.0, // tags leave their tiles
  fuse: 7.5, // tags become one brief
  slam: 8.0, // stamp hits the batch
  verdict: 8.0, // wave of verdicts, 0.05s apart
  cards: 10.0, // verified tiles unfold into source cards
  keepers: [0, 2, 3, 5, 6, 8, 9, 11], // tiles the stamp passes
};
export const TAG_POPS = Array.from({ length: ASSAY.tiles }, (_, i) => ASSAY.tagPop + i * 0.04);
export const VERDICTS = Array.from({ length: ASSAY.tiles }, (_, i) => ({
  t: ASSAY.verdict + 0.03 + i * 0.05,
  pass: ASSAY.keepers.includes(i),
}));

// ---- Cost: the tower -------------------------------------------------------
export const COST = {
  start: 12.0,
  dropStep: 0.125, // 9 coins per 16th note
  perStep: 9,
  cut: 13.5,
  total: 100,
  kept: 41,
};
export const COIN_DROPS = Array.from({ length: 12 }, (_, k) => COST.start + 0.05 + k * COST.dropStep);

// ---- Install ---------------------------------------------------------------
export const INSTALL = {
  iris: 15.65, // dark terminal grows out of the tower
  lines: [
    { text: 'npm install -g @dzhng/jevgrep', t: 16.4, cps: 42 },
    { text: 'jg auth', t: 17.3, cps: 30 },
    { text: 'jg skill', t: 17.75, cps: 30 },
    { text: 'jg "How are telemetry events recorded and sent?" .', t: 18.2, cps: 48 },
  ],
  fold: 19.5, // terminal folds into the jg chip
  wordmark: 20.0,
  dotLand: 20.5,
};
export const KEYS: number[] = INSTALL.lines.flatMap(l =>
  Array.from({ length: l.text.length }, (_, i) => l.t + (i + 1) / l.cps),
);
export const lineEnd = (i: number) => INSTALL.lines[i].t + INSTALL.lines[i].text.length / INSTALL.lines[i].cps;

// ---- Music schedule --------------------------------------------------------
const range = (a: number, b: number, s: number) => {
  const out: number[] = [];
  for (let t = a; t < b - 1e-6; t += s) out.push(+t.toFixed(4));
  return out;
};
export const KICKS = [...range(2.0, 16.0, BEAT), 16.0, 17.0, 18.0, 19.0];
export const SNARES = range(4.5, 16.0, 1.0); // beats 2 and 4
export const HATS = [...range(2.0, 12.0, 0.25), ...range(12.0, 16.0, 0.125)];
export const IMPACTS: { t: number; size: number }[] = [
  { t: 2.0, size: 1 },
  { t: 6.0, size: 0.5 },
  { t: 8.0, size: 1 },
  { t: 10.0, size: 0.7 },
  { t: 12.0, size: 0.5 },
  { t: 13.5, size: 1 },
  { t: 16.0, size: 0.7 },
  { t: 20.0, size: 1.1 },
  { t: 20.75, size: 0.8 },
];
export const RISERS: [number, number][] = [
  [0.8, 2.0],
  [7.0, 8.0],
  [9.0, 10.0],
  [11.0, 12.0],
  [12.75, 13.5],
  [19.0, 20.0],
];
export const WHIPS = [5.85, 11.85];
// chord per 2s bar: root Hz + triad
const A = 220;
export const CHORDS = [
  [A, 1.2, 1.5],
  [A, 1.2, 1.5],
  [A * 0.794, 1.25, 1.5],
  [A * 1.189, 1.25, 1.5],
  [A * 0.891, 1.25, 1.5],
  [A, 1.2, 1.5],
  [A * 0.794, 1.25, 1.5],
  [A * 1.189, 1.25, 1.5],
  [A * 0.891, 1.25, 1.5],
  [A, 1.2, 1.5],
  [A, 1.2, 1.5],
];

// ---- Review times ----------------------------------------------------------
export const REVIEW = [0.2, 1.7, 2.1, 2.8, 3.6, 4.6, 5.5, 6.6, 7.3, 7.9, 8.2, 8.9, 10.4, 11.4, 12.6, 13.4, 13.7, 14.8, 15.85, 16.8, 18.0, 19.3, 20.2, 21.5];
export const IMPACT_REVIEW = IMPACTS.map(i => i.t);
