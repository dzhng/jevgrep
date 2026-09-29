import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { Film, Poster } from './Film.tsx';
import { FPS, H, TOTAL_FRAMES, W } from './timeline.ts';

const Root: React.FC = () => (
  <>
    <Composition id="Release" component={Film} durationInFrames={TOTAL_FRAMES} fps={FPS} width={W} height={H} />
    <Composition id="Poster" component={Poster} durationInFrames={1} fps={FPS} width={W} height={H} />
  </>
);
registerRoot(Root);
