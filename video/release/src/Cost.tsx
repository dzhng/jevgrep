import React, { useLayoutEffect, useRef } from 'react';
import { C, MONO, SERIF, clamp, inCubic, lerp, outBack, outCubic, outExpo, prog, pulseAt } from './lib.ts';
import { COST, H, W, mulberry32 } from './timeline.ts';
import { Header } from './hud.tsx';

const COIN_W = 264;
const COIN_E = 62; // ellipse height
const COIN_T = 8.6;
const BASE_Y = 930;
const rngs = mulberry32(77);
const DEBRIS = Array.from({ length: COST.total }, () => ({
  vx: (rngs() - 0.85) * 1900,
  vy: -700 - rngs() * 1100,
  spin: (rngs() - 0.5) * 22,
  ph: rngs() * 6,
}));

const landTime = (i: number) => COST.start + 0.05 + Math.floor(i / COST.perStep) * COST.dropStep + (i % COST.perStep) * 0.006;
const towerX = (t: number) => lerp(W / 2, 520, outCubic(prog(t, 13.6, 14.2)));

function coin(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number, red: number, rot = 0, glow = 0) {
  // y = top-face centre. tilt: 1 = flat (tower coin), <1 tumbling
  const rx = COIN_W / 2;
  const ry = (COIN_E / 2) * tilt + 0.001;
  const th = COIN_T * (tilt > 0.9 ? 1 : 1 + (1 - tilt) * 1.4);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const side = ctx.createLinearGradient(-rx, 0, rx, 0);
  if (red > 0.5) {
    side.addColorStop(0, '#a82c16');
    side.addColorStop(0.35, '#ef5638');
    side.addColorStop(1, '#8e2410');
  } else {
    side.addColorStop(0, '#77736a');
    side.addColorStop(0.35, '#c4bfb0');
    side.addColorStop(1, '#69655c');
  }
  ctx.fillStyle = side;
  ctx.fillRect(-rx, 0, rx * 2, th);
  ctx.beginPath();
  ctx.ellipse(0, th, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // top face
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = red > 0.5 ? '#f58a72' : '#dcd7c8';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = red > 0.5 ? '#c93a20' : '#a39e8f';
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.72, ry * 0.72, 0, 0, Math.PI * 2);
  ctx.strokeStyle = red > 0.5 ? 'rgba(160,40,20,0.5)' : 'rgba(120,115,100,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (glow > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.7 * glow})`;
    ctx.beginPath();
    ctx.ellipse(-rx * 0.3, -ry * 0.2, rx * 0.35, ry * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paint(ctx: CanvasRenderingContext2D, t: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const cx = towerX(t);
  // contact shadow on the floor
  const tower = COST.total;
  const sh = ctx.createRadialGradient(cx, BASE_Y + 36, 10, cx, BASE_Y + 36, 260);
  sh.addColorStop(0, 'rgba(60,40,10,0.38)');
  sh.addColorStop(1, 'rgba(60,40,10,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(cx - 300, BASE_Y - 60, 600, 200);

  const cut = t >= COST.cut;
  if (cut) {
    const gp = clamp((t - COST.cut) * 6);
    ctx.globalAlpha = 0.16 * gp;
    for (let i = COST.kept; i < tower; i++) coin(ctx, cx + Math.sin(i * 1.7) * 3.5 + Math.sin(i * 0.31) * 6, BASE_Y - i * COIN_T, 1, 0);
    ctx.globalAlpha = 1;
  }
  const bounce = pulseAt(t, COST.cut, 0.09) * -14;
  for (let i = 0; i < tower; i++) {
    const land = landTime(i);
    const p = (t - (land - 0.34)) / 0.34;
    if (p < 0) continue;
    const yFinal = BASE_Y - i * COIN_T;
    const jx = Math.sin(i * 1.7) * 3.5 + Math.sin(i * 0.31) * 6;
    if (i >= COST.kept && cut) {
      const tau = t - COST.cut - (i - COST.kept) * 0.004;
      if (tau > 0) {
        const D = DEBRIS[i];
        const x = cx + jx + D.vx * tau;
        const y = yFinal + D.vy * tau + 2700 * tau * tau;
        if (y > H + 200 || x < -300 || x > W + 300) continue;
        const tilt = Math.cos(D.ph + D.spin * tau);
        const blur = i % 7 === 0;
        if (blur) ctx.filter = 'blur(5px)';
        coin(ctx, x, y, 0.15 + Math.abs(tilt) * 0.85, 0, D.spin * tau * 0.15);
        if (blur) ctx.filter = 'none';
        continue;
      }
    }
    let y = yFinal;
    if (p < 1) y = lerp(-320 - (i % COST.perStep) * 110, yFinal, inCubic(p));
    else {
      // landing squash / tower wobble from the last group's impact
      const q = t - land;
      y += Math.sin(q * 46) * 3 * Math.exp(-q / 0.08);
    }
    if (cut && i < COST.kept) y += bounce * (0.4 + 0.6 * (i / COST.kept));
    const redP = cut ? clamp((t - COST.cut - (COST.kept - 1 - i) * 0.007) * 30) : 0;
    const glint = i >= COST.kept ? 0 : pulseAt(t, COST.cut + (COST.kept - 1 - i) * 0.007, 0.08);
    coin(ctx, cx + jx, y, 1, redP, 0, Math.max(glint, p >= 1 && p < 1.3 ? 0.6 * (1.3 - p) / 0.3 : 0));
  }
}

const Dot: React.FC<{ on: boolean; t: number; at: number }> = ({ on, t, at }) => {
  const s = outBack(prog(t, at, at + 0.14), 3);
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        transform: `scale(${s})`,
        background: on ? C.red : 'transparent',
        border: on ? 'none' : `4px solid ${C.grey}`,
        boxSizing: 'border-box',
      }}
    />
  );
};

