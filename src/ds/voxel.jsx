// VoxelArt — procedural isometric voxel islands, one per realm biome.
// Pixel-true: drawn at low resolution with integer rects, then scaled up with image-rendering: pixelated.
import { rng, hashStr, useTheme, resolveColor, useReducedMotion, useSize, cx, mixRGB, rgbStr, hexRGB } from './util.js';
import * as React from 'react';
const { useRef, useEffect, useMemo, useState, useLayoutEffect } = React;

/* ---------------- noise ---------------- */
function noise2(rand) {
  const N = 32, g = new Float32Array(N * N);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const at = (x, y) => g[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/* ---------------- materials ---------------- */
const DAY = {
  grass: ['#7cc24e', '#7d5636', '#62a63c'], dirt: ['#8b6141', '#7a5333'], path: ['#cfae72', '#7a5333'],
  stone: ['#9097a0', '#80868e'], deep: ['#5f646c', '#50545b'], sand: ['#e6d59f', '#d4c189'],
  water: ['#58a3e6', '#3f84c6'], log: ['#b48a52', '#6e4c2c'], leaf: ['#55a840', '#468f34'],
  plank: ['#c79e62', '#ad874f'], roof: ['#9a4f3c', '#7f3f31'], metal: ['#b3bcc6', '#97a0aa'],
  plate: ['#7c858f', '#69717a'], copper: ['#d08a5c', '#b56f45'], quartz: ['#f1f2f4', '#d9dce0'],
  tile: ['#e3e6ea', '#c9ced4'], tile2: ['#c5cbd2', '#b2b8bf'], nether: ['#9c3d31', '#813127'],
  ash: ['#7a7472', '#625d5b'], basalt: ['#5a5753', '#4a4744'], obsidian: ['#3a2f52', '#2a2140'],
  cloud: ['#ffffff', '#e8edf1'], snow: ['#f4f7f8', '#dfe5e8'],
  teamA: ['#ff6fb5', '#e2559b'], teamB: ['#55ddff', '#3ec3e6'], teamC: ['#cdf74a', '#b3dc35'], teamD: ['#ffbd55', '#e5a33f'],
};
const EMISSIVE = { lamp: 1, lava: 1, crystal: 1, core: 1, neon: 1, rune: 1 };
const NIGHT_AMBIENT = [8, 11, 20];

function palette(theme, light) {
  const night = theme !== 'day';
  const P = {};
  for (const k in DAY) {
    const [t, s, f] = DAY[k].map(hexRGB);
    const conv = (c, k = 0) => (night ? mixRGB(mixRGB(c, NIGHT_AMBIENT, 0.5 - k), light, 0.09) : c);
    P[k] = { top: conv(t, 0.06), side: conv(s), fringe: f ? conv(f, 0.06) : null, glow: false };
  }
  const W = [255, 255, 255];
  const lit = (topMix, sideMix) => ({
    top: night ? mixRGB(light, W, topMix) : mixRGB(light, W, topMix + 0.25),
    side: night ? mixRGB(light, W, sideMix) : mixRGB(light, [200, 200, 200], 0.18),
    fringe: null, glow: true,
  });
  P.lamp = lit(0.45, 0.12);
  P.core = lit(0.6, 0.2);
  P.neon = lit(0.3, 0.05);
  P.rune = lit(0.5, 0.15);
  P.crystal = lit(0.35, 0.0);
  P.lava = { top: mixRGB(light, [255, 230, 120], 0.35), side: mixRGB(light, [120, 20, 0], night ? 0.15 : 0.3), fringe: null, glow: true };
  return P;
}

/* ---------------- world generation ---------------- */
const K = (x, y, z) => (x + 96) * 65536 + (y + 96) * 256 + (z + 96);

function makeWorld(biome, seed) {
  const rand = rng(seed);
  const nz = noise2(rand);
  const V = new Map();
  const set = (x, y, z, m) => V.set(K(x, y, z), { x, y, z, m });
  const del = (x, y, z) => V.delete(K(x, y, z));
  const has = (x, y, z) => V.has(K(x, y, z));
  const R = (a, b) => a + Math.floor(rand() * (b - a + 1));

  function island(cx0, cy0, cz0, rad, o) {
    const cols = [];
    for (let x = -rad; x <= rad; x++) for (let y = -rad; y <= rad; y++) {
      const shape = o.square ? Math.max(Math.abs(x), Math.abs(y)) / rad + (Math.abs(x) === rad && Math.abs(y) === rad ? 1 : 0) * 0.2 : Math.hypot(x, y) / rad;
      const d = shape + (nz((x + cx0) * 0.23 + 3.1, (y + cy0) * 0.23 + 7.7) - 0.5) * o.rough;
      if (d > 1) continue;
      const t = 1 - Math.max(0, d);
      const h = Math.max(0, Math.round(o.hBase + t * o.hAmp + (nz((x + cx0) * 0.37 + 11.3, (y + cy0) * 0.37 + 5.9) - 0.5) * o.hNoise));
      const depth = Math.max(1, Math.round(Math.pow(t, 0.7) * o.depth + rand() * 1.4));
      for (let z = -depth; z <= h; z++) {
        let m = z === h ? o.top : z >= h - (o.subDepth || 1) ? o.sub : o.rock;
        if (o.ore && z < h - 1 && rand() < o.ore[1]) m = o.ore[0];
        if (o.deep && z <= -depth + 1) m = o.deep;
        set(cx0 + x, cy0 + y, cz0 + z, m);
      }
      cols.push({ x: cx0 + x, y: cy0 + y, h: cz0 + h, t, bottom: cz0 - depth });
    }
    return cols;
  }
  const taken = new Set();
  const free = (c, r = 1) => {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (taken.has((c.x + dx) + ',' + (c.y + dy))) return false;
    return true;
  };
  const take = (c, r = 1) => { for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) taken.add((c.x + dx) + ',' + (c.y + dy)); };
  const pick = (cols, minT, r = 1, tries = 60) => {
    for (let i = 0; i < tries; i++) {
      const c = cols[Math.floor(rand() * cols.length)];
      if (c.t >= minT && free(c, r)) { take(c, r); return c; }
    }
    return null;
  };
  const colAt = (cols, x, y) => cols.find((c) => c.x === x && c.y === y);
  function tree(c, trunk = 3, leaf = 'leaf') {
    for (let i = 1; i <= trunk; i++) set(c.x, c.y, c.h + i, 'log');
    const top = c.h + trunk;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = 0; dz <= 1; dz++) {
      if (dz === 1 && Math.abs(dx) + Math.abs(dy) === 2) continue;
      if (dx === 0 && dy === 0 && dz === 0) continue;
      set(c.x + dx, c.y + dy, top + dz, leaf);
    }
    set(c.x, c.y, top + 2, leaf);
  }
  function hangingCrystals(cols, n, mat = 'crystal') {
    for (let i = 0; i < n; i++) {
      const c = cols[Math.floor(rand() * cols.length)];
      if (c.t < 0.35) continue;
      const len = R(1, 3);
      for (let k = 1; k <= len; k++) set(c.x, c.y, c.bottom - k, mat);
    }
  }

  if (biome === 'meadow') {
    const cols = island(0, 0, 0, 9, { top: 'grass', sub: 'dirt', rock: 'stone', deep: 'deep', hBase: 1, hAmp: 2.2, hNoise: 2.4, depth: 7, rough: 0.5, subDepth: 2, ore: ['deep', 0.08] });
    // pond
    const pc = pick(cols, 0.5, 2);
    if (pc) {
      const pond = cols.filter((c) => Math.hypot(c.x - pc.x, c.y - pc.y) < 2.3);
      const lvl = Math.min(...pond.map((c) => c.h)) - 0;
      pond.forEach((c) => { for (let z = lvl; z <= c.h; z++) del(c.x, c.y, z); set(c.x, c.y, lvl - 1, 'sand'); set(c.x, c.y, lvl, 'water'); c.h = lvl; take(c, 0); });
      pond.forEach((c) => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const n = colAt(cols, c.x + dx, c.y + dy); if (n && !pond.includes(n) && n.h > lvl) { /* bank */ } } });
    }
    // cabin
    const cab = pick(cols, 0.55, 2);
    if (cab) {
      const z0 = cab.h;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const c = colAt(cols, cab.x + dx, cab.y + dy);
        if (c) for (let z = c.h + 1; z <= z0; z++) set(c.x, c.y, z, 'dirt');
        const edge = Math.abs(dx) === 1 || Math.abs(dy) === 1;
        for (let z = z0 + 1; z <= z0 + 2; z++) if (edge) set(cab.x + dx, cab.y + dy, z, 'plank');
      }
      del(cab.x, cab.y + 1, z0 + 1); // door
      set(cab.x + 1, cab.y, z0 + 2, 'lamp'); // window
      set(cab.x, cab.y + 1, z0 + 2, 'lamp');
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (Math.abs(dx) <= 1 || Math.abs(dy) <= 1) set(cab.x + dx, cab.y + dy, z0 + 3, 'roof');
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) set(cab.x + dx, cab.y + dy, z0 + 4, 'roof');
      set(cab.x, cab.y, z0 + 5, 'roof');
    }
    for (let i = 0; i < 5; i++) { const c = pick(cols, 0.25, 1); if (c) tree(c, R(2, 4)); }
    for (let i = 0; i < 6; i++) { const c = pick(cols, 0.2, 0); if (c) { set(c.x, c.y, c.h + 1, 'log'); set(c.x, c.y, c.h + 2, 'lamp'); } }
    for (let i = 0; i < 14; i++) { const c = pick(cols, 0.1, 0); if (c && has(c.x, c.y, c.h) && V.get(K(c.x, c.y, c.h)).m === 'grass') set(c.x, c.y, c.h, 'path'); }
  } else if (biome === 'techno') {
    const cols = island(0, 0, 0, 9, { top: 'plate', sub: 'metal', rock: 'deep', hBase: 1.5, hAmp: 1.2, hNoise: 1.2, depth: 7, rough: 0.35, ore: ['copper', 0.12] });
    cols.forEach((c) => { const v = V.get(K(c.x, c.y, c.h)); if (v && ((c.x + c.y) & 1) === 0 && nz(c.x * 0.4, c.y * 0.4) > 0.55) v.m = 'grass'; else if (v && ((c.x % 3 === 0) || (c.y % 3 === 0))) v.m = 'metal'; });
    // central tower with soul core
    const t = { x: 0, y: 0, h: Math.max(...cols.filter((c) => Math.abs(c.x) <= 1 && Math.abs(c.y) <= 1).map((c) => c.h)) };
    for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) take({ x: dx, y: dy }, 1);
    for (let z = t.h + 1; z <= t.h + 9; z++) for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) {
      const ring = z === t.h + 4 || z === t.h + 8;
      set(dx, dy, z, ring ? 'core' : (z % 3 === 0 ? 'copper' : 'metal'));
    }
    set(0, 0, t.h + 10, 'core'); set(1, 1, t.h + 10, 'metal'); set(1, 0, t.h + 10, 'metal'); set(0, 1, t.h + 10, 'metal');
    // machines + pipes
    for (let i = 0; i < 4; i++) {
      const c = pick(cols, 0.3, 1);
      if (!c) continue;
      for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) for (let z = 1; z <= 2; z++) set(c.x + dx, c.y + dy, c.h + z, z === 2 && dx === 0 && dy === 0 ? 'core' : 'metal');
      const steps = Math.abs(c.x) + Math.abs(c.y);
      let x = c.x, y = c.y;
      for (let s = 0; s < steps && s < 12; s++) {
        if (Math.abs(x) > 1) x -= Math.sign(x); else if (Math.abs(y) > 1) y -= Math.sign(y); else break;
        const col = colAt(cols, x, y);
        if (col && !has(x, y, col.h + 1)) set(x, y, col.h + 1, 'copper');
      }
    }
    // floating runes
    for (let i = 0; i < 6; i++) { const c = cols[Math.floor(rand() * cols.length)]; if (c.t > 0.2) set(c.x, c.y, c.h + R(4, 8), 'rune'); }
    hangingCrystals(cols, 4, 'core');
  } else if (biome === 'arena') {
    const cols = island(0, 0, 0, 8, { top: 'tile', sub: 'quartz', rock: 'deep', hBase: 2, hAmp: 0, hNoise: 0, depth: 6, rough: 0.08, square: true });
    cols.forEach((c) => { const v = V.get(K(c.x, c.y, c.h)); if (v) v.m = ((c.x + c.y) & 1) ? 'tile' : 'tile2'; });
    const edge = cols.filter((c) => Math.max(Math.abs(c.x), Math.abs(c.y)) >= 7);
    edge.forEach((c) => { if (((c.x + c.y) & 1) === 0) V.get(K(c.x, c.y, c.h)).m = 'neon'; });
    const teams = [['teamA', 5, 5], ['teamB', -5, 5], ['teamC', 5, -5], ['teamD', -5, -5]];
    teams.forEach(([m, bx, by]) => {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) set(bx + dx, by + dy, 3, m);
      set(bx, by, 4, m); set(bx + Math.sign(bx) * 0, by, 5, m);
      take({ x: bx, y: by }, 1);
    });
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { set(dx, dy, 3, 'quartz'); set(dx, dy, 4, 'quartz'); }
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (Math.abs(dx) + Math.abs(dy) < 2) set(dx, dy, 5, 'quartz');
    set(0, 0, 6, 'neon'); set(0, 0, 7, 'neon');
    // bridges
    for (let i = 2; i <= 4; i++) { set(i, i, 3, 'tile2'); set(-i, i, 3, 'tile2'); set(i, -i, 3, 'tile2'); set(-i, -i, 3, 'tile2'); }
    for (let i = 0; i < 5; i++) { const c = cols[Math.floor(rand() * cols.length)]; set(c.x, c.y, c.h + R(5, 8), 'neon'); }
  } else if (biome === 'nether') {
    const cols = island(0, 0, 0, 9, { top: 'nether', sub: 'nether', rock: 'basalt', deep: 'obsidian', hBase: 1, hAmp: 3, hNoise: 3.4, depth: 8, rough: 0.6, ore: ['lava', 0.03] });
    cols.forEach((c) => { const v = V.get(K(c.x, c.y, c.h)); if (v && nz(c.x * 0.3 + 40, c.y * 0.3) > 0.62) v.m = 'ash'; });
    for (let p = 0; p < 2; p++) {
      const pc = pick(cols, 0.35, 2);
      if (!pc) continue;
      const pool = cols.filter((c) => Math.hypot(c.x - pc.x, c.y - pc.y) < 1.9);
      const lvl = Math.min(...pool.map((c) => c.h));
      pool.forEach((c) => { for (let z = lvl; z <= c.h; z++) del(c.x, c.y, z); set(c.x, c.y, lvl, 'lava'); c.h = lvl; });
    }
    for (let i = 0; i < 5; i++) { const c = pick(cols, 0.15, 1); if (c) { const hh = R(2, 6); for (let z = 1; z <= hh; z++) set(c.x, c.y, c.h + z, 'basalt'); if (rand() < 0.5) set(c.x, c.y, c.h + hh + 1, 'lava'); } }
    // ruined obsidian arch
    const a = pick(cols, 0.5, 2);
    if (a) { for (let z = 1; z <= 4; z++) { set(a.x - 1, a.y, a.h + z, 'obsidian'); if (z < 3) set(a.x + 2, a.y, a.h + z, 'obsidian'); } set(a.x, a.y, a.h + 4, 'obsidian'); set(a.x + 1, a.y, a.h + 4, 'obsidian'); set(a.x, a.y, a.h + 1, 'lava'); }
    // lavafall off the edge
    const rim = cols.filter((c) => c.t < 0.2 && c.x > 0 && c.y > 0).sort((p, q) => (q.x + q.y) - (p.x + p.y))[0];
    if (rim) for (let z = rim.h; z >= rim.bottom - 4; z--) set(rim.x + 1, rim.y + 1, z, 'lava');
  } else if (biome === 'sky') {
    const main = island(0, 0, 0, 6, { top: 'grass', sub: 'dirt', rock: 'stone', hBase: 1, hAmp: 1.5, hNoise: 1.6, depth: 6, rough: 0.45, subDepth: 2 });
    const a = island(-8, 4, -3, 3, { top: 'grass', sub: 'dirt', rock: 'stone', hBase: 0, hAmp: 1, hNoise: 1, depth: 4, rough: 0.3 });
    const b = island(5, -8, 4, 3, { top: 'snow', sub: 'stone', rock: 'stone', hBase: 0, hAmp: 1, hNoise: 1, depth: 4, rough: 0.3 });
    const c0 = pick(main, 0.4, 1); if (c0) tree(c0, 3);
    [main, a, b].forEach((cols, i) => {
      for (let k = 0; k < (i === 0 ? 5 : 2); k++) {
        const c = pick(cols, 0.2, 0);
        if (c) { const hh = R(1, i === 0 ? 3 : 2); for (let z = 1; z <= hh; z++) set(c.x, c.y, c.h + z, 'crystal'); }
      }
      hangingCrystals(cols, i === 0 ? 5 : 2);
    });
    // clouds
    for (let n = 0; n < 4; n++) {
      const cx1 = R(-10, 10), cy1 = R(-10, 10), cz1 = R(-9, -4);
      for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) if (rand() < 0.8 && !has(cx1 + dx, cy1 + dy, cz1)) set(cx1 + dx, cy1 + dy, cz1, 'cloud');
    }
  }
  const list = [...V.values()];
  list.sort((p, q) => (p.x + p.y + p.z) - (q.x + q.y + q.z) || p.z - q.z || p.x - q.x);
  return { list, has, get: (x, y, z) => V.get(K(x, y, z)), bb: bounds(list) };
}

