// What the server publishes for the launcher without anyone playing — Luma Cosmetics 1.2 writes it
// into BlueMap's web folder: the chronicle, places on the map, who's on (and who stepped away), the
// leaderboard, which map shows which dimension. Plus the game's own words for the chronicle's lines.
import { useEffect, useState } from 'react';
import { modpack, serverFeed, mcLang } from './native.js';

const last = new Map(); // feed → its last answer, so a screen opened again doesn't start empty

/** Polls one feed now, every `ms` and when the window gets focus. undefined until the first answer,
 * null while the server doesn't publish it; a failed poll keeps what came before. */
export function useFeed(name, ms = 60000) {
  const [value, setValue] = useState(() => last.get(name));
  useEffect(() => {
    let alive = true;
    const load = () => serverFeed(name)
      .then((v) => { last.set(name, v); if (alive) setValue(v); })
      .catch(() => { if (alive) setValue((cur) => (cur === undefined ? null : cur)); });
    load();
    const id = setInterval(load, ms);
    window.addEventListener('focus', load);
    return () => { alive = false; clearInterval(id); window.removeEventListener('focus', load); };
  }, [name, ms]);
  return value;
}

let langCache = null;
/** The game's Russian translations, or null until the game has been launched once. */
export function useMcLang() {
  const [lang, setLang] = useState(langCache);
  useEffect(() => {
    if (langCache) return undefined;
    let alive = true;
    mcLang().then((l) => { if (l) langCache = l; if (alive) setLang(l); });
    return () => { alive = false; };
  }, []);
  return lang;
}

/** Minecraft's "%s" / "%1$s" / "%%". */
function format(template, args) {
  let next = 0;
  return template.replace(/%(?:(\d+)\$)?([sd%])/g, (m, pos, type) => {
    if (type === '%') return '%';
    const i = pos ? Number(pos) - 1 : next++;
    return i < args.length ? args[i] : '';
  });
}

// In game the brackets mark an advancement you can hover; here «[Алмазы!]» reads better as «Алмазы!».
const OWN_WORDS = { 'chat.square_brackets': '%s' };

/** A Minecraft text component (chat JSON) as a plain string in the given language. `miss.key` is
 * set when a translation key was neither known nor given a fallback. */
export function mcText(node, lang, miss = {}) {
  if (node == null) return '';
  if (typeof node !== 'object') return String(node);
  if (Array.isArray(node)) return node.map((n) => mcText(n, lang, miss)).join('');
  let s = '';
  if (typeof node.text === 'string') s = node.text;
  else if (typeof node.translate === 'string') {
    let tpl = OWN_WORDS[node.translate] || (lang && typeof lang[node.translate] === 'string' ? lang[node.translate] : null);
    if (tpl == null && typeof node.fallback === 'string') tpl = node.fallback;
    if (tpl == null) { miss.key = node.translate; tpl = node.translate; }
    s = format(tpl, (Array.isArray(node.with) ? node.with : []).map((a) => mcText(a, lang, miss)));
  } else if (typeof node.keybind === 'string') s = node.keybind;
  if (Array.isArray(node.extra)) s += node.extra.map((n) => mcText(n, lang, miss)).join('');
  return s;
}

/** A chronicle line in Russian: the game's own words when the launcher has them, else the server's text. */
export function eventText(e, lang) {
  if (e.msg) {
    try {
      const miss = {};
      const s = mcText(JSON.parse(e.msg), lang, miss);
      if (!miss.key && s) return s;
    } catch { /* not JSON — the plain text below */ }
  }
  return e.plain || '';
}

export const DIMENSIONS = { 'minecraft:overworld': 'Обычный мир', 'minecraft:the_nether': 'Незер', 'minecraft:the_end': 'Энд' };
export const dimName = (dim) => DIMENSIONS[dim] || String(dim || '').replace(/^minecraft:/, '');

// The server's BlueMap maps, until Luma Cosmetics publishes maps.json (dimension → map id).
const FALLBACK_MAPS = { 'minecraft:overworld': 'overworld_2', 'minecraft:the_nether': 'nether_2', 'minecraft:the_end': 'end_2' };

/** The map at a spot: { dim, x, y, z }. BlueMap reads #map:x:y:z:distance:rotation:angle:tilt:ortho:mode
 * when the page opens and whenever the part after # changes. */
export function mapUrl(spot, maps) {
  const base = String(modpack.server.map || '').replace(/\/+$/, '');
  if (!spot) return base;
  const id = (maps && typeof maps[spot.dim] === 'string' && maps[spot.dim]) || FALLBACK_MAPS[spot.dim] || FALLBACK_MAPS['minecraft:overworld'];
  const n = (v) => Math.round(Number(v) || 0);
  return base + '/#' + [id, n(spot.x), n(spot.y), n(spot.z), 120, 0, 0.8, 0, 0, 'perspective'].join(':');
}

/** Whether an address (the game's "host:port") is this launcher's server. */
export function isOurServer(address) {
  const norm = (a) => {
    const [host, port] = String(a || '').trim().toLowerCase().split(':');
    return host ? host + ':' + (port || '25565') : '';
  };
  return !!address && norm(address) === norm(modpack.server.address);
}

/** Minecraft's time of day (0 = 6:00) as a clock and a word. */
export function mcClock(dayTime) {
  const t = ((Number(dayTime) || 0) % 24000 + 24000) % 24000;
  const h = (Math.floor(t / 1000) + 6) % 24;
  const m = Math.floor((t % 1000) * 60 / 1000);
  const word = t >= 23000 || t < 1000 ? 'рассвет' : t < 11000 ? 'день' : t < 13000 ? 'закат' : 'ночь';
  return h + ':' + String(m).padStart(2, '0') + ', ' + word;
}

export const WEATHER = { clear: 'ясно', rain: 'дождь', thunder: 'гроза' };

/** online.json → Map of lower-case name → { afk, afkMin }; empty when it's old (the server is down). */
export function onlineNow(feed) {
  const out = new Map();
  if (!feed || !Array.isArray(feed.players) || Math.abs(Date.now() - (feed.updated || 0)) > 3 * 60000) return out;
  for (const p of feed.players) if (p && p.name) out.set(String(p.name).toLowerCase(), { name: p.name, afk: !!p.afk, afkMin: p.afkMin || 0 });
  return out;
}
