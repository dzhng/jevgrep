import React from 'react';
import { C, MONO, SERIF, Cam, camCss, clamp, inCubic, inExpo, inOut, lerp, outBack, outCubic, outQuart, prog, pulseAt } from './lib.ts';
import { ASSAY, H, TAG_POPS, VERDICTS, W, mulberry32 } from './timeline.ts';
import { Header } from './hud.tsx';

const BELT_Y = 330;
const TILE_W = 120;
const TILE_H = 153;
const CARD_W = 360;
const CARD_H = 460;
const FUSE = { x: 0, y: -330 };
const REST_Y = -185; // stamp plate centre when touching the batch
const STAMP_W = 900;
const STAMP_H = 220;
const tileX = (i: number) => (i - 5.5) * 168;
const crateX = (i: number) => ((i % 6) - 2.5) * 136;
const crateY = (i: number) => (i < 6 ? BELT_Y - TILE_H / 2 - 4 : BELT_Y - TILE_H / 2 - 4 - 166);
const keeperIdx = (i: number) => ASSAY.keepers.indexOf(i);
const CRATE_LEAVE = 9.35;
const CARD_X = (j: number) => (j - 3.5) * 340;
const CARD_D = (j: number) => [0.4, -0.15, 0.9, 0.1, 0.7, -0.3, 0.5, 0][j];

function cam(t: number): Cam {
  if (t < 7.4) return { x: 0, y: 20, z: lerp(0.84, 0.9, prog(t, 5.9, 7.4)) };
  if (t < 8.0) {
    const p = inOut(prog(t, 7.4, 8.0));
    return { x: 0, y: lerp(20, -60, p), z: lerp(0.9, 0.98, p) };
  }
  if (t < 10.0) {
    const settle = Math.exp(-(t - 8.0) / 0.35);
    return { x: 0, y: lerp(-60, 30, prog(t, 8.0, 10.0)), z: lerp(0.98, 1.0, prog(t, 8, 10)) + 0.06 * settle };
  }
  // card corridor: dolly along the row
  const p = inOut(prog(t, 10.0, 12.1));
  return { x: lerp(-500, 500, p), y: lerp(20, -30, p), z: lerp(0.66, 0.92, p), r: lerp(1.2, -1.2, p) };
}

// ---- card / tile: the same object at two scales ---------------------------------
const Card: React.FC<{ hash: number; hot?: boolean; edge?: boolean }> = ({ hash, hot, edge }) => {
  const rows = Array.from({ length: 10 }, (_, i) => i);
  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        borderRadius: 26,
        background: C.slip,
        boxShadow: edge
          ? `0 0 0 8px ${C.red}, 0 40px 70px rgba(70,40,20,0.35)`
          : '0 0 0 3px rgba(120,105,80,0.25), 0 24px 44px rgba(70,40,20,0.25)',
        padding: 30,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
        <div style={{ width: 16, height: 16, borderRadius: 8, background: C.red }} />
        <div style={{ height: 18, width: 150 + hash * 60, borderRadius: 9, background: C.ink }} />
      </div>
      {rows.map(i => {
        const isHot = i === 4;
        const indent = [0, 0, 28, 28, 28, 56, 28, 0, 0, 0][i];
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, height: 34 }}>
            <div style={{ width: 22, height: 8, borderRadius: 4, background: 'rgba(120,115,105,0.35)' }} />
            <div style={{ width: indent }} />
            <div
              style={{
                height: isHot ? 16 : 12,
                width: (isHot ? 190 : 80 + ((hash * 9 + i * 0.41) % 1) * 120) * 1,
                borderRadius: 8,
                background: isHot ? C.red : i % 3 === 0 ? 'rgba(21,24,27,0.6)' : 'rgba(120,115,105,0.45)',
              }}
            />
          </div>
        );
      })}
    </div>
  );
};

