// Shell: TitleBar (window chrome), CommandPalette (⌘K), Toast.
import { cx } from './util.js';
import { Icon } from './icons.jsx';
import { Kbd, IconButton, RankBadge, Button } from './controls.jsx';
import { PlayerHead } from './head.jsx';
import { Logo } from './logo.jsx';
import { Tabs } from './controls.jsx';
import { formatLed } from './led.jsx';
import * as React from 'react';
const { useState, useEffect, useRef } = React;

/** TitleBar — draggable window chrome: brand, sections, ⌘K, notifications, lumens, account, window controls. */
export function TitleBar({ nav = [{ id: 'home', label: 'Главная' }, { id: 'realms', label: 'Миры' }, { id: 'wardrobe', label: 'Гардероб' }, { id: 'store', label: 'Магазин' }, { id: 'news', label: 'Новости' }],
  active, onNav, user = { name: 'Nyx_', rank: 'nova' }, balance = 1250, notifications = 3, onSearch, onNotifications, onAccount, brand = false, controls = true, onMinimize, onMaximize, onClose, className }) {
  return (
    <header className={cx('lm-titlebar', className)} data-tauri-drag-region="">
      {brand ? <Logo height={14} /> : null}
      {nav ? <Tabs items={nav} value={active} defaultValue={nav[0] && nav[0].id} onChange={onNav} size="sm" variant="bare" /> : null}
      <span className="lm-titlebar-drag" data-tauri-drag-region="" />
      <button type="button" className="lm-search-trigger" onClick={onSearch}>
        <Icon name="search" size={12} />
        <span>Поиск и команды</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      <IconButton icon="bell" label="Уведомления" badge={notifications} size="md" onClick={onNotifications} />
      {balance !== null ? (
        <span className="lm-balance" title="Люмены — валюта сети">
          <Icon name="gem" size={12} />
          <span className="lm-led">{formatLed(balance)}</span>
        </span>
      ) : null}
      <button type="button" className="lm-account" onClick={onAccount}>
        <PlayerHead name={user.name} size={24} status="online" />
        <span className="body-strong">{user.name}</span>
        {user.rank ? <RankBadge rank={user.rank} size="sm" /> : null}
        <Icon name="chevron-down" size={12} />
      </button>
      {controls ? (
        <span className="lm-winctl" aria-label="Окно">
          <button type="button" aria-label="Свернуть" onClick={onMinimize}><Icon name="minus" size={12} /></button>
          <button type="button" aria-label="Развернуть" onClick={onMaximize}><Icon name="maximize" size={12} /></button>
          <button type="button" aria-label="Закрыть" className="is-close" onClick={onClose}><Icon name="close" size={12} /></button>
        </span>
      ) : null}
    </header>
  );
}

const DEFAULT_GROUPS = [
  { group: 'Действия', items: [
    { icon: 'play', label: 'Играть на «Техномагии»', hint: 'Forge 1.20.1', kbd: '↵' },
    { icon: 'chip', label: 'Выделить 8 ГБ памяти', hint: 'сейчас 6 ГБ' },
    { icon: 'folder', label: 'Открыть папку игры' },
    { icon: 'camera', label: 'Скриншоты', hint: '128 файлов' },
  ] },
  { group: 'Друзья', items: [
    { icon: 'users', label: 'Позвать Lex_ в пати', hint: 'играет на Арене' },
    { icon: 'chat', label: 'Написать Mira' },
  ] },
  { group: 'Миры', items: [
    { icon: 'globe', label: 'Перейти на «Рассвет»', hint: '3 120 онлайн' },
    { icon: 'globe', label: 'Перейти на «Арену»', hint: '5 204 онлайн' },
  ] },
];

