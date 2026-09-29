import { useCurrentFrame } from 'remotion';
import { FPS, PRE } from './timeline.ts';

export const C = {
  paper: '#f5f1e7',
  paper2: '#ebe5d5',
  slip: '#fcf9f2',
  edge: '#d8d0bd',
  ink: '#15181b',
  ink2: '#2a2f33',
  grey: '#8b877c',
  red: '#ef5638',
  redDeep: '#c93a20',
  redSoft: '#f7a08f',
};
export const SERIF = 'Fraunces, Georgia, serif';
export const MONO = 'PlexMono, ui-monospace, Menlo, monospace';

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const inOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const outCubic = (x: number) => 1 - Math.pow(1 - x, 3);
export const outQuart = (x: number) => 1 - Math.pow(1 - x, 4);
export const outExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const inCubic = (x: number) => x * x * x;
export const inExpo = (x: number) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10));
export const inOutExpo = (x: number) =>
  x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2;
export const outBack = (x: number, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
export const outElastic = (x: number) =>
  x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
export const outBounce = (x: number) => {
  const n = 7.5625,
    d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
  return n * (x -= 2.625 / d) * x + 0.984375;
};

/** Main time in seconds; holds the opening frame through the pre-roll. */
export function useT() {
  const f = useCurrentFrame();
  return Math.max(0, f / FPS - PRE);
}

/** Envelope: 1 at the most recent event <= t, decaying exponentially. */
export function pulse(t: number, times: number[], decay = 0.12) {
  let last = -1e9;
  for (const x of times) if (x <= t && x > last) last = x;
  return Math.exp(-(t - last) / decay);
}
export const pulseAt = (t: number, at: number, decay = 0.12) => (t < at ? 0 : Math.exp(-(t - at) / decay));

/** Damped shake offset. */
export function shake(t: number, at: number, amp: number, decay = 0.18, freq = 38) {
  if (t < at) return { x: 0, y: 0, r: 0 };
  const e = Math.exp(-(t - at) / decay);
  return {
    x: Math.sin((t - at) * freq) * amp * e,
    y: Math.cos((t - at) * freq * 1.3) * amp * 0.8 * e,
    r: Math.sin((t - at) * freq * 0.7) * amp * 0.02 * e,
  };
}

export type Cam = { x: number; y: number; z: number; r?: number };
/** world -> screen */
export const w2s = (c: Cam, x: number, y: number, W = 1920, H = 1080) => [
  W / 2 + (x - c.x) * c.z,
  H / 2 + (y - c.y) * c.z,
];
export const camCss = (c: Cam, W = 1920, H = 1080) =>
  `translate(${W / 2}px, ${H / 2}px) rotate(${c.r ?? 0}deg) scale(${c.z}) translate(${-c.x}px, ${-c.y}px)`;
export const ms = (a: number, b: number, t: number) => Math.exp(lerp(Math.log(a), Math.log(b), t));
