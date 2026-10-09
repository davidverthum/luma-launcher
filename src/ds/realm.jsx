// Realms: the network's worlds, their cards and the rail that switches between them.
import { cx } from './util.js';
import { Icon, Emblem } from './icons.jsx';
import { VoxelArt } from './voxel.jsx';
import { Led } from './led.jsx';
import { StatusPill, Tag } from './controls.jsx';
import { HeadStack } from './head.jsx';
import { LumaMark } from './logo.jsx';
import * as React from 'react';
const { useState } = React;

export const REALMS = [
  { id: 'dawn', name: 'Рассвет', kind: 'Выживание · SMP', biome: 'meadow', emblem: 'dawn', light: 'var(--realm-dawn)', version: '1.21.4', loader: 'Vanilla+', online: 3120, ping: 18, status: 'online',
    desc: 'Выживание без вайпов: свои города, живая экономика и сезонные ивенты.', tags: ['Без вайпов', 'Экономика', 'Кланы'] },
  { id: 'techno', name: 'Техномагия', kind: 'Модовая сборка', biome: 'techno', emblem: 'techno', light: 'var(--realm-techno)', version: '1.20.1', loader: 'Forge', mods: 214, online: 2418, ping: 24, status: 'online',
    desc: 'Индустрия и магия в одном мире: Create, Mekanism, Botania и ещё 211 модов.', tags: ['214 модов', 'Forge 47.3', 'Вайп 12 дней назад'] },
  { id: 'arena', name: 'Арена', kind: 'Мини-игры', biome: 'arena', emblem: 'arena', light: 'var(--realm-arena)', version: '1.8–1.21', loader: 'Любая версия', online: 5204, ping: 12, status: 'online',
    desc: 'BedWars, SkyWars и дуэли. Рейтинговые сезоны и кастомные карты каждую неделю.', tags: ['BedWars', 'SkyWars', 'Дуэли'] },
  { id: 'anarchy', name: 'Анархия', kind: 'Без правил', biome: 'nether', emblem: 'anarchy', light: 'var(--realm-anarchy)', version: '1.21.4', loader: 'Vanilla', online: 1388, ping: 31, status: 'online',
    desc: 'Никаких правил и приватов. Карта 30 000 × 30 000, вайп раз в сезон.', tags: ['PvP', 'Без приватов', 'Вайп через 3 дня'] },
  { id: 'sky', name: 'Небеса', kind: 'Скайблок', biome: 'sky', emblem: 'sky', light: 'var(--realm-sky)', version: '1.21.4', loader: 'Vanilla+', online: 1716, ping: 22, status: 'maintenance',
    desc: 'Начни с острова в небе: генераторы, магия кристаллов и рейтинг островов.', tags: ['Скайблок', 'Кристаллы', 'Рейтинг'] },
];
export const realmById = (id) => REALMS.find((r) => r.id === id) || REALMS[0];
const asRealm = (r) => (typeof r === 'string' ? realmById(r) : r || REALMS[0]);

/** Signal bars for ping: 4 bars, lit by quality. */
export function Ping({ ms, className }) {
  const q = ms < 30 ? 4 : ms < 60 ? 3 : ms < 120 ? 2 : 1;
  return (
    <span className={cx('lm-ping', 'q-' + q, className)} title={ms + ' мс'}>
      <span className="lm-ping-bars" aria-hidden="true"><i /><i /><i /><i /></span>
      <span className="lm-ping-ms"><span className="lm-led">{ms}</span> мс</span>
    </span>
  );
}

/** RealmCard — a world to pick. Selected = its own light around the card. */
export function RealmCard({ realm, selected = false, onSelect, friends = [], size = 'md', seed = 3, className }) {
  const r = asRealm(realm);
  return (
    <button type="button" className={cx('lm-realm', 'lm-realm--' + size, selected && 'is-selected', r.status !== 'online' && 'is-' + r.status, className)}
      style={{ '--realm': r.light }} onClick={() => onSelect && onSelect(r.id)} aria-pressed={selected}>
      <div className="lm-realm-art">
        <VoxelArt biome={r.biome} light={r.light} seed={seed} fill={0.74} focusY={0.5} particles={18} />
        <div className="lm-realm-top">
          <StatusPill status={r.status === 'online' ? 'online' : r.status} label={r.status === 'online' ? 'Онлайн' : r.status === 'maintenance' ? 'Тех. работы' : 'Выключен'} glass />
          {friends.length ? <span className="lm-realm-friends" title={friends.join(', ')}><HeadStack names={friends} max={3} size={20} /></span> : <Tag tone="glass">{r.version}</Tag>}
        </div>
      </div>
      <div className="lm-realm-body">
        <div className="lm-realm-title">
          <Emblem realm={r.emblem} size={16} color={r.light} />
          <span className="title">{r.name}</span>
        </div>
        <div className="lm-realm-kind caption">{r.kind} · <span className="mono">{r.version}</span></div>
        <div className="lm-realm-stats">
          <span className="lm-realm-online"><Led value={r.online} size="md" color="var(--ink)" glow={false} ghost={false} /><span className="caption">онлайн</span></span>
          <Ping ms={r.ping} />
        </div>
      </div>
    </button>
  );
}

/** RealmRail — vertical switcher. Each realm glows in its own light when active. */
export function RealmRail({ realms = REALMS, value, defaultValue, onChange, footer = [{ id: 'store', icon: 'bag', label: 'Магазин' }, { id: 'settings', icon: 'settings', label: 'Настройки' }], onFooter, className }) {
  const [inner, setInner] = useState(defaultValue || (realms[0] && realms[0].id));
  const cur = value != null ? value : inner;
  return (
    <nav className={cx('lm-rail', className)} aria-label="Миры">
      <div className="lm-rail-brand" data-tauri-drag-region=""><LumaMark size={32} /></div>
      <div className="lm-rail-list" role="tablist" aria-orientation="vertical">
        {realms.map((r) => (
          <button key={r.id} type="button" role="tab" aria-selected={cur === r.id} className={cx('lm-rail-item', cur === r.id && 'is-on')}
            style={{ '--realm': r.light }} onClick={() => { if (value == null) setInner(r.id); onChange && onChange(r.id); }}>
            <Emblem realm={r.emblem} size={32} />
            <span className="lm-rail-tip" role="tooltip">
              <span className="body-strong">{r.name}</span>
              <span className="lm-rail-tip-meta"><Led value={r.online} size="sm" color="var(--realm)" ghost={false} /> онлайн</span>
            </span>
            {r.status === 'maintenance' ? <i className="lm-mark-dot is-away lm-rail-flag" aria-label="Тех. работы" /> : null}
          </button>
        ))}
        <button type="button" className="lm-rail-item lm-rail-item--add" aria-label="Добавить сервер"><Icon name="plus" size={24} /></button>
      </div>
      <div className="lm-rail-foot">
        {footer.map((f) => (
          <button key={f.id} type="button" className="lm-rail-item lm-rail-item--tool" aria-label={f.label} title={f.label} onClick={() => onFooter && onFooter(f.id)}>
            <Icon name={f.icon} size={24} />
          </button>
        ))}
      </div>
    </nav>
  );
}