export const Cost: React.FC<{ t: number }> = ({ t }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    paint(ref.current!.getContext('2d')!, t);
  });
  const numIn = t >= COST.cut ? outExpo(prog(t, COST.cut, COST.cut + 0.22)) : 0;
  const numScale = lerp(2.2, 1, numIn);
  const kept = t >= COST.cut;
  const count = 59;
  const label = kept ? '0.5' : '0.4.3';
  const tx = towerX(t);
  const dotsAt = 14.35;
  const mkRow = (row: number) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
      <div style={{ width: 140, fontFamily: MONO, fontWeight: 600, fontSize: 30, color: C.ink, letterSpacing: 3 }}>{row === 0 ? '0.4.3' : '0.5'}</div>
      <div style={{ display: 'flex', gap: 14 }}>
        {Array.from({ length: 10 }, (_, i) => (
          <Dot key={i} on={i < 8} t={t} at={dotsAt + row * 0.5 + i * 0.045} />
        ))}
      </div>
    </div>
  );
  const camRot = Math.sin((t - 12) * 0.5) * 0.5;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: C.paper }}>
      <div style={{ position: 'absolute', inset: 0, transform: `rotate(${camRot}deg) scale(${1 + 0.03 * pulseAt(t, COST.cut, 0.15)})` }}>
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, #f8f4ea 0%, #f1ebdb 82%, #ddd4bd ${100 * (BASE_Y + 40) / H + 2}%, #d3c9b1 100%)` }} />
        <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', inset: 0 }} />
        <div
          style={{
            position: 'absolute',
            left: tx - 120,
            top: BASE_Y + 62,
            width: 240,
            textAlign: 'center',
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: kept ? 64 : 40,
            letterSpacing: 4,
            color: C.ink,
            transform: `scale(${1 + 0.35 * pulseAt(t, COST.cut, 0.12)})`,
          }}
        >
          {label}
        </div>
        {kept && (
          <div style={{ position: 'absolute', left: 860, top: 140, transformOrigin: '0 100%', transform: `scale(${numScale})`, opacity: clamp(numIn * 3) }}>
            <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 520, lineHeight: '460px', letterSpacing: -14, color: C.ink, display: 'flex', alignItems: 'flex-start', fontVariationSettings: '"opsz" 144, "SOFT" 30' }}>
              <span>{count}</span>
              <span style={{ color: C.red, fontSize: 380, marginTop: 30, marginLeft: 8 }}>%</span>
            </div>
            <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 60, letterSpacing: 8, color: C.ink, marginTop: 34 }}>
              LESS <span style={{ color: C.red }}>JEV API</span> COST
            </div>
          </div>
        )}
        {t > dotsAt - 0.05 && (
          <div style={{ position: 'absolute', left: 860, top: 800, display: 'flex', flexDirection: 'column', gap: 22 }}>
            {mkRow(0)}
            {mkRow(1)}
          </div>
        )}
      </div>
      <Header
        t={t}
        items={[
          { text: 'JEV API COST', from: 12.1, to: 14.3 },
          { text: 'SAME TASKS SOLVED', from: 14.3, to: 16.3 },
        ]}
      />
    </div>
  );
};
