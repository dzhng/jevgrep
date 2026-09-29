import React, { useLayoutEffect, useRef } from 'react';
import { C, MONO, SERIF, Cam, camCss, clamp, inCubic, inOut, inOutExpo, lerp, ms, outBack, outCubic, prog, pulse } from './lib.ts';
import { DRILL, GRID, H, STABS, Stab, W, mulberry32, slipX, slipY } from './timeline.ts';
import { Counter, Header } from './hud.tsx';
import { Wordmark } from './Wordmark.tsx';

// ---------------------------------------------------------------- the mountain
type Slip = { row: number; col: number; x: number; y: number; h: number; rot: number };
const SLIPS: Slip[] = [];
const halfWidth = (row: number) =>
  200 + row * 150 + Math.sin(row * 1.7) * 150 + Math.sin(row * 0.63 + 1) * 260 + (row > 20 ? (row - 20) * 40 : 0);
{
  const rng = mulberry32(5);
  for (let row = 0; row < GRID.rows; row++)
    for (let col = -60; col <= 60; col++) {
      const x = slipX(row, col);
      if (Math.abs(x) <= halfWidth(row) + (rng() - 0.5) * 420)
        SLIPS.push({ row, col, x: x + (rng() - 0.5) * 14, y: slipY(row) + (rng() - 0.5) * 14, h: rng(), rot: (rng() - 0.5) * 0.09 });
    }
}
const SLIP_W = 84;
const SLIP_H = 112;
const key = (row: number, col: number) => row * 1000 + col + 500;
const STAB_BY_SLIP = new Map<number, Stab>(STABS.map(s => [key(s.row, s.col), s]));
const ORE = STABS.filter(s => s.ore).sort((a, b) => a.t - b.t || a.d - b.d);
const oreIndex = new Map<Stab, number>(ORE.map((s, i) => [s, i]));
const CARD_Y = 190;

const OPEN_DELAY = 0.28;
const LEAVE_T = 5.3;

export function mountainCam(t: number): Cam {
  // 0-1.35 slow push on the terminal, then a speed-ramped pull-back that lands on the beat
  if (t < 1.35) return { x: 0, y: 0, z: 1 + 0.05 * (t / 1.35) };
  if (t < 2.0) {
    const p = Math.pow(prog(t, 1.35, 2.0), 2.3);
    return { x: 0, y: lerp(0, -700, p), z: ms(1.05, 0.23, p) };
  }
  if (t < 2.3) return { x: 0, y: -700, z: 0.23 + (t - 2.0) * 0.03 };
  if (t < 3.1) {
    const p = inOutExpo(prog(t, 2.3, 3.1));
    return { x: lerp(0, -60, p), y: lerp(-700, -660, p), z: ms(0.236, 0.72, p), r: 0 };
  }
  if (t < LEAVE_T) {
    const p = prog(t, 3.1, LEAVE_T);
    return { x: lerp(-60, 30, p), y: lerp(-660, -540, p), z: lerp(0.72, 0.8, p), r: lerp(0, -0.8, p) };
  }
  const p = inOut(prog(t, LEAVE_T, 6.1));
  return { x: lerp(30, 1000, p), y: lerp(-540, -720, p), z: lerp(0.8, 0.6, p), r: lerp(-0.8, -1.5, p) };
}

