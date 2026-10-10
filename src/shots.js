// Screenshots the game saves into the Luma folder (F2 in game) — the album and the home card read them live.
import { useCallback, useEffect, useState } from 'react';
import { listScreenshots } from './native.js';

const same = (a, b) => a && a.length === b.length && a.every((s, i) => s.file === b[i].file && s.size === b[i].size);

/** Lists screenshots now, every `ms` and when the window gets focus, so a fresh F2 shows up by itself.
 * Returns [list, reload]; list is null until the first answer. */
export function useScreenshots(ms = 4000) {
  const [list, setList] = useState(null);
  const reload = useCallback(() => listScreenshots()
    .then((next) => setList((cur) => (same(cur, next) ? cur : next)))
    .catch(() => setList((cur) => cur || [])), []);
  useEffect(() => {
    reload();
    const id = setInterval(reload, ms);
    window.addEventListener('focus', reload);
    return () => { clearInterval(id); window.removeEventListener('focus', reload); };
  }, [reload, ms]);
  return [list, reload];
}

export function shotCount(n) {
  const m10 = n % 10, m100 = n % 100;
  return n + ' ' + (m10 === 1 && m100 !== 11 ? 'скриншот' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'скриншота' : 'скриншотов');
}

const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** «Сегодня», «Вчера», «8 октября», «8 октября 2025». */
export function dayLabel(ms) {
  const today = startOfDay(Date.now());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const day = startOfDay(ms);
  if (day === today) return 'Сегодня';
  if (day === yesterday.getTime()) return 'Вчера';
  const sameYear = new Date(ms).getFullYear() === new Date().getFullYear();
  return new Date(ms).toLocaleDateString('ru-RU', sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
}

export const timeLabel = (ms) => new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

/** Newest-first list → [{ label, items }] by calendar day. */
export function byDay(list) {
  const groups = [];
  for (const s of list) {
    const label = dayLabel(s.taken_ms);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(s);
    else groups.push({ label, items: [s] });
  }
  return groups;
}
