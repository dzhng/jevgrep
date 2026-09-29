// Synthesizes the score from src/timeline.ts — the same events the picture reads.
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  PRE, DUR, KICKS, SNARES, HATS, IMPACTS, RISERS, WHIPS, CHORDS, STABS, TAG_POPS, VERDICTS, ASSAY, COST,
  COIN_DROPS, KEYS, INSTALL, mulberry32,
} from '../src/timeline.ts';

const SR = 48000;
const LEN = Math.ceil((PRE + DUR + 0.05) * SR);
const L = new Float32Array(LEN);
const R = new Float32Array(LEN);
const RevL = new Float32Array(LEN);
const RevR = new Float32Array(LEN);
const rng = mulberry32(2024);
const at = t => Math.round((t + PRE) * SR);
const TAU = Math.PI * 2;

function add(t, len, fn, gain = 1, pan = 0, rev = 0) {
  const s0 = at(t);
  const n = Math.floor(len * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < n; i++) {
    const idx = s0 + i;
    if (idx < 0 || idx >= LEN) continue;
    const v = fn(i / SR, i);
    L[idx] += v * gl;
    R[idx] += v * gr;
    RevL[idx] += v * gl * rev;
    RevR[idx] += v * gr * rev;
  }
}
const noise = () => rng() * 2 - 1;
const sine = (f, t) => Math.sin(TAU * f * t);
const saw = (f, t) => 2 * ((f * t) % 1) - 1;
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));

// one-pole filters -------------------------------------------------------------
const lp = c => { let y = 0; return x => (y += c * (x - y)); };
const hp = c => { let y = 0; return x => { y += c * (x - y); return x - y; }; };
const coef = f => 1 - Math.exp((-TAU * f) / SR);

// ---- sidechain duck from kicks ------------------------------------------------
const duck = new Float32Array(LEN).fill(1);
for (const k of KICKS) {
  const s0 = at(k);
  for (let i = 0; i < 0.3 * SR; i++) {
    const idx = s0 + i;
    if (idx >= LEN) break;
    duck[idx] = Math.min(duck[idx], 1 - 0.7 * Math.exp(-i / (0.09 * SR)));
  }
}
const duckBus = { L: new Float32Array(LEN), R: new Float32Array(LEN) };
function addDucked(t, len, fn, gain = 1, pan = 0) {
  const s0 = at(t);
  const n = Math.floor(len * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < n; i++) {
    const idx = s0 + i;
    if (idx < 0 || idx >= LEN) continue;
    const v = fn(i / SR, i);
    duckBus.L[idx] += v * gl;
    duckBus.R[idx] += v * gr;
  }
}

// ---- instruments -----------------------------------------------------------------
const kick = (t, g = 1) =>
  add(t, 0.5, (x) =>
    Math.sin(TAU * (46 * x + 130 * 0.035 * (1 - Math.exp(-x / 0.035)))) * env(x, 0.001, 0.16) * 1.1 +
    noise() * Math.exp(-x / 0.004) * 0.25, 0.9 * g);
