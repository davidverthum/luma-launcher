// Accent color: «Играть», lit text, the island's lamps, focus rings — lime unless the player picks
// another in Settings → Внешний вид. Each accent is its night color plus a darker ink that stays
// readable on the day theme; the rest of the --luma tokens are derived from those two the way
// tokens.css derives lime's. Lime itself is tokens.css as is.
import { useEffect } from 'react';
import { mixRGB, hexRGB } from './ds/util.js';

export const ACCENTS = [
  { id: 'luma', label: 'Лайм', night: '#d4ff3d', ink: '#4a6400' },
  { id: 'mint', label: 'Мята', night: '#3dffa8', ink: '#006b43' },
  { id: 'ice', label: 'Лёд', night: '#4fe3ff', ink: '#00708a' },
  { id: 'violet', label: 'Аметист', night: '#b39bff', ink: '#6447d6' },
  { id: 'pink', label: 'Неон', night: '#ff5fae', ink: '#bf1f6e' },
  { id: 'lava', label: 'Лава', night: '#ff6b3d', ink: '#b0350d' },
  { id: 'amber', label: 'Янтарь', night: '#ffb547', ink: '#8f5300' },
];

const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const BLACK = [0, 0, 0];
const WHITE = [255, 255, 255];

function css({ night, ink }) {
  const n = hexRGB(night);
  const fill = hex(mixRGB(n, BLACK, 0.04));
  return `:root[data-accent], :root[data-accent][data-theme="night"] {
  --luma: ${night}; --luma-hover: ${hex(mixRGB(n, WHITE, 0.3))}; --luma-ink: ${night}; --luma-soft: ${hex(mixRGB([7, 8, 10], n, 0.12))};
  --status-online: ${night}; --glow-luma: 0 0 0 1px ${night}99, 0 8px 30px -4px ${night}80, 0 0 90px -12px ${night}66;
  --focus-ring: 0 0 0 2px #07080a, 0 0 0 4px ${night};
}
:root[data-accent][data-theme="day"] {
  --luma: ${fill}; --luma-hover: ${hex(mixRGB(n, BLACK, 0.1))}; --luma-ink: ${ink}; --luma-soft: ${hex(mixRGB(n, WHITE, 0.76))};
  --status-online: ${ink}; --glow-luma: 0 0 0 1px ${ink}40, 0 10px 30px -10px ${ink}99;
  --focus-ring: 0 0 0 2px #ffffff, 0 0 0 4px ${ink};
}`;
}

/** Applies the accent to the whole window (and the login screen) as soon as settings load. */
export function useAccent(id) {
  useEffect(() => {
    const accent = ACCENTS.find((a) => a.id === id);
    const root = document.documentElement;
    let style = document.getElementById('luma-accent');
    if (!accent || accent.id === 'luma') {
      root.removeAttribute('data-accent');
      if (style) style.remove();
      return;
    }
    if (!style) {
      style = document.createElement('style');
      style.id = 'luma-accent';
      document.head.appendChild(style);
    }
    style.textContent = css(accent);
    root.setAttribute('data-accent', accent.id);
  }, [id]);
}
