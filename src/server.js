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

/** Polls the server every `ms` and when the window gets focus. null until the first answer. */
export function useServer(ms = 30000) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let alive = true;
    const tick = () => serverStatus().then((s) => { if (alive) setStatus({ ...s, at: Date.now() }); });
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
