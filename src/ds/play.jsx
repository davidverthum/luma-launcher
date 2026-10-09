// PlayButton — the one lit thing on the screen. Pixel-stepped corners: the door from the smooth launcher into the pixel game.
import { cx, useInterval } from './util.js';
import { Icon } from './icons.jsx';
import { Led } from './led.jsx';
import * as React from 'react';
const { useState, useEffect, useRef } = React;

const COPY = {
  ready: { label: 'Играть', icon: 'play' },
  update: { label: 'Обновить', icon: 'download' },
  downloading: { label: 'Загрузка', icon: 'download' },
  launching: { label: 'Запуск', icon: 'bolt' },
  playing: { label: 'В игре', icon: 'stop' },
  queue: { label: 'Очередь', icon: 'hourglass' },
  offline: { label: 'Недоступно', icon: 'lock' },
};

/**
 * state: ready | update | downloading | launching | playing | queue | offline
 * progress 0…1 (downloading) · elapsed seconds (playing, ticks by itself) · position (queue)
 */
export function PlayButton({ state = 'ready', label, sub, progress = 0, elapsed = 0, position, onClick, onMenu, menuLabel = 'Профиль запуска', size = 'xl', className, magnetic = true }) {
  const c = COPY[state] || COPY.ready;
  const [t, setT] = useState(elapsed);
  useEffect(() => setT(elapsed), [elapsed]);
  useInterval(() => setT((x) => x + 1), state === 'playing' ? 1000 : null);
  const wrap = useRef(null);
  const [mag, setMag] = useState([0, 0]);
  const onMove = (e) => {
    if (!magnetic || !wrap.current) return;
    const r = wrap.current.getBoundingClientRect();
    setMag([((e.clientX - r.left) / r.width - 0.5) * 6, ((e.clientY - r.top) / r.height - 0.5) * 4]);
    wrap.current.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
  };
  const dark = state === 'playing' || state === 'queue';
  const disabled = state === 'offline' || state === 'launching';
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const main = (ink) => (
    <>
      <span className="lm-play-icon"><Icon name={c.icon} size={24} /></span>
      <span className="lm-play-text">
        <span className="lm-play-label button-xl">{label || c.label}</span>
        {sub ? <span className="lm-play-sub">{sub}</span> : null}
      </span>
      {state === 'downloading' ? <span className="lm-play-pct"><Led value={pct} size="md" ghost={false} glow={false} animate={false} color={ink} /><span>%</span></span> : null}
      {state === 'playing' ? <Led value={t} format="time" size="md" className="lm-play-led" color="var(--luma-ink)" /> : null}
      {state === 'queue' ? <Led value={'#' + (position || 0)} size="md" className="lm-play-led" color="var(--luma-ink)" /> : null}
    </>
  );
  return (
    <div ref={wrap} className={cx('lm-play-wrap', 'is-' + state, 'lm-play-wrap--' + size, className)}
      onPointerMove={onMove} onPointerLeave={() => setMag([0, 0])}
      style={{ transform: `translate(${mag[0]}px, ${mag[1]}px)` }}>
      <button type="button" className={cx('lm-play', dark && 'is-dark')} onClick={onClick} disabled={disabled}
        aria-label={(label || c.label) + (sub ? ', ' + sub : '') + (state === 'downloading' ? ', ' + pct + '%' : '')}>
        {state === 'downloading' ? (
          <>
            <span className="lm-play-layer lm-play-layer--track">{main('var(--ink)')}</span>
            <span className="lm-play-layer lm-play-layer--fill" style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}>{main('var(--on-luma)')}</span>
          </>
        ) : (
          <span className="lm-play-layer">{main()}</span>
        )}
        {state === 'ready' || state === 'update' ? <span className="lm-play-shine" aria-hidden="true" /> : null}
        {state === 'launching' ? <span className="lm-play-scan" aria-hidden="true" /> : null}
      </button>
      {onMenu ? (
        <button type="button" className={cx('lm-play-menu', dark && 'is-dark')} onClick={onMenu} aria-label={menuLabel} disabled={state === 'offline'}>
          <Icon name="chevron-down" size={24} />
        </button>
      ) : null}
    </div>
  );
}
