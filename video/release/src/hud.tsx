import React from 'react';
import { C, MONO, clamp, outCubic, prog } from './lib.ts';

/** One header per shot: says what is happening. Text swaps with a masked rise. */
export const Header: React.FC<{ items: { text: string; from: number; to: number }[]; t: number; dark?: boolean; right?: React.ReactNode }> = ({
  items,
  t,
  dark,
  right,
}) => {
  const col = dark ? C.paper : C.ink;
  return (
    <>
    <div
      style={{
        position: 'absolute',
        left: 70,
        top: 64,
        height: 80,
        padding: '0 40px 0 34px',
        borderRadius: 40,
        background: dark ? 'rgba(42,47,51,0.92)' : 'rgba(250,246,236,0.93)',
        boxShadow: '0 14px 30px rgba(60,40,10,0.22)',
        display: 'flex',
        alignItems: 'center',
        gap: 22,
        fontFamily: MONO,
        fontWeight: 600,
        fontSize: 36,
        letterSpacing: 5,
        color: col,
      }}
    >
      <div style={{ width: 20, height: 20, borderRadius: 10, background: C.red }} />
      <div style={{ position: 'relative', height: 56, overflow: 'hidden', minWidth: 520 }}>
        {items.map((it, i) => {
          const inn = outCubic(prog(t, it.from, it.from + 0.28));
          const out = outCubic(prog(t, it.to - 0.2, it.to));
          const vis = t >= it.from && t < it.to;
          if (!vis) return null;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                lineHeight: '56px',
                whiteSpace: 'nowrap',
                transform: `translateY(${(1 - inn) * 56 - out * 56}px)`,
              }}
            >
              {it.text}
            </div>
          );
        })}
      </div>
    </div>
      {right && <div style={{ position: 'absolute', left: 70, top: 164, padding: '12px 36px', borderRadius: 34, background: dark ? 'rgba(42,47,51,0.92)' : 'rgba(250,246,236,0.93)', boxShadow: '0 14px 30px rgba(60,40,10,0.22)' }}>{right}</div>}
    </>
  );
};

export const Counter: React.FC<{ label: string; value: number; dark?: boolean }> = ({ label, value, dark }) => (
  <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', fontFamily: MONO, color: dark ? C.paper : C.ink }}>
    <span style={{ fontSize: 22, letterSpacing: 4, opacity: 0.55 }}>{label}</span>
    <span style={{ fontSize: 44, fontWeight: 700, minWidth: 64, textAlign: 'right' }}>{Math.round(value)}</span>
  </div>
);

export const visible = (t: number, a: number, b: number) => clamp(Math.min(t - a, b - t) * 8);
