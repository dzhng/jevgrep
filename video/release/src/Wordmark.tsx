import React from 'react';
import { C, MONO, SERIF } from './lib.ts';

// Static lockup: dotless j + vermilion dot, with the version badge.
export const Wordmark: React.FC<{ size: number; badge?: number; badgeScale?: number; children?: never }> = ({ size, badge = 1, badgeScale = 1 }) => {
  const k = size / 340;
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: size, lineHeight: `${size}px`, letterSpacing: -8 * k, color: C.ink, fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0', textShadow: '0 0 40px rgba(250,246,236,0.9)' }}>
        ȷevgrep
      </div>
      <div style={{ position: 'absolute', left: 12 * k, top: 58 * k, width: 84 * k, height: 84 * k, borderRadius: 42 * k, background: `radial-gradient(circle at 35% 30%, #ff8a6f, ${C.red} 55%, ${C.redDeep})`, boxShadow: '0 12px 20px rgba(150,40,20,0.35)' }} />
      {badge > 0 && (
        <div
          style={{
            position: 'absolute',
            right: -250 * k,
            top: -20 * k,
            transform: `rotate(6deg) scale(${badgeScale})`,
            background: C.red,
            color: C.paper,
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 190 * k,
            lineHeight: 1.05,
            padding: `${6 * k}px ${34 * k}px`,
            borderRadius: 40 * k,
            letterSpacing: 4,
            boxShadow: '0 24px 40px rgba(140,40,20,0.4), inset 0 3px 0 rgba(255,255,255,0.3)',
          }}
        >
          0.5
        </div>
      )}
    </div>
  );
};
