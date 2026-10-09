// Luma logo: the lit block (pixel mark) + the LUMA wordmark (Unbounded 800 outlines).
import { pixelPath } from './icons.jsx';
import { WORDMARK_D, WORDMARK_VB } from './wordmark.js';
import * as React from 'react';

// L = lit top face + light rays (luma) · # = left face, solid (ink) · d = right face, dithered (ink)
export const MARK = [
  '.......LL.......',
  '...L........L...',
  '.......LL.......',
  '.....LLLLLL.....',
  '...LLLLLLLLLL...',
  '.LLLLLLLLLLLLLL.',
  '...LLLLLLLLLL...',
  '.##..LLLLLL..d..',
  '.####..LL...d.d.',
  '.######..d.d.d..',
  '.#######d.d.d.d.',
  '.#######.d.d.d..',
  '...#####d.d.d...',
  '.....###.d......',
  '.......#d.......',
  '................',
];
const only = (set) => MARK.map((r) => r.split('').map((c) => (set.includes(c) ? '#' : '.')).join(''));
export const MARK_LIT = only('L');
export const MARK_EDGE = only('#d');

/** The lit block. `light` paints the top face and rays, `ink` the edges. Sizes 16 · 32 · 48 · 64. */
export function LumaMark({ size = 32, light = 'var(--luma)', ink = 'var(--ink)', mono, className, style, title = 'Luma' }) {
  return (
    <svg className={'lm-mark' + (className ? ' ' + className : '')} width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" role="img" aria-label={title} style={style}>
      <path d={pixelPath(MARK_LIT)} fill={mono || light} />
      <path d={pixelPath(MARK_EDGE)} fill={mono || ink} />
    </svg>
  );
}

/** Lockup: mark + LUMA wordmark. `height` is the wordmark cap height in px. */
export function Logo({ height = 18, mark = true, light = 'var(--luma)', ink = 'var(--ink)', mono, className, style }) {
  const [x, y, w, h] = WORDMARK_VB.split(' ').map(Number);
  const markSize = Math.round((height * 16) / 10 / 2) * 2;
  return (
    <span className={'lm-logo' + (className ? ' ' + className : '')} style={{ gap: Math.round(height * 0.55), ...style }} role="img" aria-label="Luma">
      {mark ? <LumaMark size={markSize} light={light} ink={ink} mono={mono} title="" /> : null}
      <svg height={height} width={(height * w) / 750} viewBox={`${x} -750 ${w} 750`} aria-hidden="true" style={{ overflow: 'visible' }}>
        <path d={WORDMARK_D} fill={mono || ink} />
      </svg>
    </span>
  );
}

export { WORDMARK_D, WORDMARK_VB };