/** CommandPalette — ⌘K for everything. Filters as you type; Enter or click calls onSelect(item). `contained` renders inside its parent. */
export function CommandPalette({ open = true, groups = DEFAULT_GROUPS, query: q0 = '', onClose, onSelect, contained = false, className }) {
  const [query, setQuery] = useState(q0);
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  const q = query.trim().toLowerCase();
  const shown = groups.map((g) => ({ ...g, items: g.items.filter((it) => !q || (it.label + ' ' + (it.hint || '') + ' ' + (it.keywords || '')).toLowerCase().includes(q)) })).filter((g) => g.items.length);
  const flat = shown.flatMap((g) => g.items);
  useEffect(() => { if (open) { setQuery(q0); setSel(0); } }, [open]);
  useEffect(() => { setSel(0); }, [query]);
  useEffect(() => { if (open && input.current) input.current.focus({ preventScroll: true }); }, [open]);
  const pick = (it) => { if (it && onSelect) onSelect(it); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { setSel((s) => (flat.length ? (s + 1) % flat.length : 0)); e.preventDefault(); }
    if (e.key === 'ArrowUp') { setSel((s) => (flat.length ? (s - 1 + flat.length) % flat.length : 0)); e.preventDefault(); }
    if (e.key === 'Enter') { pick(flat[sel]); e.preventDefault(); }
    if (e.key === 'Escape' && onClose) { onClose(); e.preventDefault(); }
  };
  if (!open) return null;
  let i = -1;
  return (
    <div className={cx('lm-palette-scrim', contained && 'is-contained', className)} onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className="lm-palette" role="dialog" aria-label="Команды" onKeyDown={onKey}>
        <div className="lm-palette-input">
          <Icon name="command" size={24} />
          <input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Что сделать?" aria-label="Команда" role="combobox" aria-expanded="true" aria-controls="lm-palette-list" />
          <Kbd>esc</Kbd>
        </div>
        <div className="lm-palette-list" id="lm-palette-list" role="listbox">
          {shown.length === 0 ? <div className="lm-palette-empty">Ничего не нашли — попробуй «играть», «память» или ник друга</div> : null}
          {shown.map((g) => (
            <div key={g.group} className="lm-palette-group">
              <div className="overline lm-palette-group-title">{g.group}</div>
              {g.items.map((it) => {
                i++;
                const on = i === sel;
                const idx = i;
                return (
                  <div key={it.id || it.label} role="option" aria-selected={on} className={cx('lm-palette-item', on && 'is-on')} onMouseEnter={() => setSel(idx)} onClick={() => pick(it)}>
                    <Icon name={it.icon} size={24} />
                    <span className="lm-palette-label">{it.label}</span>
                    {it.hint ? <span className="lm-palette-hint">{it.hint}</span> : null}
                    {on ? <Kbd>{it.kbd || '↵'}</Kbd> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="lm-palette-foot">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> выбрать</span>
          <span><Kbd>↵</Kbd> выполнить</span>
          <span><Kbd>esc</Kbd> закрыть</span>
        </div>
      </div>
    </div>
  );
}

/** Toast — a floating notice. Pass `head` (a nickname) for player events, or an `icon`. */
export function Toast({ title, body, head, icon = 'bell', actions, tone = 'default', duration, onClose, className }) {
  return (
    <div className={cx('lm-toast', 'lm-toast--' + tone, className)} role="status">
      <div className="lm-toast-lead">{head ? <PlayerHead name={head} size={40} status="ingame" color="var(--realm-arena)" /> : <span className="lm-toast-icon"><Icon name={icon} size={24} /></span>}</div>
      <div className="lm-toast-main">
        <div className="body-strong">{title}</div>
        {body ? <div className="lm-toast-body">{body}</div> : null}
        {actions ? <div className="lm-toast-actions">{actions}</div> : null}
      </div>
      {onClose !== false ? <IconButton icon="close" label="Закрыть" size="sm" onClick={onClose} className="lm-toast-close" /> : null}
      {duration ? <span className="lm-toast-timer" style={{ animationDuration: duration + 'ms' }} /> : null}
    </div>
  );
}
