import React from 'react';
import { C, MONO, SERIF, clamp, inOutExpo, lerp, outBack, outCubic, outExpo, prog, pulseAt } from './lib.ts';
import { H, INSTALL, W, lineEnd } from './timeline.ts';
import { Header } from './hud.tsx';

// Where the vermilion dot lands on the dotless j (tuned against a rendered frame).
export const DOT = { x: -12, y: 52 };
const WORD = 'ȷevgrep';
const CHIP = { x: W / 2, y: 740, w: 300, h: 120 };
const FONT = 340;

const Word: React.FC<{ t: number }> = ({ t }) => {
  const letters = WORD.split('');
  return (
    <div style={{ display: 'flex', fontFamily: SERIF, fontWeight: 900, fontSize: FONT, lineHeight: `${FONT}px`, letterSpacing: -8, color: C.ink, fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0' }}>
      {letters.map((ch, i) => {
        const p = outExpo(prog(t, INSTALL.wordmark + i * 0.035, INSTALL.wordmark + 0.4 + i * 0.035));
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', height: FONT * 1.08, paddingRight: 2 }}>
            <span style={{ display: 'inline-block', transform: `translateY(${(1 - p) * 110}%)`, opacity: clamp(p * 4) }}>{ch}</span>
          </span>
        );
      })}
    </div>
  );
};

export const Install: React.FC<{ t: number }> = ({ t }) => {
  const grow = inOutExpo(prog(t, INSTALL.iris, INSTALL.iris + 0.4));
  const fold = inOutExpo(prog(t, INSTALL.fold, INSTALL.fold + 0.45));
  // dark window: grows out of the tower, later folds into the jg chip
  const g = grow * (1 - fold);
  const x0 = 520 - 100;
  const y0 = 790;
  let left = 0;
  let top = lerp(H, 0, grow);
  let width = W;
  let height = H;
  let rad = lerp(60, 0, grow);
  if (fold > 0) {
    left = lerp(0, CHIP.x - CHIP.w / 2, fold);
    top = lerp(0, CHIP.y - CHIP.h / 2, fold);
    width = lerp(W, CHIP.w, fold);
    height = lerp(H, CHIP.h, fold);
    rad = lerp(0, 30, fold);
  }
  const contentA = clamp((t - (INSTALL.iris + 0.35)) * 8) * (1 - clamp((t - INSTALL.fold) * 9));
  const chipA = clamp((t - (INSTALL.fold + 0.3)) * 10);
  const active = INSTALL.lines.findIndex((l, i) => t < (INSTALL.lines[i + 1]?.t ?? 1e9));
  const dotP = prog(t, 20.2, 20.5);
  const dotY = lerp(-300, 0, dotP * dotP) - (t > 20.5 ? Math.abs(Math.sin((t - 20.5) * 13)) * 60 * Math.exp(-(t - 20.5) / 0.2) : 0);
  const badge = outBack(prog(t, 20.75, 21.0), 2.6);
  const wmShow = t >= INSTALL.wordmark - 0.05;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {fold > 0 && <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg,#f8f4ea,#ece5d3)` }} />}
      {/* wordmark */}
      {wmShow && (
        <div style={{ position: 'absolute', left: -120, top: 130, width: W, display: 'flex', justifyContent: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Word t={t} />
            <div
              style={{
                position: 'absolute',
                left: 24 + DOT.x,
                top: 6 + DOT.y,
                width: 84,
                height: 84,
                borderRadius: 42,
                background: `radial-gradient(circle at 35% 30%, #ff8a6f, ${C.red} 55%, ${C.redDeep})`,
                transform: `translateY(${dotY}px) scale(${1 + 0.25 * pulseAt(t, 20.5, 0.1)})`,
                boxShadow: '0 12px 20px rgba(150,40,20,0.35)',
                opacity: t > 20.2 ? 1 : 0,
              }}
            />
            <div
              style={{
                position: 'absolute',
                right: -340,
                top: -60,
                transform: `rotate(6deg) scale(${lerp(3, 1, outExpo(prog(t, 20.7, 20.95)))})`,
                opacity: clamp((t - 20.7) * 12),
                background: C.red,
                color: C.paper,
                fontFamily: MONO,
                fontWeight: 700,
                fontSize: 200,
                lineHeight: 1.05,
                padding: '6px 38px',
                borderRadius: 42,
                letterSpacing: 4,
                boxShadow: '0 24px 40px rgba(140,40,20,0.4), inset 0 3px 0 rgba(255,255,255,0.3)',
              }}
            >
              0.5
            </div>
          </div>
        </div>
      )}
      {/* dark window / jg chip */}
      {grow > 0 && (
        <div
          style={{
            position: 'absolute',
            left,
            top,
            width,
            height,
            borderRadius: rad,
            background: `radial-gradient(120% 90% at 50% 40%, #20262a, ${C.ink})`,
            boxShadow: fold > 0 ? '0 30px 50px rgba(50,30,10,0.35)' : undefined,
            overflow: 'hidden',
          }}
        >
          {fold > 0 && (
            <div style={{ position: 'absolute', inset: 0, opacity: chipA, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontWeight: 700, fontSize: 64, color: C.paper }}>
              <span style={{ color: C.red, marginRight: 22 }}>❯</span>jg
            </div>
          )}
        </div>
      )}
      {/* typed commands */}
      <div style={{ position: 'absolute', left: 190, top: 330, opacity: contentA, transformOrigin: '0 50%', transform: `scale(${1 + 0.05 * clamp((t - 16) / 3.5)})` }}>
        {INSTALL.lines.map((l, i) => {
          const n = clamp((t - l.t) * l.cps, 0, l.text.length);
          const shown = l.text.slice(0, Math.floor(n));
          const done = t >= lineEnd(i);
          const started = t >= l.t - 0.1;
          const caret = Math.floor(t * 3) % 2 === 0 || !done;
          const isAsk = i === 3;
          const parts = isAsk ? [shown.slice(0, 3), shown.slice(3)] : [shown, ''];
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', height: 120, fontFamily: MONO, fontSize: 50, color: C.paper, fontWeight: 500, opacity: started ? 1 : 0 }}>
              <span style={{ color: C.red, marginRight: 30, fontWeight: 700 }}>❯</span>
              <span>
                {isAsk ? (
                  <>
                    {parts[0]}
                    <span style={{ color: '#f4d9a8' }}>{parts[1]}</span>
                  </>
                ) : (
                  shown
                )}
              </span>
              {active === i && caret && <span style={{ display: 'inline-block', width: 26, height: 58, background: C.red, marginLeft: 6 }} />}
              {done && i < 3 && (
                <span style={{ marginLeft: 40, color: C.red, fontWeight: 700, transform: `scale(${outBack(prog(t, lineEnd(i), lineEnd(i) + 0.15), 3)})` }}>✓</span>
              )}
            </div>
          );
        })}
      </div>
      {t < INSTALL.fold && (
        <div style={{ opacity: contentA }}>
          <Header
            dark
            t={t}
            items={[
              { text: 'INSTALL', from: 16.1, to: 17.3 },
              { text: 'AUTHENTICATE', from: 17.3, to: 17.75 },
              { text: 'ADD THE AGENT SKILL', from: 17.75, to: 18.2 },
              { text: 'ASK', from: 18.2, to: 19.5 },
            ]}
          />
        </div>
      )}
    </div>
  );
};
