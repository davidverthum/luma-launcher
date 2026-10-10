// The one real server behind the launcher, plus its live status.
import { useEffect, useState } from 'react';
import { modpack, serverStatus } from './native.js';

export const LUMA_REALM = {
  id: 'luma',
  name: 'Luma',
  kind: 'Выживание с модами',
  biome: 'meadow',
  emblem: 'dawn',
  light: 'var(--luma)',
  version: modpack.minecraft,
  loader: 'Fabric',
  mods: modpack.mods.length,
  online: 0,
  ping: 0,
  status: 'online',
  desc: 'Сервер для своих: путевые камни, рюкзаки, кухня, могилы и данжи — и у каждого игрока своя кошкодевочка.',
  tags: [modpack.mods.length + ' модов', 'Fabric ' + modpack.loader.version, 'Кошкодевочки'],
};

// Online over the last day, from the launcher's own polls — kept in this computer's storage, so
// it covers the hours the launcher was open. [{ t, n }], oldest first.
const HISTORY_KEY = 'luma.online';
const DAY = 24 * 60 * 60 * 1000;
const BUCKET = 20 * 60 * 1000;

function readHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]').filter((p) => Date.now() - p.t < DAY); } catch { return []; }
}

function recordOnline(s) {
  const points = readHistory();
  points.push({ t: Date.now(), n: s.online ? s.players || 0 : 0 });
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(points)); } catch { /* storage off — the chart just stays empty */ }
}

/** The day's online as 20-minute peaks (only the stretches the launcher saw), plus the day's peak. */
export function onlineHistory() {
  const buckets = new Map();
  for (const p of readHistory()) {
    const k = Math.floor(p.t / BUCKET);
    buckets.set(k, Math.max(buckets.get(k) || 0, p.n));
  }
  const values = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
  return { values, peak: values.length ? Math.max(...values) : 0 };
}

/** Polls the server every `ms` and when the window gets focus. null until the first answer. */
export function useServer(ms = 30000) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let alive = true;
    const tick = () => serverStatus().then((s) => { recordOnline(s); if (alive) setStatus({ ...s, at: Date.now() }); });
    tick();
    const id = setInterval(tick, ms);
    window.addEventListener('focus', tick);
    return () => { alive = false; clearInterval(id); window.removeEventListener('focus', tick); };
  }, [ms]);
  return status;
}

/** The realm object with live numbers folded in. */
export function liveRealm(server) {
  if (!server) return LUMA_REALM;
  return { ...LUMA_REALM, online: server.players || 0, ping: server.latency_ms || 0, status: server.online ? 'online' : 'maintenance' };
}
