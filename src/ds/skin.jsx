// SkinViewer — a CSS 3D player model that reads standard 64×64 skins (and 64×32 capes).
// Ships with an original default skin, "Luma Walker" (hood, lit visor, lit soles), and a Luma cape.
import { cx, useReducedMotion } from './util.js';
import * as React from 'react';
const { useMemo, useRef, useState, useEffect } = React;

const PAL = {
  H: '#262a31', h: '#1c1f25', G: '#343a43', L: '#d4ff3d', l: '#9fc21f', W: '#f4ffc6', S: '#c99572', s: '#a6765a',
  D: '#121419', P: '#3b4049', p: '#2e323a', B: '#15171a', K: '#30353e', k: '#23272e', M: '#8a9199',
};
function paintMap(ctx, x0, y0, rows) {
  rows.forEach((row, y) => row.split('').forEach((ch, x) => { if (ch !== '.') { ctx.fillStyle = PAL[ch] || ch; ctx.fillRect(x0 + x, y0 + y, 1, 1); } }));
}
const fill = (ctx, x, y, w, h, c) => { ctx.fillStyle = PAL[c] || c; ctx.fillRect(x, y, w, h); };
const rowsOf = (w, h, f) => Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => f(x, y)).join(''));

let SKIN_URL = null, CAPE_URL = null;
/** Data URL of the default skin (64×64 PNG). */
export function defaultSkin() {
  if (SKIN_URL) return SKIN_URL;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  // head
  paintMap(x, 8, 0, rowsOf(8, 8, (i, j) => (j === 0 || j === 7 || i === 0 || i === 7 ? 'H' : (i + j) % 5 === 0 ? 'G' : 'H')));
  paintMap(x, 16, 0, rowsOf(8, 8, () => 'k'));
  paintMap(x, 8, 8, ['HHHHHHHH', 'HGGGGGGH', 'HDDDDDDH', 'HLLWWLLH', 'HDSSSSDH', 'HDSssSDH', 'HKKKKKKH', 'HKkLKkKH']);
  paintMap(x, 0, 8, ['HHHHHHHH', 'HHHHHGGG', 'HHHHHHDD', 'HHHHHHlL', 'HHHHHHDS', 'HHHHHHDS', 'HHHHHHKK', 'HHHHHHKK']);
  paintMap(x, 16, 8, ['HHHHHHHH', 'GGGHHHHH', 'DDHHHHHH', 'LlHHHHHH', 'SDHHHHHH', 'SDHHHHHH', 'KKHHHHHH', 'KKHHHHHH']);
  paintMap(x, 24, 8, ['HHHHHHHH', 'HHHGGHHH', 'HHHHHHHH', 'HHHHHHHH', 'HHHHHHHH', 'HHHLLHHH', 'hhhLLhhh', 'hhhhhhhh']);
  // body
  paintMap(x, 20, 16, ['KKKKKKKK', 'KkkkkkkK', 'KkkkkkkK', 'KKKKKKKK']);
  paintMap(x, 28, 16, rowsOf(8, 4, () => 'D'));
  paintMap(x, 20, 20, ['KKKkkKKK', 'HHLHHLHH', 'HHLHHLHH', 'HHHHHLLH', 'HHHHHlLH', 'HHHHHHHH', 'HhhhhhhH', 'HhHHHHhH', 'HhHHHHhH', 'HhhhhhhH', 'HHHHHHHH', 'DDDDDDDD']);
  paintMap(x, 32, 20, ['KKKKKKKK', 'HHHHHHHH', 'HGHHHHGH', 'LLLLLLLL', 'HHHHHHHH', 'HHHHHHHH', 'HHHHHHHH', 'HHHGGHHH', 'HHHHHHHH', 'hhhhhhhh', 'HHHHHHHH', 'DDDDDDDD']);
  paintMap(x, 16, 20, rowsOf(4, 12, (i, j) => (j === 11 ? 'D' : j === 0 ? 'K' : 'H')));
  paintMap(x, 28, 20, rowsOf(4, 12, (i, j) => (j === 11 ? 'D' : j === 0 ? 'K' : 'H')));
  // arms (right at 40,16 · left at 32,48)
  const armSide = (front) => rowsOf(4, 12, (i, j) => (j < 9 ? (front && i === 1 && j > 1 && j < 8 ? 'G' : j === 0 ? 'K' : 'H') : j === 9 ? 'L' : j === 10 ? 'S' : 's'));
  for (const [ox, oy] of [[40, 16], [32, 48]]) {
    paintMap(x, ox + 4, oy, rowsOf(4, 4, () => 'K'));
    paintMap(x, ox + 8, oy, rowsOf(4, 4, () => 'S'));
    paintMap(x, ox, oy + 4, armSide(false));
    paintMap(x, ox + 4, oy + 4, armSide(true));
    paintMap(x, ox + 8, oy + 4, armSide(false));
    paintMap(x, ox + 12, oy + 4, armSide(false));
  }
  // legs (right at 0,16 · left at 16,48)
  const legSide = (front) => rowsOf(4, 12, (i, j) => (j < 8 ? (j === 5 && front ? 'p' : j === 0 ? 'p' : 'P') : j < 11 ? (j === 8 ? 'B' : 'B') : 'L'));
  for (const [ox, oy] of [[0, 16], [16, 48]]) {
    paintMap(x, ox + 4, oy, rowsOf(4, 4, () => 'P'));
    paintMap(x, ox + 8, oy, rowsOf(4, 4, () => 'L'));
    paintMap(x, ox, oy + 4, legSide(false));
    paintMap(x, ox + 4, oy + 4, legSide(true));
    paintMap(x, ox + 8, oy + 4, legSide(false));
    paintMap(x, ox + 12, oy + 4, legSide(false));
  }
  SKIN_URL = c.toDataURL('image/png');
  return SKIN_URL;
}