/* ---------------- rasterizer ---------------- */
function bounds(list) {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (const v of list) {
    const sx = v.x - v.y, sy = (v.x + v.y) / 2 - v.z;
    if (sx - 1 < a) a = sx - 1; if (sx + 1 > b) b = sx + 1;
    if (sy - 0.5 < c) c = sy - 0.5; if (sy + 1.5 > d) d = sy + 1.5;
  }
  return { minX: a, maxX: b, minY: c, maxY: d };
}

function shade(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
function hash3(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

function fit(bb, w, h, pixel, fill) {
  const cands = pixel === 'auto' ? [4, 3, 2] : [pixel];
  let best = null;
  for (const px of cands) {
    const W = Math.max(8, Math.ceil(w / px)), H = Math.max(8, Math.ceil(h / px));
    let u = Math.floor(Math.min((W * fill) / (bb.maxX - bb.minX), (H * fill) / (bb.maxY - bb.minY)));
    u = Math.max(2, u - (u % 2));
    const got = Math.max(((bb.maxX - bb.minX) * u) / W, ((bb.maxY - bb.minY) * u) / H);
    const score = Math.abs(fill - got) + (u < 4 ? 0.5 : 0) + (u > 10 ? 0.2 : 0);
    if (!best || score < best.score - 0.04) best = { px, W, H, u, score };
  }
  return best;
}

function paint(world, ctx, gctx, W, H, P, u, fx, fy, night) {
  const { list, has } = world;
  const bb = world.bb;
  const h = u >> 1;
  const ox = Math.round(W * fx - ((bb.minX + bb.maxX) / 2) * u);
  const oy = Math.round(H * fy - ((bb.minY + bb.maxY) / 2) * u);
  ctx.clearRect(0, 0, W, H);
  gctx.clearRect(0, 0, W, H);
  const fr = (c, x, y, w, hh, g) => { const s = rgbStr(c); ctx.fillStyle = s; ctx.fillRect(x, y, w, hh); if (g) { gctx.fillStyle = s; gctx.fillRect(x, y, w, hh); } };
  for (const v of list) {
    const mat = P[v.m];
    if (!mat) continue;
    const sx = ox + (v.x - v.y) * u;
    const sy = oy + ((v.x + v.y) * u) / 2 - v.z * u;
    const j = 0.94 + hash3(v.x, v.y, v.z) * 0.1;
    const g = mat.glow;
    const showTop = !has(v.x, v.y, v.z + 1);
    const showL = !has(v.x, v.y + 1, v.z);
    const showR = !has(v.x + 1, v.y, v.z);
    if (showTop) {
      let k = j;
      if (!g && (has(v.x - 1, v.y, v.z + 1) || has(v.x, v.y - 1, v.z + 1))) k *= night ? 0.8 : 0.86;
      const top = shade(mat.top, k);
      for (let r = 0; r < u; r++) {
        const kk = r < h ? r : u - 1 - r;
        const w = 2 * (kk + 1);
        fr(top, sx - w, sy - h + r, 2 * w, 1, g);
      }
      // texture specks
      const n = u >= 6 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const q = hash3(v.x + i * 7, v.y - i * 3, v.z + 11);
        const r = 1 + Math.floor(q * (u - 2));
        const kk = r < h ? r : u - 1 - r;
        const w = 2 * (kk + 1);
        const px = sx - w + 1 + Math.floor(hash3(v.y, v.x + i, 5) * Math.max(1, 2 * w - 2));
        fr(shade(mat.top, q > 0.5 ? 1.1 : 0.88), px, sy - h + r, 1, 1, g);
      }
    }
    const sideL = shade(mat.side, (g ? 0.95 : 0.84) * j);
    const sideR = shade(mat.side, (g ? 0.82 : 0.66) * j);
    if (showL) {
      for (let c = 0; c < u; c++) {
        const yTop = sy + h + 1 - Math.ceil((u - c) / 2);
        fr(sideL, sx - u + c, yTop, 1, u, g);
        if (mat.fringe && showTop) fr(shade(mat.fringe, 0.84 * j), sx - u + c, yTop, 1, u >= 8 ? 2 : 1, false);
      }
    }
    if (showR) {
      for (let c = 0; c < u; c++) {
        const cc = u - 1 - c;
        const yTop = sy + h + 1 - Math.ceil((u - cc) / 2);
        fr(sideR, sx + c, yTop, 1, u, g);
        if (mat.fringe && showTop) fr(shade(mat.fringe, 0.68 * j), sx + c, yTop, 1, u >= 8 ? 2 : 1, false);
      }
    }
  }
  return { u, ox, oy, bb, box: { x: ox + bb.minX * u, y: oy + bb.minY * u, w: (bb.maxX - bb.minX) * u, h: (bb.maxY - bb.minY) * u } };
}

const BIOMES = ['meadow', 'techno', 'arena', 'nether', 'sky'];

/**
 * Procedural voxel island for a realm. Fills its container.
 * biome: meadow | techno | arena | nether | sky · light: CSS color for lamps/glow · pixel: CSS px per art pixel.
 */
export function VoxelArt({ biome = 'meadow', light = 'var(--luma)', seed = 7, pixel = 'auto', fill = 0.8, focusX = 0.5, focusY = 0.52, animate = true, backdrop = true, particles = 36, className, style, children }) {
  const wrap = useRef(null), base = useRef(null), glowA = useRef(null), glowB = useRef(null), back = useRef(null), front = useRef(null);
  const theme = useTheme();
  const reduced = useReducedMotion();
  const size = useSize(wrap);
  const [lightRGB, setLightRGB] = useState([212, 255, 61]);
  const layout = useRef(null);
  useLayoutEffect(() => { if (wrap.current) setLightRGB(resolveColor(light, wrap.current)); }, [light, theme]);
  const world = useMemo(() => makeWorld(BIOMES.includes(biome) ? biome : 'meadow', hashStr(biome + ':' + seed)), [biome, seed]);
  const night = theme !== 'day';

  const [px, setPx] = useState(3);
  useEffect(() => {
    if (!size.w || !base.current) return;
    const f = fit(world.bb, size.w, size.h, pixel, fill);
    const { W, H, u } = f;
    for (const c of [base.current, glowA.current, glowB.current, back.current, front.current]) {
      c.width = W; c.height = H;
      c.style.width = W * f.px + 'px'; c.style.height = H * f.px + 'px';
    }
    setPx(f.px);
    const ctx = base.current.getContext('2d'), g = glowA.current.getContext('2d');
    const P = palette(theme, lightRGB);
    layout.current = paint(world, ctx, g, W, H, P, u, focusX, focusY, night);
    const g2 = glowB.current.getContext('2d');
    g2.clearRect(0, 0, W, H);
    g2.drawImage(glowA.current, 0, 0);
  }, [world, size.w, size.h, theme, lightRGB, pixel, fill, focusX, focusY]);

  // stars (behind) + particles (front)
  useEffect(() => {
    if (!size.w || !front.current) return;
    const W = front.current.width, H = front.current.height;
    const fctx = front.current.getContext('2d'), bctx = back.current.getContext('2d');
    const r = rng(hashStr('fx' + seed + biome));
    const stars = night ? Array.from({ length: Math.round((W * H) / 260) }, () => ({ x: Math.floor(r() * W), y: Math.floor(r() * H * 0.75), a: 0.25 + r() * 0.6, p: r() * 6.28, s: r() < 0.12 ? 2 : 1 })) : [];
    const lay = layout.current;
    const box = lay ? lay.box : { x: 0, y: 0, w: W, h: H };
    const rising = biome !== 'sky' && biome !== 'arena';
    const spawn = (init) => ({
      x: box.x + r() * box.w,
      y: init ? box.y + r() * box.h : box.y + box.h * (rising ? 0.55 + r() * 0.4 : r()),
      vy: (rising ? 0.06 + r() * 0.12 : 0.02 + r() * 0.04) * (r() < 0.5 && !rising ? -1 : 1),
      ph: r() * 6.28, life: 0, max: 140 + r() * 220,
    });
    const N = night ? particles : Math.round(particles * 0.45);
    const ps = Array.from({ length: N }, () => spawn(true));
    const L = lightRGB;
    let raf = 0, t = 0, visible = true, last = 0;
    const draw = () => {
      bctx.clearRect(0, 0, W, H);
      for (const s of stars) {
        const a = s.a * (0.6 + 0.4 * Math.sin(t * 0.03 + s.p));
        bctx.fillStyle = `rgba(235,240,230,${a})`;
        bctx.fillRect(s.x, s.y, s.s, s.s);
      }
      fctx.clearRect(0, 0, W, H);
      for (const p of ps) {
        const k = Math.sin((Math.PI * p.life) / p.max);
        const x = Math.round(p.x + Math.sin(t * 0.02 + p.ph) * 3), y = Math.round(p.y);
        if (night) {
          fctx.fillStyle = rgbStr(L, 0.18 * k); fctx.fillRect(x - 1, y - 1, 3, 3);
          fctx.fillStyle = rgbStr(mixRGB(L, [255, 255, 255], 0.35), 0.95 * k); fctx.fillRect(x, y, 1, 1);
        } else {
          fctx.fillStyle = `rgba(255,255,255,${0.75 * k})`; fctx.fillRect(x, y, 1, 1);
        }
      }
    };
    const step = (ts) => {
      raf = requestAnimationFrame(step);
      if (!visible || ts - last < 33) return;
      last = ts; t++;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.life++; p.y -= p.vy;
        if (p.life > p.max || p.y < box.y - 10) ps[i] = spawn(false);
      }
      draw();
    };
    draw();
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(wrap.current);
    if (animate && !reduced) raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [size.w, size.h, theme, lightRGB, animate, reduced, biome, seed, particles, world, pixel, fill, focusX, focusY, px]);

  return (
    <div ref={wrap} className={cx('lm-voxel', !animate || reduced ? 'is-still' : null, className)} data-biome={biome}
      style={{ '--vx-light': rgbStr(lightRGB), '--vx-px': px + 'px', '--vx-fx': focusX * 100 + '%', '--vx-fy': focusY * 100 + '%', ...style }}>
      {backdrop ? <div className="lm-voxel-sky" aria-hidden="true" /> : null}
      <canvas ref={back} className="lm-voxel-back" aria-hidden="true" />
      <div className="lm-voxel-island" aria-hidden="true">
        <canvas ref={glowB} className="lm-voxel-glow lm-voxel-glow--wide" />
        <canvas ref={base} className="lm-voxel-base" />
        <canvas ref={glowA} className="lm-voxel-glow" />
      </div>
      <canvas ref={front} className="lm-voxel-front" aria-hidden="true" />
      {children ? <div className="lm-voxel-content">{children}</div> : null}
    </div>
  );
}
VoxelArt.biomes = BIOMES;
