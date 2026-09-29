import { bundle } from '@remotion/bundler';
import { openBrowser, selectComposition, renderStill } from '@remotion/renderer';
import { mkdirSync } from 'node:fs';
import { REVIEW, IMPACT_REVIEW, FPS, PRE } from '../src/timeline.ts';
const only = process.argv[2] ? process.argv.slice(2).map(Number) : null;
const serveUrl = await bundle({ entryPoint: 'src/index.tsx' });
const browser = await openBrowser('chrome');
try {
  const composition = await selectComposition({ serveUrl, id: 'Release', puppeteerInstance: browser });
  const sets = only
    ? [['pick', only]]
    : [
        ['review', REVIEW],
        ['impacts', IMPACT_REVIEW.flatMap(t => [t - 0.05, t + 0.05, t + 0.2])],
      ];
  for (const [name, times] of sets) {
    mkdirSync(`out/${name}`, { recursive: true });
    for (const time of times) {
      await renderStill({
        serveUrl, composition, puppeteerInstance: browser,
        frame: Math.round((time + PRE) * FPS), scale: 0.5,
        output: `out/${name}/${time.toFixed(2).padStart(5, '0')}.png`,
      });
    }
    console.log(name, times.length);
  }
  if (!only) {
    const poster = await selectComposition({ serveUrl, id: 'Poster', puppeteerInstance: browser });
    await renderStill({ serveUrl, composition: poster, puppeteerInstance: browser, output: 'out/key-art.png' });
    await renderStill({ serveUrl, composition, puppeteerInstance: browser, frame: 0, output: 'out/thumbnail.png' });
  }
} finally {
  await browser.close({ silent: true });
}