const Tag: React.FC<{ size?: number }> = ({ size = 1 }) => (
  <div
    style={{
      width: 60 * size,
      height: 76 * size,
      background: C.red,
      borderRadius: `${10 * size}px ${10 * size}px ${16 * size}px ${16 * size}px`,
      boxShadow: '0 10px 20px rgba(140,40,20,0.35)',
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: SERIF,
      fontWeight: 900,
      color: C.paper,
      fontSize: 46 * size,
      paddingTop: 8 * size,
    }}
  >
    <div style={{ position: 'absolute', top: 8 * size, left: 26 * size, width: 8 * size, height: 8 * size, borderRadius: 8, background: 'rgba(0,0,0,0.35)' }} />
    ?
  </div>
);

const abs = (x: number, y: number, extra: React.CSSProperties = {}): React.CSSProperties => ({
  position: 'absolute',
  left: x,
  top: y,
  ...extra,
});

const Shards: React.FC<{ t: number; at: number; x: number; y: number; n: number; seed: number; power?: number }> = ({ t, at, x, y, n, seed, power = 1 }) => {
  const tau = t - at;
  if (tau < 0 || tau > 1.1) return null;
  const rng = mulberry32(seed);
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const a = -Math.PI * (0.05 + 0.9 * rng());
        const v = (300 + rng() * 700) * power;
        const px = x + Math.cos(a) * v * tau;
        const py = y + Math.sin(a) * v * tau + 1500 * tau * tau;
        const col = [C.red, C.slip, C.ink, C.redSoft][Math.floor(rng() * 4)];
        const s = 10 + rng() * 22;
        return (
          <div
            key={i}
            style={abs(px, py, {
              width: s,
              height: s * 0.6,
              background: col,
              opacity: 1 - prog(tau, 0.6, 1.1),
              transform: `rotate(${tau * (rng() - 0.5) * 900}deg)`,
              boxShadow: '0 4px 8px rgba(60,30,10,0.2)',
            })}
          />
        );
      })}
    </>
  );
};

