import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RealmRail, TitleBar, CommandPalette, Toast, Button, VoxelArt } from './ds/index.js';
import { loadSettings, saveSettings, win, platform, openGameDir, copyText, modpack, authMe, elyRefresh, checkUpdate, installUpdate, appVersion, channelLabel, isAdmin, buildChannel, onGameCrash, notifySystem } from './native.js';
import { notesFor } from './changelog.js';
import { useFitZoom } from './zoom.js';
import { useServer, liveRealm } from './server.js';
import Login from './screens/Login.jsx';
import Home from './screens/Home.jsx';
import Realms from './screens/Realms.jsx';
import Wardrobe from './screens/Wardrobe.jsx';
import Store from './screens/Store.jsx';
import News from './screens/News.jsx';
import MapScreen from './screens/Map.jsx';
import Shots from './screens/Shots.jsx';
import Admin from './screens/Admin.jsx';
import Settings from './screens/Settings.jsx';
import Updating from './screens/Updating.jsx';
import Crash from './screens/Crash.jsx';

const DEFAULTS = {
  profile: null,
  mc: null,
  realm: 'luma',
  theme: 'auto',
  ram: {},
  toggles: { cycle: true, preload: true, overlay: false, shaders: false },
  java: 'j21',
  skin: null,
  cape: 'luma',
  balance: 1250,
  shader: null,
  perfPreset: null,
  updateChannel: null, // 'yug' | 'sever'; null — the channel this build came from
  seenVersion: null, // the version whose «Что нового» was already shown
  notifyJoins: true, // «X теперь на сервере»
};

function useSettings() {
  const [s, setS] = useState(null);
  const timer = useRef(0);
  useEffect(() => {
    loadSettings().then((v) => setS({ ...DEFAULTS, ...v, toggles: { ...DEFAULTS.toggles, ...(v && v.toggles) }, ram: { ...(v && v.ram) } }));
  }, []);
  const update = useCallback((patch) => {
    setS((cur) => {
      const next = typeof patch === 'function' ? patch(cur) : { ...cur, ...patch };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { saveSettings(next).catch((e) => console.warn('save_settings', e)); }, 250);
      return next;
    });
  }, []);
  return [s, update];
}

/** night · day · auto (follows the day cycle; until a server is connected — the computer's clock). */
function useThemeMode(mode) {
  useEffect(() => {
    const apply = () => {
      let t = mode || 'auto';
      if (t === 'auto') { const h = new Date().getHours(); t = h >= 7 && h < 19 ? 'day' : 'night'; }
      document.documentElement.setAttribute('data-theme', t);
    };
    apply();
    const id = setInterval(apply, 60 * 1000);
    return () => clearInterval(id);
  }, [mode]);
}

let toastSeq = 0;
const NAV = [{ id: 'home', label: 'Главная' }, { id: 'realms', label: 'Сервер' }, { id: 'map', label: 'Карта' }, { id: 'wardrobe', label: 'Гардероб' }, { id: 'news', label: 'Новости' }];
// The title bar has no room for another tab at the minimum window width, so the album lives in the rail.
const RAIL_FOOTER = [{ id: 'shots', icon: 'camera', label: 'Скриншоты' }, { id: 'settings', icon: 'settings', label: 'Настройки' }];
const RAIL_FOOTER_ADMIN = [RAIL_FOOTER[0], { id: 'admin', icon: 'crown', label: 'Админка' }, RAIL_FOOTER[1]];

