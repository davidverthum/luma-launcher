// Core controls: Button, IconButton, Kbd, Tag, StatusPill, RankBadge, Toggle, Slider, Input, Tabs.
import { cx } from './util.js';
import { Icon } from './icons.jsx';
import * as React from 'react';
const { useState, useRef, useLayoutEffect, useEffect, useCallback } = React;

/* Button — variants: luma (the one lit action), glass (default), ghost, danger. */
export function Button({ variant = 'glass', size = 'md', icon, iconRight, loading = false, block = false, className, children, ...rest }) {
  const isz = size === 'sm' ? 12 : 24;
  return (
    <button type="button" {...rest} disabled={rest.disabled || loading} aria-busy={loading || undefined}
      className={cx('lm-btn', 'lm-btn--' + variant, 'lm-btn--' + size, block && 'lm-btn--block', !children && 'lm-btn--icon-only', className)}>
      {loading ? <Spinner /> : icon ? <Icon name={icon} size={isz} /> : null}
      {children != null ? <span className="lm-btn-label">{children}</span> : null}
      {iconRight ? <Icon name={iconRight} size={isz} /> : null}
    </button>
  );
}

export function Spinner({ className }) {
  return <span className={cx('lm-spinner', className)} aria-hidden="true"><i /><i /><i /><i /></span>;
}

/* IconButton — a square control with one pixel icon; `label` is required (aria-label + tooltip). */
export function IconButton({ icon, label, variant = 'ghost', size = 'md', badge, active, className, ...rest }) {
  return (
    <button type="button" {...rest} aria-label={label} title={label} aria-pressed={active == null ? undefined : !!active}
      className={cx('lm-iconbtn', 'lm-iconbtn--' + variant, 'lm-iconbtn--' + size, active && 'is-active', className)}>
      <Icon name={icon} size={size === 'sm' ? 12 : 24} />
      {badge != null && badge !== 0 ? <span className="lm-count" aria-label={badge + ' новых'}>{badge > 99 ? '99+' : badge}</span> : null}
    </button>
  );
}

export function Kbd({ children, className }) {
  return <kbd className={cx('lm-kbd', className)}>{children}</kbd>;
}

/* Tag — versions, loaders, facts. tone: neutral | outline | luma | realm (set `color`). */
export function Tag({ tone = 'neutral', icon, color, className, children, style }) {
  return (
    <span className={cx('lm-tag', 'lm-tag--' + tone, className)} style={color ? { '--tag-color': color, ...style } : style}>
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}

/* StatusPill — a pixel mark + a word. Shape carries the meaning, color reinforces it. */
const STATUS_TEXT = { online: 'Онлайн', away: 'Отошёл', offline: 'Не в сети', maintenance: 'Тех. работы', ingame: 'В игре' };
export function StatusPill({ status = 'online', label, color, glass = false, className }) {
  return (
    <span className={cx('lm-status', 'lm-status--' + status, glass && 'lm-status--glass', className)} style={color ? { '--status-color': color } : undefined}>
      <StatusMark status={status} color={color} />
      <span>{label || STATUS_TEXT[status]}</span>
    </span>
  );
}
export function StatusMark({ status = 'online', color, className }) {
  return <i className={cx('lm-mark-dot', 'is-' + status, className)} style={color ? { '--status-color': color } : undefined} aria-hidden="true" />;
}

/* RankBadge — donation ranks, pixel-cornered. spark < flare < nova < zenith. */
const RANKS = { spark: 'SPARK', flare: 'FLARE', nova: 'NOVA', zenith: 'ZENITH' };
export function RankBadge({ rank = 'nova', size = 'md', className }) {
  return <span className={cx('lm-rank', 'lm-rank--' + rank, 'lm-rank--' + size, className)}>{RANKS[rank] || rank}</span>;
}

/* Toggle — a switch. Lit when on. */
export function Toggle({ checked, defaultChecked = false, onChange, label, hint, disabled, className, id }) {
  const [inner, setInner] = useState(defaultChecked);
  const on = checked != null ? checked : inner;
  const flip = () => { if (disabled) return; if (checked == null) setInner(!on); onChange && onChange(!on); };
  const sw = (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} id={id} onClick={flip}
      className={cx('lm-toggle', on && 'is-on')} aria-label={typeof label === 'string' && !hint ? label : undefined}>
      <span className="lm-toggle-knob" />
    </button>
  );
  if (!label) return <span className={className}>{sw}</span>;
  return (
    <label className={cx('lm-field-row', disabled && 'is-disabled', className)} onClick={(e) => { if (e.target === e.currentTarget) flip(); }}>
      <span className="lm-field-row-text">
        <span className="body-strong">{label}</span>
        {hint ? <span className="lm-field-hint">{hint}</span> : null}
      </span>
      {sw}
    </label>
  );
}

