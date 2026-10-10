// Bridge to the Rust core. In a plain browser (vite dev without Tauri) everything falls back to safe stand-ins.
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { relaunch } from '@tauri-apps/plugin-process';
import pack from '../src-tauri/modpack.json';
import pkg from '../package.json';

export const appVersion = pkg.version;

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function platform() {
  const ua = navigator.userAgent || '';
  if (/Mac OS X|Macintosh/.test(ua)) return 'mac';
  if (/Windows/.test(ua)) return 'windows';
  return 'linux';
}

const LS_KEY = 'luma.settings';

export async function loadSettings() {
  if (inTauri) {
    try { return (await invoke('load_settings')) || {}; } catch (e) { console.warn('load_settings', e); return {}; }
  }
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}

export async function saveSettings(settings) {
  if (inTauri) return invoke('save_settings', { settings });
  try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
}

export async function systemInfo() {
  if (inTauri) {
    try { return await invoke('system_info'); } catch (e) { console.warn('system_info', e); }
  }
  return { os: platform(), os_version: '', arch: '', cpu: 'процессор не определён', cores: navigator.hardwareConcurrency || 4, memory_gb: navigator.deviceMemory || 8, hostname: '' };
}

export async function detectJava() {
  if (inTauri) {
    try { return await invoke('detect_java'); } catch (e) { console.warn('detect_java', e); }
  }
  return { found: false, path: null, version: null };
}

export async function openRealmDir(realm) {
  if (inTauri) return invoke('open_realm_dir', { realm });
  return null;
}

/** The modpack this launcher ships (same file the Rust core installs from). */
export const modpack = {
  name: pack.name,
  minecraft: pack.minecraft,
  loader: pack.loader,
  server: pack.server,
  mods: pack.mods.map((m) => m.name),
  totalMb: Math.round(pack.mods.reduce((a, m) => a + m.size, 0) / 1e5) / 10,
};

/** Live server status. The app pings the server itself; the browser preview asks a public status API. */
export async function serverStatus() {
  if (inTauri) {
    try { return await invoke('server_status'); } catch (e) { return { online: false, players: 0, max: 0, sample: [], error: String(e) }; }
  }
  try {
    const j = await fetch('https://api.mcsrvstat.us/3/' + encodeURIComponent(pack.server.address)).then((r) => r.json());
    return { online: !!j.online, players: (j.players && j.players.online) || 0, max: (j.players && j.players.max) || 0, version: j.version || '',
      motd: (j.motd && j.motd.clean && j.motd.clean.join(' ')) || '', latency_ms: 0, sample: ((j.players && j.players.list) || []).map((p) => p.name) };
  } catch (e) { return { online: false, players: 0, max: 0, sample: [], error: String(e) }; }
}

/** Syncs mods and sets up the «Luma» profile + server entry. Resolves with a report. */
export const prepareGame = (ramGb) => invoke('prepare_game', { ramGb });
/** Calls `cb(progress)` for every sync step; returns the unsubscribe function. */
export const onProgress = (cb) => (inTauri ? listen('luma://progress', (e) => cb(e.payload)) : Promise.resolve(() => {}));
export const openMinecraftLauncher = () => invoke('open_minecraft_launcher');
export const openGameDir = () => (inTauri ? invoke('open_game_dir') : Promise.resolve(null));
export function openUrl(url) {
  if (inTauri) return invoke('plugin:opener|open_url', { url });
  window.open(url, '_blank', 'noopener');
  return Promise.resolve();
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  return ok;
}

