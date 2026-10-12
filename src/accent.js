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
const NIGHT_BG = [7, 8, 10];

const lum = (c) => {
  const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function fromHsl([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
/** Moves only the lightness of `c` (hue and saturation stay) until it reaches `min` contrast against `bg`. */
function until(c, bg, min, lighter) {
  const [h, s, l0] = toHsl(c);
  for (let i = 0; i <= 40; i++) {
    const l = lighter ? l0 + (1 - l0) * i / 40 : l0 * (1 - i / 40);
    const m = fromHsl([h, s, l]);
    if (contrast(m, bg) >= min) return m;
  }
  return lighter ? WHITE : BLACK;
}
const hue = ([r, g, b]) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

/** Any color the player picks: kept as is when readable, lightened for the night theme (the
 * «Играть» label is dark) and darkened into an ink that stays readable on the day theme. */
export function customAccent(color) {
  const c = hexRGB(/^#[0-9a-f]{6}$/i.test(color || '') ? color : ACCENTS[0].night);
  return { id: 'custom', label: 'Свой', night: hex(contrast(c, NIGHT_BG) >= 4.5 ? c : until(c, NIGHT_BG, 4.5, true)), ink: hex(contrast(c, WHITE) >= 4.5 ? c : until(c, WHITE, 4.5, false)) };
}

export function resolveAccent(id, color) {
  return id === 'custom' ? customAccent(color) : ACCENTS.find((a) => a.id === id) || ACCENTS[0];
}

/** The game's own menu has one island picture per ready-made accent; a custom color gets the closest hue. */
export function gameAccentId(id, color) {
  if (id !== 'custom') return id || 'luma';
  const rgb = hexRGB(customAccent(color).night);
  if (toHsl(rgb)[1] < 0.12) return 'ice'; // grey, white, black: no hue to match, the coolest island fits
  const h = hue(rgb);
  const dist = (a) => { const d = Math.abs(hue(hexRGB(a.night)) - h); return Math.min(d, 360 - d); };
  return ACCENTS.reduce((best, a) => (dist(a) < dist(best) ? a : best)).id;
}

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
export function useAccent(id, color) {
  useEffect(() => {
    const accent = id === 'custom' ? customAccent(color) : ACCENTS.find((a) => a.id === id);
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
  }, [id, color]);
}