// ---------------------------------------------------------------- drawing helpers
function setCam(ctx: CanvasRenderingContext2D, c: Cam) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(W / 2, H / 2);
  ctx.rotate(((c.r ?? 0) * Math.PI) / 180);
  ctx.scale(c.z, c.z);
  ctx.translate(-c.x, -c.y);
}
const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};
const mix = (a: [number, number, number], b: [number, number, number], t: number) =>
  `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
const SLIP_LIT: [number, number, number] = [253, 250, 243];
const SLIP_DIM: [number, number, number] = [214, 205, 186];

export function drawSlipFace(ctx: CanvasRenderingContext2D, w: number, h: number, opts: { detail: boolean; ore?: boolean; open?: number; hash?: number; fill?: string }) {
  const { detail, ore, open = 0, hash = 0.5 } = opts;
  rr(ctx, -w / 2, -h / 2, w, h, 6);
  ctx.fillStyle = opts.fill ?? C.slip;
  ctx.fill();
  ctx.lineWidth = ore ? 5 : 1.5;
  ctx.strokeStyle = ore ? C.red : 'rgba(120,105,80,0.28)';
  ctx.stroke();
  if (!detail) return;
  // folded corner
  ctx.beginPath();
  ctx.moveTo(w / 2 - 20, -h / 2);
  ctx.lineTo(w / 2, -h / 2 + 20);
  ctx.lineTo(w / 2 - 20, -h / 2 + 20);
  ctx.closePath();
  ctx.fillStyle = 'rgba(150,135,105,0.28)';
  ctx.fill();
  // text lines
  const n = open > 0 ? 7 : 4;
  for (let i = 0; i < n; i++) {
    const ly = -h / 2 + 26 + i * (open > 0 ? 24 : 17);
    const lw = (w - 30) * (0.45 + ((hash * 7 + i * 0.37) % 0.5));
    const hot = open > 0 && i === 3;
    ctx.fillStyle = hot ? C.red : i === 0 ? 'rgba(21,24,27,0.75)' : 'rgba(120,115,105,0.42)';
    rr(ctx, -w / 2 + 15 + (open > 0 && i > 0 && i < 6 && i % 2 === 0 ? 14 : 0), ly, lw * (hot ? 1 : 0.9), open > 0 ? 9 : 6, 3);
    ctx.fill();
  }
}

function ridge(ctx: CanvasRenderingContext2D, seed: number, base: number, amp: number, color: string, freq: number) {
  const rng = mulberry32(seed);
  const pts: [number, number][] = [];
  let y = 0;
  for (let x = -12000; x <= 12000; x += 500) {
    y = lerp(y, (rng() - 0.5) * 2, 0.5);
    pts.push([x, base - amp * (0.5 + 0.5 * Math.sin(x * freq + seed)) - amp * 0.5 * y]);
  }
  ctx.beginPath();
  ctx.moveTo(-12000, 4000);
  for (const [x, yy] of pts) ctx.lineTo(x, yy);
  ctx.lineTo(12000, 4000);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// ---------------------------------------------------------------- frame painter
function paint(ctx: CanvasRenderingContext2D, t: number) {
  const cam = mountainCam(t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f8f4ea');
  g.addColorStop(1, '#e9e2cf');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // far ridges (parallax) — paper layers with warm mist between them
  const layers = [
    { seed: 3, base: 300, amp: 2200, col: '#ede6d4', par: 0.3, zk: 0.55, freq: 0.0005 },
    { seed: 8, base: 900, amp: 1900, col: '#e6ddc7', par: 0.45, zk: 0.7, freq: 0.0007 },
  ];
  for (const L of layers) {
    setCam(ctx, { x: cam.x * L.par, y: cam.y * L.par + 300, z: cam.z * L.zk + 0.05, r: cam.r });
    ridge(ctx, L.seed, L.base, L.amp, L.col, L.freq);
  }

  setCam(ctx, cam);

  // shadowed under-body so gaps read as depth
  const top = slipY(0) - 90;
  ctx.beginPath();
  ctx.moveTo(-halfWidth(0) - 70, top);
  for (let row = 0; row < GRID.rows; row++) ctx.lineTo(-halfWidth(row) - 70, slipY(row) + 80);
  for (let row = GRID.rows - 1; row >= 0; row--) ctx.lineTo(halfWidth(row) + 70, slipY(row) + 80);
  ctx.lineTo(halfWidth(0) + 70, top);
  ctx.closePath();
  ctx.shadowColor = 'rgba(70,50,20,0.35)';
  ctx.shadowBlur = 90 * cam.z + 8;
  ctx.shadowOffsetY = 40 * cam.z;
  ctx.fillStyle = '#c9bfa6';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const sw = SLIP_W * cam.z;
  const detail = sw > 30;
  const cullX = (W / 2 + 200) / cam.z;
  const cullY = (H / 2 + 260) / cam.z;
  const opens: { s: Slip; st: Stab; o: number }[] = [];

  for (const s of SLIPS) {
    if (Math.abs(s.x - cam.x) > cullX * 1.5 || Math.abs(s.y - cam.y) > cullY * 1.5) continue;
    const st = STAB_BY_SLIP.get(key(s.row, s.col));
    const light = clamp(1 - s.row / 34 + (s.h - 0.5) * 0.25);
    let fill = mix(SLIP_DIM, SLIP_LIT, light);
    let dy = 0;
    let holed = 0;
    if (st && t >= st.t) {
      if (st.ore) {
        const o = prog(t, st.t + OPEN_DELAY, st.t + OPEN_DELAY + 0.3);
        if (o > 0) {
          opens.push({ s, st, o });
          continue;
        }
      } else {
        fill = mix(SLIP_DIM, SLIP_LIT, light * 0.62);
        dy = 3 * prog(t, st.t, st.t + 0.1);
        holed = prog(t, st.t, st.t + 0.05);
      }
    }
    ctx.save();
    ctx.translate(s.x, s.y + dy);
    ctx.rotate(s.rot);
    // contact shadow
    if (!detail) {
      ctx.fillStyle = 'rgba(80,60,30,0.16)';
      ctx.fillRect(-SLIP_W / 2 + 4, -SLIP_H / 2 + 6, SLIP_W, SLIP_H);
    } else {
      ctx.shadowColor = 'rgba(80,60,30,0.28)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 6;
    }
    drawSlipFace(ctx, SLIP_W, SLIP_H, { detail, hash: s.h, fill });
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    if (holed) {
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.arc(0, -SLIP_H / 2 + 18, 9 * holed, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // opened ore slips on top, and the ones leaving toward the assay
  opens.sort((a, b) => a.s.row - b.s.row);
  for (const { s, st, o } of opens) {
    const i = oreIndex.get(st)!;
    const tl = LEAVE_T + 0.045 * i;
    const lp = prog(t, tl, tl + 0.75);
    const grow = 1 + 1.15 * outBack(o, 2.2);
    const lift = outCubic(o);
    let x = s.x;
    let y = s.y - 30 * lift;
    let rot = s.rot * 3 + (s.h - 0.5) * 0.12;
    let sc = grow;
    if (lp > 0) {
      // streak trail
      for (let k = 4; k >= 1; k--) {
        const q = prog(t - k * 0.018, tl, tl + 0.75);
        const gx = x + 5200 * inCubic(q);
        const gy = y - 420 * outCubic(q) + 180 * q * q;
        ctx.save();
        ctx.globalAlpha = 0.12 * (5 - k);
        ctx.translate(gx, gy);
        ctx.rotate(rot + q * 1.6);
        ctx.scale(sc * (1 - 0.3 * q), sc * (1 - 0.3 * q));
        drawSlipFace(ctx, SLIP_W, SLIP_H, { detail: true, ore: true, open: 1, hash: s.h });
        ctx.restore();
      }
      x += 5200 * inCubic(lp);
      y += -420 * outCubic(lp) + 180 * lp * lp;
      rot += lp * 1.6;
      sc *= 1 - 0.3 * lp;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(sc, sc);
    ctx.shadowColor = 'rgba(70,40,20,0.4)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 14;
    drawSlipFace(ctx, SLIP_W, SLIP_H, { detail: true, ore: true, open: 1, hash: s.h });
    ctx.restore();
  }

  drawRig(ctx, t, cam);
  drawChips(ctx, t);

  // foreground bokeh scraps, fast parallax, out of focus
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const rng = mulberry32(41);
  for (let i = 0; i < 26; i++) {
    const depth = 0.6 + rng() * 1.6;
    const bx = rng() * 2600 - 340 - (cam.x * depth * cam.z * 0.5) + Math.sin(t * 0.4 + i) * 30;
    const by = rng() * 1500 - 200 - cam.y * depth * cam.z * 0.4 + t * 18 * depth;
    const px = ((bx % 2600) + 2600) % 2600 - 340;
    const py = ((by % 1500) + 1500) % 1500 - 200;
    const rad = 16 + depth * 26;
    const gr = ctx.createRadialGradient(px, py, 0, px, py, rad);
    const warm = i % 5 === 0;
    gr.addColorStop(0, warm ? 'rgba(239,86,56,0.32)' : 'rgba(255,252,244,0.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
}

// rail, carriages and drill bits ------------------------------------------------
const RAIL_IN = DRILL.t0 - 0.5;
const RAIL_OUT = DRILL.t0 + DRILL.steps * DRILL.dt + 0.25;
const BIT_LEN = 380;
function stepPos(d: number, k: number) {
  const row = DRILL.rows[Math.floor(k / 4)];
  const col = DRILL.colStart + d * 4 + (k % 4);
  return { x: slipX(row, col), row };
}
function drawRig(ctx: CanvasRenderingContext2D, t: number, cam: Cam) {
  if (t < RAIL_IN || t > RAIL_OUT + 0.5) return;
  const enter = outCubic(prog(t, RAIL_IN, RAIL_IN + 0.4));
  const leave = inCubic(prog(t, RAIL_OUT, RAIL_OUT + 0.5));
  const off = -(1 - enter) * 900 - leave * 900;
  // current step index and rail row
  const hit = (k: number) => DRILL.t0 + k * DRILL.dt;
  const k = clamp(Math.floor((t - DRILL.t0 + 0.11) / DRILL.dt + 1e-6), 0, DRILL.steps - 1);
  const kPrev = Math.max(0, k - 1);
  const move = outCubic(prog(t, hit(kPrev) + 0.08, hit(k) - 0.1));
  const railRow = lerp(stepPos(0, kPrev).row, stepPos(0, k).row, move);
  const railY = slipY(railRow) - 56 - BIT_LEN + off;
  // rail beam
  const bx0 = slipX(14, -13);
  const bx1 = slipX(14, 12);
  const grad = ctx.createLinearGradient(0, railY - 26, 0, railY + 30);
  grad.addColorStop(0, '#3a4046');
  grad.addColorStop(0.5, C.ink);
  grad.addColorStop(1, '#0b0d0f');
  ctx.save();
  ctx.shadowColor = 'rgba(40,25,10,0.4)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 26;
  rr(ctx, bx0, railY - 26, bx1 - bx0, 56, 14);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = C.red;
  rr(ctx, bx0 + 30, railY - 4, bx1 - bx0 - 60, 8, 4);
  ctx.fill();

  for (let d = 0; d < DRILL.drills; d++) {
    const px = lerp(stepPos(d, kPrev).x, stepPos(d, k).x, move);
    // carriage
    rr(ctx, px - 46, railY - 40, 92, 84, 14);
    ctx.fillStyle = '#2a2f33';
    ctx.fill();
    ctx.fillStyle = C.red;
    ctx.beginPath();
    ctx.arc(px, railY - 18, 8, 0, Math.PI * 2);
    ctx.fill();
    // bit: descend to the slip, hold, retract
    const tHit = hit(k);
    const tau = t - tHit;
    let ext = 0;
    if (tau >= -0.11 && tau < 0) ext = inCubic((tau + 0.11) / 0.11);
    else if (tau >= 0 && tau < 0.05) ext = 1;
    else if (tau >= 0.05 && tau < 0.24) ext = 1 - outCubic((tau - 0.05) / 0.19);
    // idle bit hangs short; k-1 bit still retracting handled by ext continuity
    const len = 70 + (BIT_LEN - 70 + 12) * ext;
    const y0 = railY + 44;
    rr(ctx, px - 17, y0, 34, len, 8);
    const bg = ctx.createLinearGradient(px - 17, 0, px + 17, 0);
    bg.addColorStop(0, '#0e1113');
    bg.addColorStop(0.35, '#4a5259');
    bg.addColorStop(1, '#14181b');
    ctx.fillStyle = bg;
    ctx.fill();
    // vermilion cutting tip
    ctx.fillStyle = C.red;
    ctx.beginPath();
    const ty = y0 + len;
    ctx.moveTo(px - 19, ty - 34);
    ctx.lineTo(px + 19, ty - 34);
    ctx.lineTo(px + 19, ty);
    for (let z = 0; z < 4; z++) {
      ctx.lineTo(px + 19 - z * 9.5 - 4.75, ty - 10);
      ctx.lineTo(px + 19 - z * 9.5 - 9.5, ty);
    }
    ctx.closePath();
    ctx.fill();
    // impact ring + shards
    if (tau >= 0 && tau < 0.3) {
      const s = STABS.find(q => q.step === k && q.d === d)!;
      const ix = slipX(s.row, s.col);
      const iy = slipY(s.row) - SLIP_H / 2 + 14;
      const p = tau / 0.3;
      ctx.strokeStyle = `rgba(239,86,56,${0.7 * (1 - p)})`;
      ctx.lineWidth = 5 * (1 - p) + 1;
      ctx.beginPath();
      ctx.arc(ix, iy, 20 + 70 * outCubic(p), 0, Math.PI * 2);
      ctx.stroke();
      for (let q = 0; q < 6; q++) {
        const a = -Math.PI * (0.15 + 0.7 * (q / 5));
        const dist = 90 * outCubic(p);
        ctx.fillStyle = `rgba(252,249,242,${1 - p})`;
        ctx.save();
        ctx.translate(ix + Math.cos(a) * dist, iy + Math.sin(a) * dist + 80 * p * p);
        ctx.rotate(q + p * 5);
        ctx.fillRect(-6, -4, 12, 8);
        ctx.restore();
      }
    }
  }
}

// core samples popping out of the slips ---------------------------------------
function drawChips(ctx: CanvasRenderingContext2D, t: number) {
  for (const s of STABS) {
    const tau = t - s.t - 0.04;
    if (tau < 0 || tau > 0.7) continue;
    const ix = slipX(s.row, s.col);
    const iy = slipY(s.row) - SLIP_H / 2 + 14;
    const rng = mulberry32(s.step * 31 + s.d * 7 + 3);
    const vx = (rng() - 0.5) * 140;
    if (s.ore) {
      const p = outCubic(prog(tau, 0, 0.26));
      const y = iy - 150 * p;
      const fade = 1 - prog(tau, 0.26, 0.36);
      const gr = ctx.createRadialGradient(ix, y, 0, ix, y, 90);
      gr.addColorStop(0, `rgba(239,86,56,${0.75 * fade})`);
      gr.addColorStop(1, 'rgba(239,86,56,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(ix - 90, y - 90, 180, 180);
      ctx.globalAlpha = fade;
      chip(ctx, ix, y, C.red, tau * 12);
      ctx.globalAlpha = 1;
    } else {
      const y = iy - 260 * tau + 1500 * tau * tau;
      const a = 1 - prog(tau, 0.3, 0.65);
      ctx.globalAlpha = a;
      chip(ctx, ix + vx * tau, y, '#9b968a', tau * 9);
      ctx.globalAlpha = 1;
    }
  }
}
function chip(ctx: CanvasRenderingContext2D, x: number, y: number, col: string, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(rot) * 0.5);
  rr(ctx, -16, -11, 32, 22, 7);
  ctx.fillStyle = col;
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  rr(ctx, -12, -8, 24, 5, 3);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- terminal card
const PATHS = ['src/retrieve.ts', 'assets/python/preview.py', 'src/selection.ts'];
export const Terminal: React.FC<{ t: number }> = ({ t }) => {
  const caret = Math.floor(t * 2.4) % 2 === 0;
  const hot = Math.floor(prog(t, 0.25, 1.3) * 3.99);
  const mono = { fontFamily: MONO, fontSize: 36, lineHeight: '54px', whiteSpace: 'pre' as const };
  return (
    <div
      style={{
        position: 'absolute',
        left: -720,
        top: CARD_Y - 290,
        width: 1440,
        height: 580,
        borderRadius: 30,
        background: `linear-gradient(180deg, #1f2428, ${C.ink})`,
        boxShadow: '0 60px 120px rgba(50,30,10,0.45), 0 0 0 2px rgba(255,255,255,0.05) inset',
        color: C.paper,
        padding: '34px 64px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', gap: 12, marginBottom: 30 }}>
        {[C.red, '#5b6167', '#5b6167'].map((c, i) => (
          <div key={i} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />
        ))}
      </div>
      <div style={mono}>
        <span style={{ color: C.red, fontWeight: 700 }}>❯ </span>
        jg <span style={{ color: '#f4d9a8' }}>"How are previews used to decide which</span>
      </div>
      <div style={mono}>
        {'  '}
        <span style={{ color: '#f4d9a8' }}>files to open?"</span> packages/core
        <span style={{ opacity: caret ? 1 : 0, color: C.red }}> ▌</span>
      </div>
      <div style={{ ...mono, marginTop: 26, color: C.red, fontWeight: 700 }}>Jevgrep: 17 relevant files.</div>
      {PATHS.map((p, i) => (
        <div key={p} style={{ ...mono, display: 'flex', alignItems: 'center', gap: 16, color: hot === i ? C.paper : '#a9a598' }}>
          <span style={{ width: 8, height: 40, borderRadius: 4, background: hot === i ? C.red : 'transparent' }} />
          {p}
        </div>
      ))}
      <div style={{ ...mono, color: '#6d7176', paddingLeft: 24 }}>… 14 more</div>
    </div>
  );
};