export const Assay: React.FC<{ t: number }> = ({ t }) => {
  const c = cam(t);
  const beltMoving = 1 - prog(t, 6.6, 7.1);
  const beltOff = -(t < 7.1 ? (t - 5.8) * 520 * (1 - 0.5 * prog(t, 6.6, 7.1) * 1) : 0) - (t > CRATE_LEAVE ? (t - CRATE_LEAVE) * 900 : 0);
  const slamP = pulseAt(t, ASSAY.slam, 0.12);
  const sh = { x: 0, y: 0, r: 0 };
  const showCards = t >= ASSAY.cards;

  // stamp plate ---------------------------------------------------------------------
  const fusedP = outBack(prog(t, ASSAY.fuse, ASSAY.fuse + 0.28), 2.4);
  const windup = outCubic(prog(t, 7.55, 7.93));
  const slamDrop = inExpo(prog(t, 7.9, 8.0));
  const lift = inOut(prog(t, 8.75, 9.3));
  let plateY = lerp(FUSE.y, -560, windup);
  if (t >= 7.9) plateY = lerp(-560, REST_Y, slamDrop);
  if (t >= 8.0) plateY = REST_Y + 26 * Math.exp(-(t - 8.0) / 0.06) * Math.sin(1 + (t - 8.0) * 30) * 0 - lift * 900;
  const plateTilt = t < 7.9 ? -3 * windup : 0;
  const plateSquash = t >= 8.0 ? 1 - 0.1 * slamP : 1;
  const showPlate = t >= ASSAY.fuse && plateY > -1500;
  const knobY = -150 + (t >= 8.0 ? 0 : 0);

  // tiles ---------------------------------------------------------------------------
  const tiles = Array.from({ length: ASSAY.tiles }, (_, i) => {
    const slideP = outQuart(prog(t, 5.9 + i * 0.022, 6.65 + i * 0.022));
    let x = tileX(i) - 2700 * (1 - slideP);
    let y = BELT_Y - TILE_H / 2 - 4;
    let rot = 0;
    let sc = 1;
    // regroup into the crate
    const rp = inOut(prog(t, 7.0 + i * 0.025, 7.55 + i * 0.025));
    if (rp > 0) {
      x = lerp(tileX(i), crateX(i), rp);
      y = lerp(y, crateY(i), rp) - 130 * Math.sin(Math.PI * rp);
      rot = 0;
    }
    const v = VERDICTS[i];
    const pass = v.pass;
    const vp = prog(t, v.t, v.t + 0.2);
    let dy = 0;
    let fade = 1;
    if (vp > 0 && pass) dy = -34 * outBack(vp, 2.5);
    if (vp > 0 && !pass) {
      const fp = t - v.t - 0.14;
      if (fp > 0) {
        dy = 2400 * fp * fp;
        rot = 40 * fp * (i % 2 ? 1 : -1);
        fade = 1 - prog(fp, 0.25, 0.5);
      }
    }
    // keepers rise out of the crate into a hover line, then unfold into cards
    let hover = 0;
    let cardP = 0;
    const j = keeperIdx(i);
    if (pass) {
      const hp = inOut(prog(t, 8.75 + j * 0.03, 9.45 + j * 0.03));
      if (hp > 0) {
        x = lerp(crateX(i), CARD_X(j) * 0.44, hp);
        y = lerp(crateY(i) + dy, 10, hp);
        dy = 0;
        hover = hp;
      }
      cardP = outBack(prog(t, ASSAY.cards + j * 0.035, ASSAY.cards + 0.42 + j * 0.035), 1.6);
    }
    // crate rides away on the belt
    let cx = 0;
    if (!hover && t > CRATE_LEAVE) cx = inCubic(prog(t, CRATE_LEAVE, CRATE_LEAVE + 0.7)) * 2600;
    return { i, x: x + cx, y: y + dy, rot, sc, fade, vp, pass, hover, cardP, j };
  });

  // tags ----------------------------------------------------------------------------
  const tags = tiles.map(tl => {
    const pop = outBack(prog(t, TAG_POPS[tl.i], TAG_POPS[tl.i] + 0.16), 3);
    const fp = inOut(prog(t, ASSAY.peel + tl.i * 0.02, ASSAY.fuse - 0.02));
    const sx = tileX(tl.i);
    const sy = BELT_Y - TILE_H - 44;
    const ctrlX = sx * 0.4;
    const ctrlY = -400 - (tl.i % 3) * 40;
    const qx = (1 - fp) * (1 - fp) * sx + 2 * (1 - fp) * fp * ctrlX + fp * fp * FUSE.x;
    const qy = (1 - fp) * (1 - fp) * sy + 2 * (1 - fp) * fp * ctrlY + fp * fp * FUSE.y;
    return { x: tl.i < 12 && fp > 0 ? qx : sx, y: fp > 0 ? qy : sy, s: pop * (1 - 0.45 * fp), fp, gone: t >= ASSAY.fuse - 0.005, rot: fp > 0 ? fp * 360 * (tl.i % 2 ? 1 : -1) : 0, sx };
  });

  // header ---------------------------------------------------------------------------
  const wallBlur = 5;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: C.paper }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translate(${sh.x}px, ${sh.y}px) rotate(${sh.r}deg)` }}>
        {/* back wall + floor */}
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, #f8f4ea 0%, #efe9d9 ${(BELT_Y - c.y) * c.z / 10 + 34}%, #dcd3bd 100%)` }} />
        <div style={{ position: 'absolute', inset: 0, filter: `blur(${wallBlur}px)`, opacity: 0.8, transform: `translate(${-c.x * 0.25 * c.z}px, ${-c.y * 0.15}px)` }}>
          {[0, 1, 2].map(r =>
            Array.from({ length: 22 }, (_, k) => (
              <div
                key={`${r}-${k}`}
                style={abs(k * 130 - 300 + (r % 2) * 60, 90 + r * 190, {
                  width: 92,
                  height: 128,
                  borderRadius: 8,
                  background: C.slip,
                  boxShadow: '0 8px 14px rgba(80,60,30,0.15)',
                  opacity: 0.7 - r * 0.15,
                })}
              />
            )),
          )}
        </div>
        <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0', transform: camCss(c) }}>
          {/* belt */}
          <div
            style={abs(-4000, BELT_Y, {
              width: 8000,
              height: 86,
              background: `repeating-linear-gradient(90deg, #22272b 0 34px, #14181b 34px 40px)`,
              backgroundPositionX: beltOff,
              boxShadow: '0 40px 60px rgba(60,40,10,0.35)',
            })}
          />
          <div style={abs(-4000, BELT_Y - 6, { width: 8000, height: 8, background: C.red })} />
          <div style={abs(-4000, BELT_Y + 86, { width: 8000, height: 30, background: 'linear-gradient(#5a5147,#2b2620)' })} />

          {/* crate (back panel) */}
          {t > 7.0 && (
            <div style={{ transform: `translateX(${t > CRATE_LEAVE ? inCubic(prog(t, CRATE_LEAVE, CRATE_LEAVE + 0.7)) * 2600 : 0}px)` }}>
              <div style={abs(-470 + 0, BELT_Y - 385, { width: 940, height: 386, borderRadius: 18, background: '#b9ab8d', opacity: outCubic(prog(t, 6.95, 7.3)), boxShadow: 'inset 0 20px 40px rgba(60,40,10,0.35)' })} />
            </div>
          )}

          {/* tiles */}
          {tiles.map(tl => {
            const scale = lerp(TILE_W / CARD_W, 1, tl.cardP);
            const cardZ = lerp(0, CARD_D(tl.j >= 0 ? tl.j : 0), tl.cardP);
            const cardScreen = tl.cardP > 0;
            // during the corridor, cards sit on the arc (depth via scale)
            const x = cardScreen ? lerp(tl.x, CARD_X(tl.j), tl.cardP) : tl.x;
            const y = cardScreen ? lerp(tl.y, -20, tl.cardP) : tl.y;
            const depthScale = 1 + cardZ * tl.cardP;
            if (t < 5.85) return null;
            const passGlow = tl.pass && tl.vp > 0;
            return (
              <div
                key={tl.i}
                style={abs(x - CARD_W / 2, y - CARD_H / 2, {
                  transform: `rotate(${tl.rot + (cardScreen ? (tl.j - 3.5) * -1.2 * tl.cardP : 0)}deg) scale(${scale * depthScale})`,
                  transformOrigin: '50% 50%',
                  opacity: tl.fade,
                  filter: cardScreen && cardZ < 0 ? `blur(${-cardZ * 9 * tl.cardP}px)` : undefined,
                })}
              >
                <Card hash={(tl.i * 0.37) % 1} edge={passGlow} />
                {tl.vp > 0 && (
                  <div
                    style={abs(CARD_W / 2 - 100, CARD_H / 2 - 100, {
                      width: 200,
                      height: 200,
                      borderRadius: 100,
                      background: tl.pass ? C.red : '#74705f',
                      color: C.paper,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: SERIF,
                      fontWeight: 900,
                      fontSize: 150,
                      transform: `scale(${outBack(tl.vp, 2.6)})`,
                      boxShadow: '0 16px 30px rgba(60,20,10,0.35)',
                      opacity: tl.cardP > 0 ? 1 - tl.cardP : 1,
                    })}
                  >
                    {tl.pass ? '✓' : '✕'}
                  </div>
                )}
              </div>
            );
          })}

          {/* crate front board */}
          {t > 7.0 && (
            <div style={{ transform: `translateX(${t > CRATE_LEAVE ? inCubic(prog(t, CRATE_LEAVE, CRATE_LEAVE + 0.7)) * 2600 : 0}px)` }}>
              <div
                style={abs(-480, BELT_Y - 118, {
                  width: 960,
                  height: 120,
                  borderRadius: 14,
                  background: 'linear-gradient(#cdbf9f,#a89a7b)',
                  boxShadow: '0 20px 30px rgba(60,40,10,0.4)',
                  opacity: outCubic(prog(t, 6.95, 7.3)),
                  overflow: 'hidden',
                })}
              >
                <div style={abs(0, 50, { width: 960, height: 16, background: C.red })} />
              </div>
            </div>
          )}

          {/* per-tile tags */}
          {tags.map(tg =>
            !tg.gone && t >= TAG_POPS[tg.sx > 0 ? 0 : 0] ? (
              <div key={tg.sx}>
                {tg.fp === 0 && <div style={abs(tg.x - 1.5, tg.y + 60, { width: 3, height: 36, background: C.ink, opacity: 0.6 * clamp(tg.s) })} />}
                <div style={abs(tg.x - 30, tg.y - 38, { transform: `rotate(${tg.rot}deg) scale(${Math.max(tg.s, 0)})`, filter: 'drop-shadow(0 8px 10px rgba(80,30,10,0.3))' })}>
                  <Tag />
                </div>
              </div>
            ) : null,
          )}
          <Shards t={t} at={ASSAY.fuse} x={0} y={FUSE.y} n={16} seed={4} power={0.7} />

          {/* fuse ring */}
          {t >= ASSAY.fuse && t < ASSAY.fuse + 0.5 && (
            <div
              style={abs(FUSE.x - 300, FUSE.y - 300, {
                width: 600,
                height: 600,
                borderRadius: 300,
                border: `${10 * (1 - prog(t, ASSAY.fuse, ASSAY.fuse + 0.5))}px solid ${C.red}`,
                transform: `scale(${0.2 + 1.4 * outCubic(prog(t, ASSAY.fuse, ASSAY.fuse + 0.5))})`,
                opacity: 1 - prog(t, ASSAY.fuse, ASSAY.fuse + 0.5),
              })}
            />
          )}

          {/* the stamp: one brief for the whole batch */}
          {showPlate && (
            <div style={abs(-STAMP_W / 2, plateY - STAMP_H / 2, { width: STAMP_W, height: STAMP_H, transform: `rotate(${plateTilt}deg) scale(${Math.max(fusedP, 0)}, ${Math.max(fusedP, 0) * plateSquash})` })}>
              <div
                style={{
                  width: STAMP_W,
                  height: STAMP_H,
                  borderRadius: 34,
                  background: `linear-gradient(180deg, #f76a4c, ${C.red} 40%, ${C.redDeep})`,
                  boxShadow: '0 30px 50px rgba(120,30,10,0.45), inset 0 3px 0 rgba(255,255,255,0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 60,
                  color: C.paper,
                  fontFamily: SERIF,
                  fontWeight: 900,
                  fontSize: 190,
                  position: 'relative',
                }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(0,0,0,0.35)', position: 'absolute', left: 44, top: 44 }} />
                <span style={{ transform: 'translateY(8px)' }}>?</span>
              </div>
              {/* handle */}
              <div style={abs(STAMP_W / 2 - 40, -80, { width: 80, height: 90, background: 'linear-gradient(90deg,#0e1113,#4a5259,#14181b)', borderRadius: 10 })} />
              <div style={abs(STAMP_W / 2 - 100, -170, { width: 200, height: 100, background: 'linear-gradient(180deg,#3a4046,#15181b)', borderRadius: 50, boxShadow: '0 16px 20px rgba(0,0,0,0.3)' })} />
            </div>
          )}
          {t >= ASSAY.slam && t < ASSAY.slam + 0.7 && (
            <>
              <div
                style={abs(-400, REST_Y + 110 - 60, {
                  width: 800,
                  height: 160,
                  borderRadius: 400,
                  border: `${8 * (1 - prog(t, ASSAY.slam, ASSAY.slam + 0.7))}px solid ${C.red}`,
                  opacity: 1 - prog(t, ASSAY.slam, ASSAY.slam + 0.7),
                  transform: `scale(${1 + outCubic(prog(t, ASSAY.slam, ASSAY.slam + 0.7)) * 1.2}, ${1 + outCubic(prog(t, ASSAY.slam, ASSAY.slam + 0.7)) * 1.6})`,
                })}
              />
              <Shards t={t} at={ASSAY.slam} x={-300} y={REST_Y + 100} n={18} seed={9} power={1.1} />
              <Shards t={t} at={ASSAY.slam} x={300} y={REST_Y + 100} n={18} seed={19} power={1.1} />
            </>
          )}
        </div>
      </div>
      <Header
        t={t}
        items={[
          { text: 'ASK EVERY TIME', from: 6.15, to: 7.5 },
          { text: 'ONE BRIEF, ONE BATCH', from: 7.5, to: 10.0 },
          { text: 'VERBATIM SOURCE', from: 10.0, to: 12.4 },
        ]}
      />
    </div>
  );
};