const snare = (t, g = 1) => {
  const f = hp(coef(1800));
  add(t, 0.4, (x) => f(noise()) * env(x, 0.001, 0.09) * 0.8 + sine(190, x) * env(x, 0.001, 0.06) * 0.5, 0.55 * g, 0, 0.35);
};
const hat = (t, g = 1, open = false) => {
  const f = hp(coef(7500));
  add(t, open ? 0.25 : 0.06, (x) => f(noise()) * env(x, 0.0005, open ? 0.07 : 0.012), 0.22 * g, (rng() - 0.5) * 0.4);
};
const bass = (t, len, freq, g = 1) => {
  const f = lp(coef(420));
  addDucked(t, len, (x) => f(saw(freq, x) * 0.7 + sine(freq / 2, x) * 0.9) * env(x, 0.006, len * 0.8) * (x > len - 0.03 ? 0 : 1), 0.5 * g);
};
const pad = (t, len, freqs, g = 1) => {
  const fl = lp(coef(1400));
  addDucked(t, len + 0.6, (x) => {
    let v = 0;
    for (const f of freqs) v += saw(f * 0.997, x) + saw(f * 1.004, x + 0.13) * 0.9;
    const a = Math.min(x / 0.5, 1) * Math.min(1, Math.max(0, (len + 0.6 - x) / 0.6));
    return fl(v / freqs.length) * a;
  }, 0.16 * g);
};
const pluck = (t, freq, g = 1, pan = 0) => {
  const f = lp(coef(3800));
  add(t, 0.5, (x) => f(saw(freq, x) * 0.5 + sine(freq * 2, x) * 0.5) * env(x, 0.002, 0.11), 0.2 * g, pan, 0.5);
};
const impact = (t, size) => {
  add(t - 0.005, 2.4, (x) => sine(38 + 30 * Math.exp(-x / 0.25), x) * env(x, 0.003, 0.7) * 1.3, 0.85 * size);
  const f = lp(coef(2500));
  add(t, 1.6, (x) => f(noise()) * env(x, 0.001, 0.35), 0.5 * size, 0, 0.7);
  add(t, 0.5, (x) => hp(coef(500))(noise()) * env(x, 0.0005, 0.03), 0.4 * size);
};
const riser = (t0, t1) => {
  const len = t1 - t0;
  let phase = 0;
  const f = (() => { let y = 0; return (x, c) => (y += c * (x - y)); })();
  add(t0, len, (x) => {
    const p = x / len;
    phase += (300 * Math.pow(6, p)) / SR;
    const n = f(noise(), coef(400 + 9000 * p * p));
    return (n * 0.9 + Math.sin(TAU * phase) * 0.15) * p * p;
  }, 0.5, 0, 0.35);
};
const whip = t => {
  const f = (() => { let y = 0; return (x, c) => (y += c * (x - y)); })();
  add(t - 0.12, 0.42, (x) => f(noise(), coef(300 + 6000 * Math.sin((Math.PI * x) / 0.42))) * Math.sin((Math.PI * x) / 0.42), 0.7, 0.3, 0.3);
};
const tick = (t, freq = 2400, g = 1) => add(t, 0.05, (x) => (hp(coef(1500))(noise()) * 0.6 + sine(freq, x) * 0.4) * env(x, 0.0004, 0.008), 0.3 * g, (rng() - 0.5) * 0.3);
const thunk = (t, g = 1) => {
  add(t, 0.3, (x) => sine(90 * Math.exp(-x * 6) + 55, x) * env(x, 0.001, 0.07) + lp(coef(2000))(noise()) * env(x, 0.0005, 0.02) * 0.6, 0.6 * g);
};
const clink = (t, g = 1) => {
  const base = 2600 + rng() * 900;
  add(t, 0.4, (x) => (sine(base, x) + sine(base * 1.51, x) * 0.6 + sine(base * 2.3, x) * 0.3) * env(x, 0.0004, 0.09), 0.15 * g, (rng() - 0.5) * 0.8, 0.4);
};
const ping = (t, freq, g = 1) => add(t, 0.8, (x) => (sine(freq, x) + sine(freq * 2.01, x) * 0.3) * env(x, 0.002, 0.25), 0.22 * g, 0, 0.6);
const stab = (t, freq, g = 1) => add(t, 0.15, (x) => saw(freq * (1 - x * 0.6), x) * env(x, 0.001, 0.03) * 0.5, 0.25 * g);

// ---- arrange ---------------------------------------------------------------------
for (const k of KICKS) kick(k, k >= 16 ? 0.9 : 1);
for (const s of SNARES) snare(s, s > 12 ? 1.1 : 0.9);
for (const h of HATS) hat(h, (Math.round(h * 4) % 2 === 1 ? 0.7 : 1) * (h >= 12 ? 0.6 : 1), Math.abs((h % 0.5) - 0.25) < 1e-6 && h < 12);
for (const i of IMPACTS) impact(i.t, i.size);
for (const [a, b] of RISERS) riser(a, b);
for (const w of WHIPS) whip(w);