/* Slider — one value on a track; optional recommended zone and marks. */
export function Slider({ value, defaultValue, min = 0, max = 100, step = 1, onChange, marks, recommend, format = (v) => v, unit, label, className }) {
  const [inner, setInner] = useState(defaultValue != null ? defaultValue : min);
  const v = value != null ? value : inner;
  const track = useRef(null);
  const set = useCallback((nv) => {
    nv = Math.min(max, Math.max(min, Math.round(nv / step) * step));
    if (value == null) setInner(nv);
    onChange && onChange(nv);
  }, [min, max, step, value, onChange]);
  const pct = (x) => ((x - min) / (max - min)) * 100;
  const fromEvent = (e) => {
    const r = track.current.getBoundingClientRect();
    return min + ((e.clientX - r.left) / r.width) * (max - min);
  };
  const onDown = (e) => {
    e.preventDefault();
    set(fromEvent(e));
    const move = (ev) => set(fromEvent(ev));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const onKey = (e) => {
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowUp') { set(v + step); e.preventDefault(); }
    if (k === 'ArrowLeft' || k === 'ArrowDown') { set(v - step); e.preventDefault(); }
    if (k === 'Home') { set(min); e.preventDefault(); }
    if (k === 'End') { set(max); e.preventDefault(); }
  };
  const inRec = recommend && v >= recommend[0] && v <= recommend[1];
  return (
    <div className={cx('lm-slider', className)}>
      {label ? (
        <div className="lm-slider-head">
          <span className="body-strong">{label}</span>
          <span className={cx('lm-slider-value', inRec && 'is-rec')}><span className="lm-led led-md">{format(v)}</span>{unit ? <span className="lm-slider-unit">{unit}</span> : null}</span>
        </div>
      ) : null}
      <div className="lm-slider-track" ref={track} onPointerDown={onDown}>
        {recommend ? <span className="lm-slider-rec" style={{ left: pct(recommend[0]) + '%', width: pct(recommend[1]) - pct(recommend[0]) + '%' }} /> : null}
        <span className="lm-slider-fill" style={{ width: pct(v) + '%' }} />
        <span className="lm-slider-thumb" role="slider" tabIndex={0} aria-valuemin={min} aria-valuemax={max} aria-valuenow={v}
          aria-valuetext={format(v) + (unit ? ' ' + unit : '')} aria-label={typeof label === 'string' ? label : undefined}
          onKeyDown={onKey} style={{ left: pct(v) + '%' }} />
      </div>
      {marks ? (
        <div className="lm-slider-marks">
          {marks.map((m) => <span key={m.value} style={{ left: pct(m.value) + '%' }} className={cx(m.value === v && 'is-on')}>{m.label}</span>)}
        </div>
      ) : null}
      {recommend ? <div className="lm-field-hint lm-slider-note"><i className="lm-slider-rec-swatch" />Рекомендуем {format(recommend[0])}–{format(recommend[1])}{unit ? ' ' + unit : ''} для этой сборки</div> : null}
    </div>
  );
}

/* Input — glass field with optional pixel icon, hint and error. */
export function Input({ label, icon, hint, error, right, className, id, ...rest }) {
  const fid = id || (label ? 'lm-in-' + String(label).replace(/\s+/g, '-') : undefined);
  return (
    <div className={cx('lm-input', error && 'is-error', className)}>
      {label ? <label className="lm-input-label" htmlFor={fid}>{label}</label> : null}
      <div className="lm-input-box">
        {icon ? <Icon name={icon} size={24} /> : null}
        <input id={fid} aria-invalid={error ? true : undefined} {...rest} />
        {right}
      </div>
      {error ? <div className="lm-input-error" role="alert"><Icon name="close" size={12} />{error}</div> : hint ? <div className="lm-field-hint">{hint}</div> : null}
    </div>
  );
}

/* Tabs — segmented control with a sliding light. items: [{id, label, icon?, count?}] */
export function Tabs({ items, value, defaultValue, onChange, size = 'md', variant = 'glass', className }) {
  const [inner, setInner] = useState(defaultValue != null ? defaultValue : items[0] && items[0].id);
  const cur = value != null ? value : inner;
  const box = useRef(null);
  const [ind, setInd] = useState(null);
  const measure = () => {
    const el = box.current && box.current.querySelector('[data-id="' + cur + '"]');
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  };
  useLayoutEffect(measure, [cur, items.length]);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(measure);
    ro.observe(box.current);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    return () => ro.disconnect();
  }, [cur]);
  return (
    <div className={cx('lm-tabs', 'lm-tabs--' + size, 'lm-tabs--' + variant, className)} role="tablist" ref={box}>
      {ind ? <span className="lm-tabs-ind" style={{ transform: `translateX(${ind.left}px)`, width: ind.width }} /> : null}
      {items.map((it) => (
        <button key={it.id} type="button" role="tab" data-id={it.id} aria-selected={cur === it.id}
          className={cx('lm-tab', cur === it.id && 'is-on')}
          onClick={() => { if (value == null) setInner(it.id); onChange && onChange(it.id); }}>
          {it.icon ? <Icon name={it.icon} size={size === 'sm' ? 12 : 24} /> : null}
          <span>{it.label}</span>
          {it.count != null ? <span className="lm-tab-count">{it.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