export default function App() {
  const [settings, update] = useSettings();
  const [route, setRoute] = useState('home');
  const [palette, setPalette] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [settingsNav, setSettingsNav] = useState(null); // open Settings on this tab once
  const [artFit, setArtFit] = useState(null); // { h, fy, fx } from Home — see useArtFit
  const isMac = platform() === 'mac';
  useThemeMode(settings && settings.theme);
  useFitZoom();
  useEffect(() => { if (route !== 'settings') setSettingsNav(null); }, [route]);

  const token = settings && settings.profile && settings.profile.token;
  useEffect(() => {
    if (!token) return;
    let alive = true;
    authMe(token).then((fresh) => {
      if (alive) update((s) => (s && s.profile ? { ...s, profile: { ...s.profile, ...fresh } } : s));
    }).catch(() => {
      if (alive) { update({ profile: null }); notify({ tone: 'danger', icon: 'lock', title: 'Сессия истекла', body: 'Войди ещё раз.' }); }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const mcToken = settings && settings.mc && settings.mc.accessToken;
  useEffect(() => {
    if (!mcToken) return;
    let alive = true;
    elyRefresh(settings.mc.accessToken, settings.mc.clientToken).then((session) => {
      if (alive) update((s) => (s && s.mc ? { ...s, mc: { ...s.mc, accessToken: session.accessToken, clientToken: session.clientToken } } : s));
    }).catch(() => {
      if (alive) { update((s) => (s ? { ...s, mc: null } : s)); notify({ tone: 'danger', icon: 'lock', title: 'Minecraft-аккаунт отвязан', body: 'Сессия Ely.by истекла — привяжи аккаунт заново в настройках.' }); }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mcToken]);

  // The update screen: { upd, stage: 'download' | 'install', done, total, error }.
  const [updating, setUpdating] = useState(null);
  const startUpdate = useCallback((upd) => {
    setUpdating({ upd, stage: 'download', done: 0, total: null, error: null });
    installUpdate(upd, (p) => setUpdating((u) => (u ? { ...u, ...p } : u)))
      .catch((e) => setUpdating((u) => (u ? { ...u, error: String((e && e.message) || e) } : u)));
  }, []);

  // Once per launch, on the channel picked in settings (none picked: the build's own).
  const settingsLoaded = !!settings;
  useEffect(() => {
    if (!settingsLoaded) return;
    let alive = true;
    checkUpdate(settings.updateChannel).then((upd) => {
      if (!alive || !upd) return;
      const switching = upd.channel !== upd.from_channel;
      notify({
        icon: 'download', duration: 0,
        title: switching ? 'Переход на ветку «' + channelLabel(upd.channel) + '» · ' + upd.version : 'Доступно обновление ' + upd.version,
        body: switching
          ? 'Сейчас стоит ' + appVersion + ' из ветки «' + channelLabel(upd.from_channel) + '». Лаунчер поставит ветку «' + channelLabel(upd.channel) + '» и перезапустится.'
          : 'Сейчас установлена ' + appVersion + '. Лаунчер скачает и установит новую версию, затем перезапустится.',
        actions: [{ label: 'Установить', icon: 'download', variant: 'luma', run: () => startUpdate(upd) }],
      });
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded]);

  // «Что нового» once per installed version, after login.
  const loggedIn = !!(settings && settings.profile);
  useEffect(() => {
    if (!loggedIn || settings.seenVersion === appVersion) return;
    let alive = true;
    buildChannel().then((ch) => {
      if (!alive) return;
      update({ seenVersion: appVersion });
      const notes = notesFor(ch, appVersion);
      if (!notes) return;
      const more = notes.items.length - 1;
      notify({
        icon: 'sparkle', duration: 15000,
        title: 'Что нового в ' + appVersion + (notes.channel ? ' · ' + channelLabel(notes.channel) : ''),
        body: notes.items[0] + (more > 0 ? ' И ещё ' + more + ' — в «О лаунчере».' : ''),
        actions: [{ label: 'Все изменения', icon: 'news', variant: 'luma', run: () => { setSettingsNav('launcher'); setRoute('settings'); } }],
      });
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  const notify = useCallback((t) => {
    const id = ++toastSeq;
    const duration = t.duration === 0 ? 0 : t.duration || 6000;
    setToasts((list) => [...list.slice(-2), { ...t, id, duration }]);
    if (duration) setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), duration);
    return id;
  }, []);
  const dismiss = (id) => setToasts((list) => list.filter((x) => x.id !== id));

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
      if (e.key === 'Escape') setPalette(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const server = useServer();
  const realm = liveRealm(server);

  // «X теперь на сервере»: names new to the server's player sample since the last poll. Only
  // between two answers from a running server, so a restart doesn't announce everyone.
  const lastSample = useRef(null);
  useEffect(() => {
    if (!server) return;
    const prev = lastSample.current;
    const now = server.online ? server.sample || [] : null;
    lastSample.current = now;
    if (!prev || !now || !settings || settings.notifyJoins === false) return;
    const me = String((settings.mc && settings.mc.name) || '').toLowerCase();
    const joined = now.filter((n) => !prev.includes(n) && n.toLowerCase() !== me);
    if (!joined.length) return;
    const title = (joined.length === 1 ? joined[0] : joined.slice(0, -1).join(', ') + ' и ' + joined[joined.length - 1]) + ' теперь на сервере';
    const body = 'Онлайн ' + server.players + ' из ' + server.max + ' — заходи!';
    notify({ head: joined[0], title, body, duration: 10000, actions: [{ label: 'Играть', icon: 'play', variant: 'luma', run: () => setRoute('home') }] });
    if (!document.hasFocus()) notifySystem(title, body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server]);

  // Minecraft quit badly → the crash dialog (and a system notification if the launcher is behind the game).
  const [crash, setCrash] = useState(null);
  useEffect(() => {
    let stop = null;
    onGameCrash((c) => {
      setCrash(c);
      if (!document.hasFocus()) notifySystem('Игра вылетела', c.summary || 'Открой Luma — там причина и отчёт.');
    }).then((f) => { stop = f; });
    return () => { if (stop) stop(); };
  }, []);
  const admin = !!settings && isAdmin(settings.mc ? settings.mc.name : settings.profile && settings.profile.name);
  const setRealm = () => update({ realm: 'luma' });
  const openFolder = async () => {
    try {
      const path = await openGameDir();
      notify({ icon: 'folder', title: 'Открыли папку игры', body: path || 'В браузерной версии папок нет — открой Luma как приложение.' });
    } catch (e) { notify({ tone: 'danger', icon: 'close', title: 'Не открыли папку', body: String(e) }); }
  };
  const copyAddress = async () => {
    const ok = await copyText(modpack.server.address);
    notify({ icon: ok ? 'check' : 'close', title: ok ? 'Адрес скопирован' : 'Не скопировалось', body: modpack.server.address });
  };

  const groups = useMemo(() => [
    { group: 'Действия', items: [
      { id: 'play', icon: 'play', label: 'Играть на «' + realm.name + '»', hint: realm.loader + ' ' + realm.version, run: () => setRoute('home') },
      { id: 'folder', icon: 'folder', label: 'Открыть папку игры', hint: 'моды, скриншоты, настройки', run: () => openFolder() },
      { id: 'ram', icon: 'chip', label: 'Настроить память', hint: (settings && settings.ram[realm.id] ? settings.ram[realm.id] + ' ГБ' : 'авто'), keywords: 'память ram оперативная', run: () => setRoute('settings') },
      { id: 'theme', icon: 'sparkle', label: 'Сменить тему', hint: 'ночь · день · по циклу дня', keywords: 'тема темная светлая', run: () => update((s) => ({ ...s, theme: s.theme === 'night' ? 'day' : s.theme === 'day' ? 'auto' : 'night' })) },
      { id: 'wardrobe', icon: 'shirt', label: 'Гардероб', hint: 'скины и плащи', run: () => setRoute('wardrobe') },
      { id: 'map', icon: 'pin', label: 'Карта', hint: 'живая 3D-карта сервера', run: () => setRoute('map') },
      { id: 'shots', icon: 'camera', label: 'Скриншоты', hint: 'альбом снимков из игры', keywords: 'скрины screenshots f2 альбом фото', run: () => setRoute('shots') },
    ] },
    { group: 'Сервер', items: [
      { id: 'copy', icon: 'globe', label: 'Скопировать адрес сервера', hint: modpack.server.address, keywords: 'адрес ip айпи', run: copyAddress },
      { id: 'mods', icon: 'package', label: 'Сборка: ' + modpack.mods.length + ' модов', hint: 'Fabric ' + modpack.minecraft, keywords: 'моды mods', run: () => setRoute('settings') },
      ...(admin ? [{ id: 'admin', icon: 'crown', label: 'Админка', hint: 'команды, игроки, объявления', keywords: 'админ консоль rcon кик бан команда', run: () => setRoute('admin') }] : []),
    ] },
  ], [realm.id, settings && settings.ram, settings && settings.theme, admin]);

  if (!settings) return <div className="app-boot" />;
  if (!settings.profile) {
    return (
      <>
        <Login onLogin={({ profile, mc }) => update((s) => ({ ...s, profile, mc }))} isMac={isMac} />
        <Toasts list={toasts} dismiss={dismiss} />
      </>
    );
  }

  const screenProps = { settings, update, notify, realm, setRealm, setRoute, openFolder, server, copyAddress, startUpdate };
  const screens = {
    home: <Home {...screenProps} onArtFit={setArtFit} />,
    realms: <Realms {...screenProps} />,
    wardrobe: <Wardrobe {...screenProps} />,
    store: <Store {...screenProps} />,
    news: <News {...screenProps} />,
    map: <MapScreen {...screenProps} />,
    shots: <Shots {...screenProps} />,
    admin: admin ? <Admin {...screenProps} /> : null,
    settings: <Settings {...screenProps} initialNav={settingsNav} />,
  };

  return (
    <div className={'app' + (isMac ? ' is-mac' : '') + (route === 'home' ? ' has-art' : '')} style={{ '--realm': realm.light }}>
      {route === 'home' ? (
        <div className="app-art" aria-hidden="true" style={artFit ? { height: artFit.h } : undefined}>
          <VoxelArt key={realm.id} biome={realm.biome} light={realm.light} seed={3} fill={0.62} focusX={artFit ? artFit.fx : 0.57} focusY={artFit ? artFit.fy : 0.43} particles={48} />
          <div className="app-art-fade" />
        </div>
      ) : null}
      <div className="app-rail">
        <RealmRail realms={[realm]} value={realm.id} onChange={() => setRoute('home')} footer={admin ? RAIL_FOOTER_ADMIN : RAIL_FOOTER} onFooter={(id) => setRoute(id)} />
      </div>
      <div className="app-top">
        <TitleBar nav={NAV} active={['home', 'realms', 'map', 'wardrobe', 'news'].includes(route) ? route : 'none'} onNav={setRoute}
          user={{ name: settings.profile.name, rank: settings.profile.rank }} balance={null} notifications={0}
          onSearch={() => setPalette(true)} onAccount={() => setRoute('settings')}
          onNotifications={() => notify({ icon: 'bell', title: server && server.online ? 'Сервер работает' : 'Сервер не отвечает', body: server && server.online ? 'Онлайн ' + server.players + ' из ' + server.max + ' · ' + modpack.server.address : 'Проверим ещё раз через полминуты.' })}
          brand={isMac} controls={!isMac} onMinimize={win.minimize} onMaximize={win.toggleMaximize} onClose={win.close} />
      </div>
      <main className={'app-main route-' + route}>{screens[route] || screens.home}</main>
      <CommandPalette open={palette} groups={groups} onClose={() => setPalette(false)} onSelect={(it) => { setPalette(false); it.run && it.run(); }} />
      <Toasts list={toasts} dismiss={dismiss} />
      {crash ? <Crash crash={crash} notify={notify} onClose={() => setCrash(null)} /> : null}
      {updating ? <Updating state={updating} onRetry={() => startUpdate(updating.upd)} onClose={() => setUpdating(null)} /> : null}
    </div>
  );
}

function Toasts({ list, dismiss }) {
  return (
    <div className="app-toasts" aria-live="polite">
      {list.map((t) => (
        <Toast key={t.id} title={t.title} body={t.body} icon={t.icon} head={t.head} tone={t.tone} duration={t.duration || undefined}
          actions={t.actions ? t.actions.map((a) => <Button key={a.label} size="sm" variant={a.variant || 'glass'} icon={a.icon} onClick={() => { a.run && a.run(); dismiss(t.id); }}>{a.label}</Button>) : null}
          onClose={() => dismiss(t.id)} />
      ))}
    </div>
  );
}