// ---------------------------------------------------------------- scene
export const Mountain: React.FC<{ t: number }> = ({ t }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = ref.current!.getContext('2d')!;
    paint(ctx, t);
  });
  const cam = mountainCam(t);
  const blur = 11 * (1 - prog(t, 0.9, 1.7));
  const stabsDone = STABS.filter(s => t >= s.t).length;
  const opened = STABS.filter(s => s.ore && t >= s.t + OPEN_DELAY).length;
  const showHud = t >= 2.0;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: C.paper }}>
      <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', inset: 0, filter: blur > 0.2 ? `blur(${blur}px)` : undefined }} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0', transform: camCss(cam) }}>
        <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `scale(${1 - 0 * blur})` }}>
          <div style={{ opacity: 1 - prog(t, 2.35, 2.9) }}>
            {t < 2.95 && (
              <>
                <div style={{ position: 'absolute', left: -1000, top: -470, width: 2000, display: 'flex', justifyContent: 'center' }}>
                  <div style={{ marginRight: 260 }}>
                    <Wordmark size={250} />
                  </div>
                </div>
                <Terminal t={t} />
              </>
            )}
          </div>
        </div>
      </div>
      {showHud && (
        <Header
          t={t}
          items={[
            { text: 'YOUR REPO', from: 2.0, to: 2.9 },
            { text: 'PEEK BEFORE OPENING', from: 2.9, to: 7 },
          ]}
          right={
            t > 3 && t < 5.9 ? (
              <div style={{ display: 'flex', gap: 46, marginLeft: 0 }}>
                <Counter label="PREVIEWED" value={stabsDone} />
                <Counter label="OPENED" value={opened} />
              </div>
            ) : undefined
          }
        />
      )}
    </div>
  );
};
