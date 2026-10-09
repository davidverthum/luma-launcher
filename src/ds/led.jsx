// LED numerals (Doto dot-matrix) with unlit "ghost" cells, step sparklines and stat tiles.
import { cx, useInterval } from './util.js';
import { Icon } from './icons.jsx';
import * as React from 'react';
const { useState, useRef, useEffect, useMemo } = React;

const group = (n) => (Math.abs(n) < 10000 ? String(Math.round(n)) : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
export function formatLed(value, format) {
  if (typeof value === 'string') return value;
  if (format === 'time') {
    const s = Math.max(0, Math.floor(value));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return [h, m, sec].map((x) => String(x).padStart(2, '0')).join(':');
  }
  if (format === 'mmss') {
    const s = Math.max(0, Math.floor(value));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  if (format === 'raw') return String(value);
  if (typeof format === 'number') return Number(value).toFixed(format).replace('.', ',');
  return group(value);
}

/** LED readout. size: xl | lg | md | sm. `cells` pads the ghost to a fixed width. */
export function Led({ value, format, size = 'md', color, ghost = true, glow = true, animate = true, cells, className, style, label }) {
  const text = formatLed(value, format);
  const shown = cells && text.length < cells ? ' '.repeat(cells - text.length) + text : text;
  const ghostText = shown.replace(/[0-9]/g, '8').replace(/ /g, ghost === 'full' ? '8' : ' ');
  const st = useRef({ prev: shown, ver: [] });
  const vers = useMemo(() => {
    const s = st.current;
    const p = s.prev.padStart(shown.length, ' ');
    const ver = shown.split('').map((ch, i) => (s.ver[i] || 0) + (s.prev !== shown && ch !== p[i] ? 1 : 0));
    s.prev = shown; s.ver = ver;
    return ver;
  }, [shown]);
  const cell = (ch, key, cls) => (ch === ':' ? <span key={key} className={cx('lm-led-colon', cls)}><i /><i /></span>
    : ch === '.' || ch === ',' ? <span key={key} className={cx('lm-led-dot', cls)}><i /></span>
    : ch === '%' ? <span key={key} className={cx('lm-led-pct', cls)}>%</span>
    : <span key={key} className={cls}>{ch}</span>);
  return (
    <span className={cx('lm-led', size !== 'sm' && 'led-' + size, 'lm-led--' + size, glow && 'lm-led--glow', className)}
      style={color ? { '--led-color': color, ...style } : style} role="img" aria-label={(label ? label + ': ' : '') + text}>
      {ghost ? <span className="lm-led-ghost" aria-hidden="true">{ghostText.split('').map((ch, i) => cell(ch, i, 'lm-led-ch'))}</span> : null}
      <span className="lm-led-value" aria-hidden="true">
        {shown.split('').map((ch, i) => cell(ch, i + ':' + vers[i], cx('lm-led-ch', animate && vers[i] > 0 && 'is-new')))}
      </span>
    </span>
  );
}

/** Live LED counter that drifts around a value (for previews and idle states). */
export function useDrift(base, spread = 0.004, ms = 2400) {
  const [v, setV] = useState(base);
  useEffect(() => setV(base), [base]);
  useInterval(() => setV((x) => Math.round(x + (Math.random() - 0.5) * base * spread * 2)), ms);
  return v;
}

/** Step sparkline — pixel stairs, like an LED graph. */
export function Sparkline({ data, width = 160, height = 40, color = 'var(--luma-ink)', fill = true, step = true, dot = true, className, label }) {
  const id = useMemo(() => 'sp' + Math.random().toString(36).slice(2, 8), []);
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const pad = 3;
  const X = (i) => (i / (data.length - 1)) * (width - pad * 2) + pad;
  const Y = (v) => height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2);
  let d = `M${X(0).toFixed(1)} ${Y(data[0]).toFixed(1)}`;
  for (let i = 1; i < data.length; i++) d += step ? `H${X(i).toFixed(1)}V${Y(data[i]).toFixed(1)}` : `L${X(i).toFixed(1)} ${Y(data[i]).toFixed(1)}`;
  const area = d + `V${height}H${X(0).toFixed(1)}Z`;
  const lx = X(data.length - 1), ly = Y(data[data.length - 1]);
  return (
    <svg className={cx('lm-spark', className)} width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={{ color }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity=".32" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill ? <path d={area} fill={`url(#${id})`} /> : null}
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
      {dot ? <path d={`M${lx.toFixed(1)} ${ly.toFixed(1)}h0.01`} stroke="currentColor" strokeWidth="7" strokeLinecap="square" vectorEffect="non-scaling-stroke" className="lm-spark-dot" /> : null}
    </svg>
  );
}

/** StatTile — an overline, a big LED number with its unit, an optional delta and trend. */
export function StatTile({ label, value, format, unit, delta, trend, icon, color, size = 'lg', className, children }) {
  const up = typeof delta === 'number' ? delta >= 0 : null;
  return (
    <div className={cx('lm-stat', className)} style={color ? { '--stat-color': color } : undefined}>
      <div className="lm-stat-head">
        {icon ? <Icon name={icon} size={12} /> : null}
        <span className="overline">{label}</span>
        {delta != null ? <span className={cx('lm-stat-delta', up === false && 'is-down')}>{typeof delta === 'number' ? (up ? '▲ ' : '▼ ') + Math.abs(delta).toFixed(1) + '%' : delta}</span> : null}
      </div>
      <div className="lm-stat-value">
        <Led value={value} format={format} size={size} color={color || 'var(--ink)'} glow={!!color} />
        {unit ? <span className="lm-stat-unit">{unit}</span> : null}
      </div>
      {trend ? <Sparkline data={trend} width={220} height={36} color={color || 'var(--luma-ink)'} className="lm-stat-spark" /> : null}
      {children}
    </div>
  );
}
