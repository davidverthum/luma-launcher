// PlayerHead — an 8×8 pixel face. Generated from the nickname, or cut from a real skin texture.
import { cx, hashStr, rng } from './util.js';
import { StatusMark } from './controls.jsx';
import * as React from 'react';
const { useMemo, useEffect, useState } = React;

const SKIN = ['#f3cdab', '#e2ae88', '#c8916c', '#a26f50', '#77503a', '#523829'];
const HAIR = ['#2b1f18', '#4a3121', '#6b4a2f', '#a8783f', '#dcb86c', '#ece4d4', '#8f2f22', '#3a3d45', '#d4ff3d', '#4fe3ff', '#ff5fae', '#b39bff'];
const EYES = ['#3f74d8', '#5a3a24', '#2f8a4f', '#60656c', '#7a4fd1', '#c27a1a'];
const FABRIC = ['#23272d', '#3a3f47', '#5b2a3a', '#20414a', '#4a3b20', '#2d2a4a'];

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k)), g = Math.min(255, Math.round(((n >> 8) & 255) * k)), b = Math.min(255, Math.round((n & 255) * k));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** 8×8 array of hex colors for a nickname. */
export function faceFor(name) {
  const r = rng(hashStr('head:' + name));
  const pick = (a) => a[Math.floor(r() * a.length)];
  const skin = pick(SKIN), hair = r() < 0.12 ? pick(HAIR.slice(8)) : pick(HAIR.slice(0, 8)), eye = pick(EYES), cloth = pick(FABRIC);
  const px = Array.from({ length: 8 }, () => Array(8).fill(skin));
  const set = (x, y, c) => { if (x >= 0 && x < 8 && y >= 0 && y < 8) px[y][x] = c; };
  for (let x = 0; x < 8; x++) set(x, 7, shade(skin, 0.9));
  const style = Math.floor(r() * 6);
  const H = hair, Hd = shade(hair, 0.8);
  // hair
  for (let x = 0; x < 8; x++) { set(x, 0, Hd); set(x, 1, H); }
  if (style === 0) { set(0, 2, H); set(7, 2, H); }
  if (style === 1) { [0, 1, 2, 5, 6, 7].forEach((x) => set(x, 2, H)); set(3, 2, Hd); }
  if (style === 2) { for (let y = 2; y < 7; y++) { set(0, y, H); set(7, y, H); } set(1, 2, H); set(6, 2, H); }
  if (style === 3) { for (let x = 0; x < 8; x++) { set(x, 0, skin); set(x, 1, x > 1 && x < 6 ? H : skin); } set(3, 0, H); set(4, 0, H); }
  if (style === 4) { for (let x = 0; x < 8; x++) { set(x, 0, cloth); set(x, 1, cloth); } for (let y = 2; y < 8; y++) { set(0, y, cloth); set(7, y, cloth); } set(1, 2, shade(cloth, 0.8)); set(6, 2, shade(cloth, 0.8)); }
  if (style === 5) { const cap = pick(['#d4ff3d', '#4fe3ff', '#ff5fae', '#ffb547', '#e8edf1', '#23272d']); for (let x = 0; x < 8; x++) { set(x, 0, cap); set(x, 1, shade(cap, 0.85)); } for (let x = 0; x < 6; x++) set(x, 2, shade(cap, 0.7)); set(7, 2, H); }
  // brows + eyes
  if (r() < 0.6) { set(1, 3, Hd); set(2, 3, Hd); set(5, 3, Hd); set(6, 3, Hd); }
  const look = r() < 0.5;
  set(1, 4, look ? '#ffffff' : eye); set(2, 4, look ? eye : '#ffffff');
  set(5, 4, look ? '#ffffff' : eye); set(6, 4, look ? eye : '#ffffff');
  // nose + mouth
  set(3, 5, shade(skin, 0.86)); set(4, 5, shade(skin, 0.86));
  const mouth = shade(skin, 0.62);
  if (r() < 0.5) { set(3, 6, mouth); set(4, 6, mouth); } else { set(2, 6, mouth); set(3, 6, mouth); set(4, 6, mouth); set(5, 6, mouth); }
  // beard
  if (style !== 4 && r() < 0.18) { for (let x = 1; x < 7; x++) set(x, 7, Hd); set(1, 6, Hd); set(6, 6, Hd); }
  // accessory
  const acc = r();
  if (acc < 0.14) { for (let x = 1; x < 7; x++) set(x, 4, '#d4ff3d'); set(0, 4, '#8fae1f'); set(7, 4, '#8fae1f'); set(3, 4, '#f2ffc4'); }
  else if (acc < 0.26) { for (let x = 1; x < 7; x++) set(x, 4, '#15171a'); set(2, 4, '#3d434b'); set(5, 4, '#3d434b'); }
  else if (acc < 0.34) { for (let x = 0; x < 8; x++) { set(x, 6, cloth); set(x, 7, shade(cloth, 0.8)); } }
  return px;
}