/** Data URL of the default Luma cape (64×32 PNG). */
export function defaultCape() {
  if (CAPE_URL) return CAPE_URL;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const x = c.getContext('2d');
  fill(x, 0, 0, 22, 17, 'B');
  // outer face (1,1) 10×16: dark with a lit block and light steps at the hem
  paintMap(x, 1, 1, [
    'BBBBBBBBBB', 'BkkkkkkkkB', 'BkkkkkkkkB', 'BkkkLLkkkB', 'BkkLLLLkkB', 'BkLLLLLLkB', 'BkHkLLkHkB', 'BkHkHHkHkB',
    'BkkHHHHkkB', 'BkkkkkkkkB', 'BkkkkkkkkB', 'BkkkkkkkkB', 'BlkkkkkklB', 'BLlkkkklLB', 'LLLlkklLLL', 'LLLLLLLLLL']);
  fill(x, 12, 1, 10, 16, '#1a2008');
  fill(x, 0, 1, 1, 16, 'k'); fill(x, 11, 1, 1, 16, 'k');
  fill(x, 1, 0, 10, 1, 'k'); fill(x, 11, 0, 10, 1, 'L');
  CAPE_URL = c.toDataURL('image/png');
  return CAPE_URL;
}

const BOX = { head: [8, 8, 8], body: [8, 12, 4], arm: [4, 12, 4], leg: [4, 12, 4], cape: [10, 16, 1] };
const UV = { head: [0, 0], body: [16, 16], rarm: [40, 16], larm: [32, 48], rleg: [0, 16], lleg: [16, 48], cape: [0, 0] };

function Cuboid({ size, uv, tex, texH = 64, k, offset = [0, 0, 0], className }) {
  const [w, h, d] = size, [u, v] = uv;
  const face = (name, fw, fh, fu, fv, tf) => (
    <div key={name} className={'lm-skin-face lm-skin-face--' + name}
      style={{ width: fw * k, height: fh * k, marginLeft: (-fw * k) / 2, marginTop: (-fh * k) / 2, transform: tf,
        backgroundImage: `url(${tex})`, backgroundSize: `${64 * k}px ${texH * k}px`, backgroundPosition: `${-fu * k}px ${-fv * k}px` }} />
  );
  return (
    <div className={cx('lm-skin-cuboid', className)} style={{ transform: `translate3d(${offset[0] * k}px, ${offset[1] * k}px, ${offset[2] * k}px)` }}>
      {face('front', w, h, u + d, v + d, `translateZ(${(d * k) / 2}px)`)}
      {face('back', w, h, u + d + w + d, v + d, `rotateY(180deg) translateZ(${(d * k) / 2}px)`)}
      {face('right', d, h, u, v + d, `rotateY(-90deg) translateZ(${(w * k) / 2}px)`)}
      {face('left', d, h, u + d + w, v + d, `rotateY(90deg) translateZ(${(w * k) / 2}px)`)}
      {face('top', w, d, u + d, v, `rotateX(90deg) translateZ(${(h * k) / 2}px)`)}
      {face('bottom', w, d, u + d + w, v, `rotateX(-90deg) translateZ(${(h * k) / 2}px)`)}
    </div>
  );
}

function Part({ pivot, k, swing, children, look }) {
  return (
    <div className="lm-skin-part" style={{ transform: `translate3d(${pivot[0] * k}px, ${pivot[1] * k}px, ${pivot[2] * k}px)${look ? ` rotateY(${look[0]}deg) rotateX(${look[1]}deg)` : ''}` }}>
      <div className={cx('lm-skin-swing', swing)}>{children}</div>
    </div>
  );
}

/**
 * SkinViewer — drag to rotate. pose: idle | walk | wave. skin/cape: image URLs (64×64 / 64×32); cape={false} hides it.
 */
