// Content: NewsCard, EventCountdown, SeasonPass, DownloadProgress.
import { cx, useInterval } from './util.js';
import { Icon } from './icons.jsx';
import { Button, Tag } from './controls.jsx';
import { Led, formatLed } from './led.jsx';
import { VoxelArt } from './voxel.jsx';
import * as React from 'react';
const { useState, useEffect } = React;

/** NewsCard — art, a tag, a headline. art: { biome, light, seed } or an image URL. */
export function NewsCard({ tag = 'Обновление', date, title, excerpt, art = { biome: 'techno', light: 'var(--realm-techno)', seed: 11 }, size = 'md', onClick, className, style }) {
  return (
    <a className={cx('lm-news', 'lm-news--' + size, className)} style={style} href="#" onClick={(e) => { e.preventDefault(); onClick && onClick(); }}>
      <div className="lm-news-art">
        {typeof art === 'string' ? <img src={art} alt="" /> : <VoxelArt biome={art.biome} light={art.light} seed={art.seed} fill={0.95} focusY={art.focusY || 0.55} particles={10} />}
      </div>
      <div className="lm-news-body">
        <div className="lm-news-meta">
          <Tag tone="luma">{tag}</Tag>
          {date ? <span className="caption">{date}</span> : null}
        </div>
        <div className="lm-news-title title">{title}</div>
        {excerpt ? <p className="lm-news-excerpt">{excerpt}</p> : null}
      </div>
    </a>
  );
}

/** EventCountdown — a live LED timer to a server event. */
export function EventCountdown({ title = 'Затмение', realm = 'Анархия', color = 'var(--realm-anarchy)', seconds = 2 * 3600 + 14 * 60 + 37, participants = 1284, remind: r0 = false, onRemind, className }) {
  const [left, setLeft] = useState(seconds);
  const [remind, setRemind] = useState(r0);
  useEffect(() => setLeft(seconds), [seconds]);
  useInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
  return (
    <div className={cx('lm-event', className)} style={{ '--event': color }}>
      <div className="lm-event-head">
        <span className="overline">{realm}</span>
        <span className="lm-event-live"><i />скоро</span>
      </div>
      <div className="lm-event-title display-md">{title}</div>
      <Led value={left} format="time" size="lg" color="var(--event)" className="lm-event-led" label="До начала" />
      <div className="lm-event-foot">
        <span className="caption"><span className="lm-led">{formatLed(participants)}</span> участвуют</span>
        <Button size="sm" variant={remind ? 'luma' : 'glass'} icon={remind ? 'check' : 'bell'} onClick={() => { setRemind(!remind); onRemind && onRemind(!remind); }}>
          {remind ? 'Напомним' : 'Напомнить'}
        </Button>
      </div>
    </div>
  );
}

const DEFAULT_TIERS = [
  { n: 21, free: { icon: 'gem', label: '150 люменов', claimed: true }, premium: { icon: 'shirt', label: 'Скин «Неон»', claimed: true } },
  { n: 22, free: { icon: 'gift', label: 'Кейс', claimed: true }, premium: { icon: 'sparkle', label: 'След частиц' , claimed: true } },
  { n: 23, free: { icon: 'gem', label: '200 люменов', claimed: true }, premium: { icon: 'crown', label: 'Титул «Сияющий»', claimed: true } },
  { n: 24, free: { icon: 'shirt', label: 'Плащ «Рассвет»', available: true }, premium: { icon: 'gem', label: '600 люменов', available: true } },
  { n: 25, free: { icon: 'gift', label: 'Кейс' }, premium: { icon: 'bolt', label: 'Эмоция «Вспышка»' } },
  { n: 26, free: { icon: 'gem', label: '250 люменов' }, premium: { icon: 'shirt', label: 'Скин «Аметист»' } },
  { n: 27, free: { icon: 'trophy', label: 'Рамка профиля' }, premium: { icon: 'sparkle', label: 'Питомец «Искра»' } },
];

