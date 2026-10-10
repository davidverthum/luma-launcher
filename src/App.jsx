import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RealmRail, TitleBar, CommandPalette, Toast, Button, VoxelArt } from './ds/index.js';
import { loadSettings, saveSettings, win, platform, openGameDir, copyText, modpack, authMe, elyRefresh, checkUpdate, installUpdate, appVersion, channelLabel } from './native.js';
import { useServer, liveRealm } from './server.js';
import Login from './screens/Login.jsx';
import Home from './screens/Home.jsx';
import Realms from './screens/Realms.jsx';
import Wardrobe from './screens/Wardrobe.jsx';
import Store from './screens/Store.jsx';
import News from './screens/News.jsx';
import MapScreen from './screens/Map.jsx';
import Settings from './screens/Settings.jsx';

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
const RAIL_FOOTER = [{ id: 'settings', icon: 'settings', label: 'Настройки' }];

export default function App() {
  const [settings, update] = useSettings();
  const [route, setRoute] = useState('home');
  const [palette, setPalette] = useState(false);
  const [toasts, setToasts] = useState([]);
  const isMac = platform() === 'mac';
  useThemeMode(settings && settings.theme);

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
        actions: [{ label: 'Установить', icon: 'download', variant: 'luma', run: () => {
          notify({ icon: 'download', title: 'Устанавливаем ' + upd.version, body: 'Не закрывай лаунчер…', duration: 0 });
          installUpdate(upd).catch((e) => notify({ tone: 'danger', icon: 'close', title: 'Не получилось обновиться', body: String((e && e.message) || e), duration: 10000 }));
        } }],
      });
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded]);

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
    ] },
    { group: 'Сервер', items: [
      { id: 'copy', icon: 'globe', label: 'Скопировать адрес сервера', hint: modpack.server.address, keywords: 'адрес ip айпи', run: copyAddress },
      { id: 'mods', icon: 'package', label: 'Сборка: ' + modpack.mods.length + ' модов', hint: 'Fabric ' + modpack.minecraft, keywords: 'моды mods', run: () => setRoute('settings') },
    ] },
  ], [realm.id, settings && settings.ram, settings && settings.theme]);

  if (!settings) return <div className="app-boot" />;
  if (!settings.profile) {
    return (
      <>
        <Login onLogin={({ profile, mc }) => update((s) => ({ ...s, profile, mc }))} isMac={isMac} />
        <Toasts list={toasts} dismiss={dismiss} />
      </>
    );
  }

  const screenProps = { settings, update, notify, realm, setRealm, setRoute, openFolder, server, copyAddress };
  const screens = {
    home: <Home {...screenProps} />,
    realms: <Realms {...screenProps} />,
    wardrobe: <Wardrobe {...screenProps} />,
    store: <Store {...screenProps} />,
    news: <News {...screenProps} />,
    map: <MapScreen {...screenProps} />,
    settings: <Settings {...screenProps} />,
  };

  return (
    <div className={'app' + (isMac ? ' is-mac' : '') + (route === 'home' ? ' has-art' : '')} style={{ '--realm': realm.light }}>
      {route === 'home' ? (
        <div className="app-art" aria-hidden="true">
          <VoxelArt key={realm.id} biome={realm.biome} light={realm.light} seed={3} fill={0.62} focusX={0.57} focusY={0.43} particles={48} />
          <div className="app-art-fade" />
        </div>
      ) : null}
      <div className="app-rail">
        <RealmRail realms={[realm]} value={realm.id} onChange={() => setRoute('home')} footer={RAIL_FOOTER} onFooter={(id) => setRoute(id)} />
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