export function SkinViewer({ skin, cape, pose = 'idle', scale = 8, angle = -28, autoRotate = true, interactive = true, pedestal = true, light = 'var(--luma)', className, style, label = 'Скин игрока' }) {
  const reduced = useReducedMotion();
  const tex = useMemo(() => skin || defaultSkin(), [skin]);
  const capeTex = useMemo(() => (cape === false ? null : cape || defaultCape()), [cape]);
  const [rot, setRot] = useState(angle);
  const [tilt, setTilt] = useState(-8);
  const [look, setLook] = useState([0, 0]);
  const drag = useRef(null), idleAt = useRef(0), stage = useRef(null);
  useEffect(() => setRot(angle), [angle]);
  useEffect(() => {
    if (!autoRotate || reduced) return;
    let raf = 0, last = performance.now();
    const step = (t) => {
      raf = requestAnimationFrame(step);
      const dt = Math.min(64, t - last); last = t;
      if (!drag.current && t - idleAt.current > 2400) setRot((r) => r + dt * 0.018);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate, reduced]);
  const k = scale;
  const onDown = (e) => {
    if (!interactive) return;
    drag.current = { x: e.clientX, y: e.clientY, r: rot, t: tilt };
    e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    const el = stage.current;
    if (drag.current) {
      setRot(drag.current.r + (e.clientX - drag.current.x) * 0.6);
      setTilt(Math.max(-30, Math.min(20, drag.current.t - (e.clientY - drag.current.y) * 0.25)));
      idleAt.current = performance.now();
    } else if (el && interactive) {
      const r = el.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.3;
      setLook([Math.max(-35, Math.min(35, nx * 70)), Math.max(-20, Math.min(20, -ny * 40))]);
    }
  };
  const onUp = () => { drag.current = null; idleAt.current = performance.now(); };
  const onKey = (e) => {
    if (e.key === 'ArrowLeft') { setRot((r) => r - 15); idleAt.current = performance.now(); }
    if (e.key === 'ArrowRight') { setRot((r) => r + 15); idleAt.current = performance.now(); }
  };
  const swingArm = pose === 'walk' ? 'is-walk-a' : pose === 'wave' ? 'is-wave' : 'is-idle-a';
  const swingArmL = pose === 'walk' ? 'is-walk-b' : 'is-idle-b';
  const swingLegR = pose === 'walk' ? 'is-walk-b' : null;
  const swingLegL = pose === 'walk' ? 'is-walk-a' : null;
  return (
    <div className={cx('lm-skin', interactive && 'is-interactive', className)} style={{ '--k': k + 'px', '--skin-light': light, ...style }}
      ref={stage} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => { onUp(); setLook([0, 0]); }}
      tabIndex={interactive ? 0 : undefined} onKeyDown={onKey} role="img" aria-label={label + ' — перетащи, чтобы повернуть'}>
      {pedestal ? <div className="lm-skin-pedestal" aria-hidden="true"><i /><i /></div> : null}
      <div className="lm-skin-stage">
        <div className={cx('lm-skin-model', pose === 'walk' && 'is-walking')} style={{ transform: `rotateX(${tilt}deg) rotateY(${rot}deg)` }}>
          <Part pivot={[0, -8, 0]} k={k} look={look}><Cuboid size={BOX.head} uv={UV.head} tex={tex} k={k} offset={[0, -4, 0]} className="is-head" /></Part>
          <Part pivot={[0, -2, 0]} k={k}><Cuboid size={BOX.body} uv={UV.body} tex={tex} k={k} /></Part>
          <Part pivot={[-6, -7, 0]} k={k} swing={swingArm}><Cuboid size={BOX.arm} uv={UV.rarm} tex={tex} k={k} offset={[0, 5, 0]} /></Part>
          <Part pivot={[6, -7, 0]} k={k} swing={swingArmL}><Cuboid size={BOX.arm} uv={UV.larm} tex={tex} k={k} offset={[0, 5, 0]} /></Part>
          <Part pivot={[-2, 4, 0]} k={k} swing={swingLegR}><Cuboid size={BOX.leg} uv={UV.rleg} tex={tex} k={k} offset={[0, 6, 0]} /></Part>
          <Part pivot={[2, 4, 0]} k={k} swing={swingLegL}><Cuboid size={BOX.leg} uv={UV.lleg} tex={tex} k={k} offset={[0, 6, 0]} /></Part>
          {capeTex ? (
            <Part pivot={[0, -8, -2]} k={k} swing={pose === 'walk' ? 'is-cape-walk' : 'is-cape'}>
              <div className="lm-skin-capeflip"><Cuboid size={BOX.cape} uv={UV.cape} tex={capeTex} texH={32} k={k} offset={[0, 8, 0.5]} /></div>
            </Part>
          ) : null}
        </div>
      </div>
    </div>
  );
}