/** Cut the front face (+ hat layer) out of a 64×64 skin. Resolves to an 8×8 color array. */
export function faceFromSkin(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      const base = x.getImageData(8, 8, 8, 8).data, hat = x.getImageData(40, 8, 8, 8).data;
      const out = [];
      for (let y = 0; y < 8; y++) {
        const row = [];
        for (let i = 0; i < 8; i++) {
          const o = (y * 8 + i) * 4;
          const d = hat[o + 3] > 127 ? hat : base;
          row.push('#' + [d[o], d[o + 1], d[o + 2]].map((v) => v.toString(16).padStart(2, '0')).join(''));
        }
        out.push(row);
      }
      res(out);
    };
    img.onerror = rej;
    img.src = src;
  });
}

function FaceSvg({ px }) {
  const paths = useMemo(() => {
    const by = {};
    px.forEach((row, y) => row.forEach((c, x) => { (by[c] = by[c] || []).push(`M${x} ${y}h1v1h-1z`); }));
    return Object.entries(by);
  }, [px]);
  return (
    <svg viewBox="0 0 8 8" width="100%" height="100%" shapeRendering="crispEdges" aria-hidden="true">
      {paths.map(([c, d]) => <path key={c} fill={c} d={d.join('')} />)}
    </svg>
  );
}

let skinResolver = null;
/** Lets the app supply real skins: `fn(name) → Promise<skin texture URL | null>`. Heads without a
 * `skin` prop then show that player's real face, and the generated one until it arrives. */
export function setSkinResolver(fn) { skinResolver = fn; }

/** PlayerHead — size 24 · 32 · 40 · 56 · 80. status adds a pixel mark; `color` tints an in-game mark. */
export function PlayerHead({ name = 'Player', skin, size = 32, status, color, ring = false, className, style, title }) {
  const gen = useMemo(() => faceFor(name), [name]);
  const key = skin || 'name:' + name;
  const [real, setReal] = useState(null); // { key, px } — tied to the skin/name it was cut from
  useEffect(() => {
    let on = true;
    const src = skin ? Promise.resolve(skin) : skinResolver ? skinResolver(name) : null;
    if (src) src.then((s) => (s ? faceFromSkin(s) : null)).then((px) => { if (on && px) setReal({ key, px }); }).catch(() => {});
    return () => { on = false; };
  }, [key]);
  return (
    <span className={cx('lm-head', ring && 'lm-head--ring', size <= 24 && 'lm-head--xs', className)} style={{ '--head': size + 'px', ...(color ? { '--status-color': color } : null), ...style }} title={title || name} role="img" aria-label={name}>
      <span className="lm-head-face"><FaceSvg px={real && real.key === key ? real.px : gen} /></span>
      {status ? <StatusMark status={status} color={color} className="lm-head-mark" /> : null}
    </span>
  );
}

/** A row of overlapping heads with a "+N". */
export function HeadStack({ names = [], max = 4, size = 24, className }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className={cx('lm-headstack', className)} style={{ '--head': size + 'px' }}>
      {shown.map((n) => <PlayerHead key={n} name={n} size={size} />)}
      {rest > 0 ? <span className="lm-headstack-more">+{rest}</span> : null}
    </span>
  );
}