async function authFetch(path, body) {
  const r = await fetch(pack.auth.url + '/api/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

/** Registers a Luma account (nick + password). Never touches Microsoft/Mojang. */
export function authRegister(name, password) {
  return inTauri ? invoke('auth_register', { name, password }) : authFetch('register', { name, password });
}

export function authLogin(name, password) {
  return inTauri ? invoke('auth_login', { name, password }) : authFetch('login', { name, password });
}

/** Revalidates a stored session token; throws if it's expired or revoked. */
export async function authMe(token) {
  if (inTauri) return invoke('auth_me', { token });
  const r = await fetch(pack.auth.url + '/api/me', { headers: { Authorization: 'Bearer ' + token } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

/** Ely.by login (Yggdrasil-compatible) — a non-premium Minecraft identity, not a Microsoft one.
 * Pass the stored `clientToken` back on every later call; omit it only on first login. */
export function elyLogin(username, password, clientToken) {
  if (!inTauri) return Promise.reject(new Error('Нужно приложение Luma — в браузере не запустить Minecraft.'));
  return invoke('ely_login', { username, password, clientToken: clientToken || null });
}

/** Extends an Ely.by session; throws if the account needs a fresh password. */
export function elyRefresh(accessToken, clientToken) {
  if (!inTauri) return Promise.reject(new Error('Нужно приложение Luma — в браузере не запустить Minecraft.'));
  return invoke('ely_refresh', { accessToken, clientToken });
}

/** Syncs mods, then launches Minecraft directly with the given Ely.by session. */
export function playDirect(ramGb, session) {
  if (!inTauri) return Promise.reject(new Error('Это браузерная версия — скачай Luma для своей системы.'));
  return invoke('play_direct', { ramGb, session });
}

/** The player's real skin/cape from Ely.by, as data URIs ({ skin, cape }, either may be null). */
export function elyTextures(name) {
  if (!inTauri) return Promise.resolve({ skin: null, cape: null });
  return invoke('ely_textures', { name });
}

const SKIN_TTL = 10 * 60 * 1000;
const skinCache = new Map(); // lower-case nick → { at, promise }

/** Any player's Ely.by skin as a data URI, or null (no skin, offline, browser preview).
 * Cached for 10 minutes so a list re-render doesn't refetch; a changed skin shows up after that. */
export function skinFor(name) {
  if (!inTauri || !name) return Promise.resolve(null);
  const key = String(name).toLowerCase();
  const hit = skinCache.get(key);
  if (hit && Date.now() - hit.at < SKIN_TTL) return hit.promise;
  const promise = invoke('ely_skin', { name }).catch(() => null);
  skinCache.set(key, { at: Date.now(), promise });
  return promise;
}

/** The curated shader packs ({ slug, name, tier, ... }) — same list for everyone. */
export function listShaders() {
  return inTauri ? invoke('list_shaders') : Promise.resolve([]);
}

/** Jars in the instance's mods/ folder that aren't part of the pinned pack. */
export function listLocalMods() {
  return inTauri ? invoke('list_local_mods') : Promise.resolve([]);
}

/** Copies a jar (a real filesystem path, e.g. from a window drag-drop event) into mods/. */
export function addLocalMod(path) {
  return inTauri ? invoke('add_local_mod', { path }) : Promise.reject(new Error('Только в приложении.'));
}

export function removeLocalMod(filename) {
  return inTauri ? invoke('remove_local_mod', { filename }) : Promise.reject(new Error('Только в приложении.'));
}

/** `null` turns shaders off; a shader slug downloads it (if needed) and switches Iris to it. */
export function setShader(slug) {
  return inTauri ? invoke('set_shader', { slug: slug || null }) : Promise.reject(new Error('Только в приложении.'));
}

/** 'low' | 'medium' | 'high' — render distance, particles, AO, fps cap and a sensible shader default. */
export function applyPerfPreset(preset) {
  return inTauri ? invoke('apply_perf_preset', { preset }) : Promise.reject(new Error('Только в приложении.'));
}

/** Screenshots the game saved (F2), newest first: [{ file, path, size, taken_ms }]. */
export function listScreenshots() {
  return inTauri ? invoke('list_screenshots') : Promise.resolve([]);
}

/** An <img> src for a screenshot's `path` — the core only lets the screenshots folder through. */
export const screenshotSrc = (path) => convertFileSrc(path);

export const openScreenshotsDir = () => (inTauri ? invoke('open_screenshots_dir') : Promise.resolve(null));

/** The rest take the bare `file` name from `listScreenshots`. */
export const openScreenshot = (file) => invoke('open_screenshot', { file });
export const revealScreenshot = (file) => invoke('reveal_screenshot', { file });
export const copyScreenshot = (file) => invoke('copy_screenshot', { file });
export const deleteScreenshot = (file) => invoke('delete_screenshot', { file });

/** Whether `name` (an Ely.by nickname) is in modpack.json → admins. Only hides the tab — the
 * RCON password is what actually lets commands through. */
export const isAdmin = (name) => !!name && (pack.admins || []).some((a) => a.toLowerCase() === String(name).toLowerCase());

/** { configured, has_password } — RCON port set in modpack.json, password saved on this computer. */
export const adminStatus = () => (inTauri ? invoke('admin_status') : Promise.resolve({ configured: false, has_password: false }));
/** Checks the password against the server (runs `list`), then keeps it in the OS credential store. */
export const adminLogin = (password) => invoke('admin_login', { password });
/** One console command over RCON; resolves with the server's reply. */
export const adminExec = (command) => invoke('admin_exec', { command });
export const adminLogout = () => invoke('admin_logout');

/** Update channels: two lines of the launcher, each with its own releases. */
export const CHANNELS = [{ id: 'yug', label: 'Юг' }, { id: 'sever', label: 'Север' }];
export const channelLabel = (id) => (CHANNELS.find((c) => c.id === id) || CHANNELS[0]).label;

/** The channel this build was released on. */
export const buildChannel = () => (inTauri ? invoke('build_channel') : Promise.resolve('yug'));

/** Checks the channel's newest release (null channel: the build's own); null when already up to date.
 * Resolves with { channel, version, current_version, notes }. */
export function checkUpdate(channel) {
  if (!inTauri) return Promise.resolve(null);
  return invoke('check_update', { channel: channel || null });
}

/** Downloads + installs an update found by `checkUpdate`, then restarts into it.
 * `onProgress({ stage: 'download' | 'install', done, total })` feeds the update screen. On Windows
 * the installer runs silently and starts Luma again itself, so this may never resolve. */
export async function installUpdate(update, onProgress) {
  const stop = onProgress ? await listen('luma://update', (e) => onProgress(e.payload)) : () => {};
  try {
    await invoke('install_update', { channel: update.channel });
  } finally {
    stop();
  }
  await relaunch();
}

export const win = {
  minimize: () => inTauri && getCurrentWindow().minimize(),
  toggleMaximize: () => inTauri && getCurrentWindow().toggleMaximize(),
  close: () => inTauri && getCurrentWindow().close(),
};