// pads + bass per bar
CHORDS.forEach((c, bar) => {
  const t = bar * 2;
  if (t >= DUR) return;
  const root = c[0];
  const freqs = [root, root * c[1], root * c[2], root * 2].map(f => f * (bar < 1 ? 0.5 : 1));
  pad(t, bar >= 9 ? 3 : 2, freqs, bar < 1 ? 0.8 : 1);
  if (t >= 2 && t < 16) {
    // bass pattern: driving 8ths with a syncopated pickup, root in the low octave
    const low = root / 4;
    for (let i = 0; i < 8; i++) {
      const on = [1, 0, 1, 1, 1, 0, 1, 1][i];
      if (on) bass(t + i * 0.25 + 0.02, 0.2, i === 7 ? low * 1.5 : low, 1);
    }
  }
  if (t >= 6 && t < 16) {
    // arpeggio: 16ths climbing the triad
    const notes = [1, c[1], c[2], 2, c[1] * 2, c[2] * 2, 2, c[2]].map(m => root * m * 2);
    for (let i = 0; i < 16; i++) if (t + i * 0.125 < 16) pluck(t + i * 0.125, notes[i % 8], 0.6 + 0.4 * (i % 4 === 0), Math.sin(i) * 0.6);
  }
});
// opening: clock ticks + low heart
for (let t = 0.25; t < 2.0; t += 0.25) tick(t, 1800, 0.6);
// drill stabs land on the previews: pitch climbs; ore gets a pentatonic ping
const PENT = [0, 3, 5, 7, 10, 12, 15];
let oreN = 0;
const bySt = new Map();
for (const s of STABS) (bySt.get(s.t) ?? bySt.set(s.t, []).get(s.t)).push(s);
for (const [t, list] of bySt) {
  thunk(t, 0.4);
  stab(t, 220, 0.6);
  for (const s of list) if (s.ore) { ping(t + 0.3, 440 * Math.pow(2, PENT[oreN % PENT.length] / 12), 0.8); oreN++; }
}
// assay
TAG_POPS.forEach((t, i) => tick(t, 1500 + i * 90, 1.4));
add(ASSAY.fuse, 0.6, (x) => sine(220 * Math.pow(2, x * 0.4), x) * env(x, 0.005, 0.2), 0.3, 0, 0.5);
thunk(ASSAY.slam, 1.8);
VERDICTS.forEach((v, i) => (v.pass ? ping(v.t, 523 * Math.pow(2, PENT[i % PENT.length] / 12), 0.9) : thunk(v.t, 0.5)));
// cost: coins rain, then the cut
COIN_DROPS.forEach((t, k) => { for (let j = 0; j < 4; j++) clink(t + 0.34 + j * 0.02, 0.5 + 0.1 * k / 12); });
for (let i = 0; i < 14; i++) clink(COST.cut + 0.04 + i * 0.05, 0.9 - i * 0.04);
// install typing
KEYS.forEach((t, i) => tick(t + 0.001, 1900 + (i % 5) * 140, 0.8));
INSTALL.lines.forEach((l, i) => { if (i < 3) ping(l.t + l.text.length / l.cps + 0.02, 880 * (1 + i * 0.25), 0.7); });
// finale: sustained chord + shimmer, dot bounce
[440, 554.4, 659.3, 880, 1108].forEach((f, i) => pluck(INSTALL.dotLand - 0.5 + 0.02 * i, f, 1.4, (i - 2) * 0.3));
ping(INSTALL.dotLand, 1318, 1.2);
ping(INSTALL.dotLand + 0.22, 1760, 0.7);
pad(20, 2.4, [220, 264, 330, 440], 1.4);
thunk(INSTALL.dotLand, 0.6);
thunk(20.75, 0.6);

// ---- reverb (Schroeder) ----------------------------------------------------------
function reverb(inp) {
  const out = new Float32Array(LEN);
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map(d => ({ d, buf: new Float32Array(d), i: 0, s: 0 }));
  const aps = [225, 556, 441].map(d => ({ d, buf: new Float32Array(d), i: 0 }));
  for (let n = 0; n < LEN; n++) {
    const x = inp[n];
    let y = 0;
    for (const c of combs) {
      const r = c.buf[c.i];
      c.s = r * 0.75 + c.s * 0.25;
      c.buf[c.i] = x + c.s * 0.86;
      c.i = (c.i + 1) % c.d;
      y += r;
    }
    y /= combs.length;
    for (const a of aps) {
      const r = a.buf[a.i];
      const v = y + r * 0.5;
      a.buf[a.i] = v;
      y = r - v * 0.5;
      a.i = (a.i + 1) % a.d;
    }
    out[n] = y;
  }
  return out;
}
const rl = reverb(RevL);
const rr = reverb(RevR);

// ---- mix -------------------------------------------------------------------------
const outL = new Float32Array(LEN);
const outR = new Float32Array(LEN);
for (let n = 0; n < LEN; n++) {
  outL[n] = L[n] + rl[n] * 0.9 + duckBus.L[n] * duck[n];
  outR[n] = R[n] + rr[n] * 0.9 + duckBus.R[n] * duck[n];
}
// master: soft clip, high-pass 25Hz, fades
const fadeIn = 0.01 * SR;
const fadeOut = 0.5 * SR;
const hL = hp(coef(25));
const hR = hp(coef(25));
let peak = 0;
for (let n = 0; n < LEN; n++) {
  let a = hL(outL[n]);
  let b = hR(outR[n]);
  a = Math.tanh(a * 0.95);
  b = Math.tanh(b * 0.95);
  const f = Math.min(1, n / fadeIn) * Math.min(1, (LEN - n) / fadeOut);
  outL[n] = a * f;
  outR[n] = b * f;
  peak = Math.max(peak, Math.abs(outL[n]), Math.abs(outR[n]));
}
const norm = 0.9 / (peak || 1);
const pcm = Buffer.alloc(LEN * 4);
for (let n = 0; n < LEN; n++) {
  pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(outL[n] * norm * 32767))), n * 4);
  pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(outR[n] * norm * 32767))), n * 4 + 2);
}
const head = Buffer.alloc(44);
head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVEfmt ', 8);
head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
mkdirSync('public', { recursive: true });
writeFileSync('public/score.wav', Buffer.concat([head, pcm]));
console.log(`score.wav ${(LEN / SR).toFixed(2)}s peak ${peak.toFixed(2)}`);
