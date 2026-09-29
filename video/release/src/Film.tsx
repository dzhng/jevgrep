import React, { useEffect, useState } from 'react';
import { Html5Audio, continueRender, delayRender, staticFile, useCurrentFrame } from 'remotion';
import { C, MONO, clamp, inOut, prog, shake, useT } from './lib.ts';
import { FPS, H, IMPACTS, PRE, W, mulberry32 } from './timeline.ts';
import { Mountain } from './Mountain.tsx';
import { Assay } from './Assay.tsx';
import { Cost } from './Cost.tsx';
import { Install } from './Install.tsx';

const FONT_CSS = `
@font-face{font-family:Fraunces;src:url(${staticFile('fonts/Fraunces.ttf')});font-weight:100 900;}
@font-face{font-family:PlexMono;src:url(${staticFile('fonts/Mono.ttf')});font-weight:100 900;}
`;
const useFonts = () => {
  const [h] = useState(() => delayRender('fonts'));
  useEffect(() => {
    Promise.all([
      document.fonts.load('900 100px Fraunces'),
      document.fonts.load('500 40px PlexMono'),
      document.fonts.load('700 40px PlexMono'),
      document.fonts.load('600 40px PlexMono'),
    ]).finally(() => continueRender(h));
  }, [h]);
};

const grainStyle = (f: number): React.CSSProperties => {
  const r = mulberry32(f * 13 + 1);
  return {
    position: 'absolute',
    inset: 0,
    backgroundImage: `url(${staticFile('grain.png')})`,
    backgroundSize: '512px 512px',
    backgroundPosition: `${Math.floor(r() * 512)}px ${Math.floor(r() * 512)}px`,
    mixBlendMode: 'soft-light',
    opacity: 0.28,
    pointerEvents: 'none',
  };
};

export const Frame: React.FC<{ t: number; f: number; children?: React.ReactNode }> = ({ t, f, children }) => {
  let ab = 0;
  let sx = 0;
  let sy = 0;
  let sr = 0;
  for (const im of IMPACTS) {
    const dt = t - im.t;
    if (dt >= -0.01 && dt < 0.5) ab += 9 * im.size * Math.exp(-Math.max(dt, 0) / 0.07);
    const s = shake(t, im.t, 16 * im.size, 0.16);
    sx += s.x;
    sy += s.y;
    sr += s.r;
  }
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.paper, overflow: 'hidden' }}>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <filter id="ab" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
            <feOffset in="r" dx={ab} dy={0} result="ro" />
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
            <feOffset in="b" dx={-ab} dy={0} result="bo" />
            <feBlend in="ro" in2="g" mode="screen" result="rg" />
            <feBlend in="rg" in2="bo" mode="screen" />
          </filter>
        </defs>
      </svg>
      <div style={{ position: 'absolute', inset: 0, filter: ab > 0.4 ? 'url(#ab)' : undefined }}>
        <div style={{ position: 'absolute', inset: -40, transform: `translate(${sx}px, ${sy}px) rotate(${sr}deg)` }}>
          <div style={{ position: 'absolute', left: 40, top: 40, width: W, height: H }}>{children}</div>
        </div>
      </div>
      {/* lens: vignette + grain */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 100% at 50% 45%, rgba(0,0,0,0) 55%, rgba(30,20,5,0.22) 100%)', pointerEvents: 'none' }} />
      <div style={grainStyle(f)} />
    </div>
  );
};

const Whip: React.FC<{ p: number; dx: number; dy: number; children: React.ReactNode }> = ({ p, dx, dy, children }) => {
  // p: 0..1 through the whip; content offset + directional motion blur
  const blur = Math.sin(Math.PI * clamp(p)) * 90;
  const id = dx !== 0 ? 'wx' : 'wy';
  return (
    <div style={{ position: 'absolute', inset: 0, transform: `translate(${dx * p}px, ${dy * p}px)`, filter: blur > 1 ? `url(#${id})` : undefined }}>{children}</div>
  );
};

export const Film: React.FC = () => {
  useFonts();
  const f = useCurrentFrame();
  const t = useT();
  const w1 = inOut(prog(t, 5.8, 6.15)); // horizontal whip: mountain -> assay
  const w2 = inOut(prog(t, 11.82, 12.2)); // vertical whip: assay -> cost
  const b1 = Math.sin(Math.PI * w1) * 110;
  const b2 = Math.sin(Math.PI * w2) * 110;
  return (
    <>
      <style>{FONT_CSS}</style>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <filter id="wx" x="-20%" y="0" width="140%" height="100%">
            <feGaussianBlur stdDeviation={`${b1} 0`} />
          </filter>
          <filter id="wy" x="0" y="-20%" width="100%" height="140%">
            <feGaussianBlur stdDeviation={`0 ${b2}`} />
          </filter>
        </defs>
      </svg>
      <Html5Audio src={staticFile('score.wav')} />
      <Frame t={t} f={f}>
        {t < 6.3 && (
          <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-W * w1}px)`, filter: b1 > 1 ? 'url(#wx)' : undefined }}>
            <Mountain t={t} />
          </div>
        )}
        {t >= 5.75 && t < 12.3 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              transform: `translate(${W * (1 - w1) * (t < 6.5 ? 1 : 0)}px, ${-H * w2}px)`,
              filter: t < 6.5 ? (b1 > 1 ? 'url(#wx)' : undefined) : b2 > 1 ? 'url(#wy)' : undefined,
            }}
          >
            <Assay t={t} />
          </div>
        )}
        {t >= 11.75 && t < 16.4 && (
          <div style={{ position: 'absolute', inset: 0, transform: `translateY(${H * (1 - w2) * (t < 12.6 ? 1 : 0)}px)`, filter: t < 12.6 && b2 > 1 ? 'url(#wy)' : undefined }}>
            <Cost t={t} />
          </div>
        )}
        {t >= 15.6 && <Install t={t} />}
        {t >= 2.0 && t < 15.95 && (
          <div style={{ position: 'absolute', right: 70, top: 64, height: 80, padding: '0 34px', display: 'flex', alignItems: 'center', gap: 16, borderRadius: 40, background: C.red, color: C.paper, fontFamily: MONO, fontWeight: 700, fontSize: 44, letterSpacing: 3, boxShadow: '0 14px 30px rgba(140,40,20,0.35)', opacity: clamp((t - 2.0) * 6) }}>
            jevgrep 0.5
          </div>
        )}
      </Frame>
    </>
  );
};

export const Poster: React.FC = () => {
  useFonts();
  return (
    <>
      <style>{FONT_CSS}</style>
      <Frame t={0} f={5}>
        <Cost t={15.4} />
      </Frame>
    </>
  );
};

export const FPS_ = FPS;
export const PRE_ = PRE;