/** SeasonPass — tiers on a lit track: free row above, premium row below. */
export function SeasonPass({ season = 'Сезон 3', name = 'Сияние', level = 24, xp = 1240, xpMax = 2000, daysLeft = 18, tiers = DEFAULT_TIERS, premium = false, compact = false, className }) {
  const curIdx = tiers.findIndex((t) => t.n === level);
  const cell = (it, row, t) => (
    <div className={cx('lm-pass-slot', it.claimed && 'is-claimed', it.available && 'is-available', row === 'premium' && !premium && 'is-locked')} title={it.label}>
      <Icon name={it.icon} size={24} />
      {it.claimed ? <span className="lm-pass-check"><Icon name="check" size={12} /></span> : null}
      {row === 'premium' && !premium && !it.claimed ? <span className="lm-pass-lock"><Icon name="lock" size={12} /></span> : null}
      {!compact ? <span className="lm-pass-label">{it.label}</span> : null}
    </div>
  );
  return (
    <div className={cx('lm-pass', compact && 'lm-pass--compact', className)}>
      <div className="lm-pass-head">
        <div>
          <div className="overline">{season} · осталось {daysLeft} дн.</div>
          <div className="lm-pass-name display-md">{name}</div>
        </div>
        <div className="lm-pass-level">
          <span className="caption">Уровень</span>
          <Led value={level} size="lg" color="var(--luma-ink)" />
        </div>
      </div>
      <div className="lm-pass-xp">
        <div className="lm-pass-xpbar"><span style={{ width: (xp / xpMax) * 100 + '%' }} /></div>
        <span className="caption"><span className="lm-led">{formatLed(xp)}</span> / {formatLed(xpMax)} XP</span>
      </div>
      <div className="lm-pass-track" style={{ '--cols': tiers.length }}>
        <div className="lm-pass-rail"><span style={{ width: ((curIdx + 0.5) / tiers.length) * 100 + '%' }} /></div>
        {tiers.map((t) => (
          <div key={t.n} className={cx('lm-pass-col', t.n === level && 'is-current', t.n < level && 'is-past')}>
            {cell(t.free, 'free', t)}
            <div className="lm-pass-n"><span className="lm-led">{t.n}</span></div>
            {cell(t.premium, 'premium', t)}
          </div>
        ))}
      </div>
      {!premium ? (
        <div className="lm-pass-cta">
          <span className="caption">Премиум-ряд открывает 34 награды сезона</span>
          <Button size="sm" variant="glass" icon="crown">Премиум · <span className="lm-led">490</span></Button>
        </div>
      ) : null}
    </div>
  );
}

/** DownloadProgress — a segmented bar (XP-bar style), LED speed and ETA, the file in flight. */
export function DownloadProgress({ title = 'Техномагия 1.20.1', progress = 0.64, speed = 18.4, eta = 42, file = 'create-1.20.1-0.5.1.f.jar', done = 138, total = 214, segments = 32, paused = false, onPause, onCancel, className }) {
  const lit = Math.round(progress * segments);
  return (
    <div className={cx('lm-dl', paused && 'is-paused', className)}>
      <div className="lm-dl-head">
        <Icon name="download" size={24} />
        <div className="lm-dl-title">
          <div className="body-strong">{title}</div>
          <div className="caption">{paused ? 'Пауза' : 'Загрузка модов'} · {done} из {total} файлов</div>
        </div>
        <span className="lm-dl-pct"><Led value={Math.round(progress * 100)} size="md" color="var(--luma-ink)" ghost={false} animate={false} /><span>%</span></span>
      </div>
      <div className="lm-dl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={title}>
        {Array.from({ length: segments }, (_, i) => <i key={i} className={cx(i < lit && 'is-on', i === lit && !paused && 'is-head')} />)}
      </div>
      <div className="lm-dl-foot">
        <span className="lm-dl-file mono">{file}</span>
        <span className="lm-dl-speed"><span className="lm-led">{speed.toFixed(1)}</span> МБ/с · <span className="lm-led">{formatLed(eta, 'mmss')}</span></span>
        <span className="lm-dl-actions">
          <Button size="sm" variant="ghost" icon={paused ? 'play' : 'stop'} onClick={onPause}>{paused ? 'Продолжить' : 'Пауза'}</Button>
          <Button size="sm" variant="ghost" icon="close" onClick={onCancel} aria-label="Отменить загрузку" />
        </span>
      </div>
    </div>
  );
}
