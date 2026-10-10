import { useLayoutEffect, useRef, useState } from 'react';
import { PlayButton, IconButton, Tag, Led, Ping, HeadStack, Emblem, FriendRow, Icon } from '../ds/index.js';
import { inTauri, modpack, onProgress, playDirect, screenshotSrc } from '../native.js';
import { useScreenshots, shotCount, dayLabel, timeLabel } from '../shots.js';

const HIGHLIGHTS = ['Touhou Little Maid: Orihime', 'Waystones', "Traveler's Backpack", "Farmer's Delight Refabricated", "Xaero's Minimap", "Xaero's World Map", 'Carry On', 'Comforts', 'EMI', 'Sodium', 'Iris Shaders', 'Jade'];
const CATS = ['Чэнь', 'Орин', 'Мике'];

/** Keeps the voxel art (drawn by App behind the hero) ending just under the hero text and the
 * island just above it, so a tall window — a portrait monitor — doesn't strand the island at the
 * top with empty space below. At the usual sizes it changes nothing (70vh art, island at 43%). */
function useArtFit(kickerRef, onArtFit) {
  useLayoutEffect(() => {
    const kicker = kickerRef.current;
    const app = kicker && kicker.closest('.app');
    if (!app || !onArtFit) return;
    const fit = () => {
      const top = kicker.getBoundingClientRect().top - app.getBoundingClientRect().top;
      const h = Math.max(Math.min(app.clientHeight * 0.7, 760), top + 120);
      const fy = Math.max(0.43, (top - 300) / h);
      // A narrow main column (portrait window): move the island left, clear of the side panel.
      const main = kicker.closest('.home-main');
      const art = app.querySelector('.app-art');
      const fx = main && art && main.clientWidth < 800 ? Math.max(0.3, (main.clientWidth * 0.55) / art.clientWidth) : 0.57;
      onArtFit((cur) => (cur && Math.abs(cur.h - h) < 2 && Math.abs(cur.fy - fy) < 0.005 && Math.abs(cur.fx - fx) < 0.005 ? cur : { h, fy, fx }));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(app);
    return () => { ro.disconnect(); onArtFit(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default function Home({ realm: r, settings, notify, setRoute, openFolder, server, onArtFit }) {
  const kickerRef = useRef(null);
  useArtFit(kickerRef, onArtFit);
  const [state, setState] = useState('ready');
  const [p, setP] = useState(0);
  const [stage, setStage] = useState('');
  const busy = state === 'downloading' || state === 'launching';
  const ram = settings.ram[r.id] || 0; // 0 → the core picks half the RAM, 3–6 GB
  const known = server !== null && server !== undefined;
  const online = known && server.online;
  const here = (known && server.sample) || [];
  const [shots] = useScreenshots();
  const latest = shots && shots[0];

  const STAGE_LABEL = { mods: 'Моды', version: 'Версия игры', client: 'Клиент', libraries: 'Библиотеки', assets: 'Ресурсы', launch: 'Запуск' };

  const play = async () => {
    if (busy) return;
    if (!inTauri) {
      notify({ icon: 'bolt', title: 'Это браузерная версия', body: 'Скачай Luma для Windows, macOS или Linux: там «Играть» ставит сборку и запускает Minecraft.' });
      return;
    }
    if (!settings.mc) {
      notify({ icon: 'lock', title: 'Нужен Minecraft-аккаунт', body: 'Привяжи аккаунт Ely.by в настройках — без него на сервер не зайти.', duration: 10000,
        actions: [{ label: 'Настройки', icon: 'settings', variant: 'luma', run: () => setRoute('settings') }] });
      return;
    }
    setState('downloading'); setP(0); setStage('Проверяем сборку');
    const stop = await onProgress((e) => {
      setP(e.total_bytes ? e.done_bytes / e.total_bytes : (e.total_files ? e.done_files / e.total_files : 0));
      const label = STAGE_LABEL[e.stage] || 'Готовим';
      setStage(e.done_files < e.total_files ? label + ' ' + (e.done_files + 1) + ' из ' + e.total_files + (e.current ? ' · ' + e.current : '') : label + ' готовы');
    });
    try {
      const mc = settings.mc;
      const session = { accessToken: mc.accessToken, clientToken: mc.clientToken, selectedProfile: { id: mc.uuid, name: mc.name } };
      setState('launching');
      await playDirect(ram, session);
      notify({ icon: 'play', title: 'Запускаем', body: 'Minecraft стартует отдельным окном — переключись в игру.', duration: 8000 });
    } catch (err) {
      notify({ tone: 'danger', icon: 'close', title: 'Не получилось запустить', body: String((err && err.message) || err), duration: 12000 });
    } finally {
      stop();
      setTimeout(() => { setState('ready'); setP(0); setStage(''); }, 1500);
    }
  };

  const sub = state === 'ready' ? r.name + ' · Fabric ' + modpack.minecraft + ' · ' + (ram ? ram + ' ГБ' : 'память авто') : stage;

  return (
    <div className="home">
      <div className="home-main">
        <section className="hero">
          <div className="overline hero-kicker" ref={kickerRef}><Emblem realm={r.emblem} size={16} color={r.light} />{r.kind}</div>
          <h1 className="display-xl hero-name">{r.name}</h1>
          <p className="body-lg hero-desc">{r.desc}</p>
          <div className="hero-tags">
            <Tag tone="realm" color={r.light}>Fabric {modpack.minecraft}</Tag>
            {r.tags.slice(0, 1).concat(r.tags.slice(2)).map((t) => <Tag key={t}>{t}</Tag>)}
          </div>
          <div className="hero-stats">
            <span className="hero-stat"><Led value={known ? server.players : 0} size="lg" color="var(--ink)" animate={false} /><span className="caption">{known && server.max ? 'из ' + server.max : 'игроков'}<br />онлайн</span></span>
            {online ? (server.latency_ms ? <Ping ms={server.latency_ms} /> : null) : <Tag tone="outline" icon={known ? 'close' : 'clock'} className={known ? 'tag-offline' : undefined}>{known ? 'сервер не отвечает' : 'проверяем сервер'}</Tag>}
            {here.length ? <span className="hero-here"><HeadStack names={here} max={3} size={24} /><span className="caption">{here[0]}{here.length > 1 ? ' и ещё ' + (here.length - 1) : ''} уже здесь</span></span> : null}
          </div>
          <div className="hero-play">
            <PlayButton state={state} progress={p} sub={sub} onClick={play} onMenu={() => setRoute('settings')} menuLabel="Память и запуск" />
            <IconButton icon="folder" label="Папка игры" variant="glass" size="lg" onClick={() => openFolder()} />
            <IconButton icon="settings" label="Настройки" variant="glass" size="lg" onClick={() => setRoute('settings')} />
          </div>
        </section>
        <section className="bento">
          <div className="hcard hcard--pack">
            <div className="hcard-head"><span className="overline">Сборка</span><Icon name="package" size={16} /></div>
            <div className="hcard-title"><Led value={modpack.mods.length} size="lg" color="var(--luma-ink)" animate={false} /><span className="title">модов · {String(modpack.totalMb).replace('.', ',')} МБ</span></div>
            <div className="hcard-chips">{HIGHLIGHTS.map((m) => <span key={m} className="hcard-chip">{m.replace(': Orihime', '').replace(' Refabricated', '')}</span>)}</div>
            <p className="caption hcard-note">Luma сама скачивает и обновляет моды — сверяет каждый файл с сервером.</p>
          </div>
          <div className="hcard hcard--cat">
            <div className="hcard-head"><span className="overline">У каждого своя</span><Icon name="sparkle" size={16} /></div>
            <div className="title">Кошкодевочка</div>
            <p className="body hcard-text">При первом входе рядом с тобой появится горничная — {CATS.join(', ').replace(/, ([^,]*)$/, ' или $1')}. Ходит за тобой, помогает в бою и на ферме.</p>
            <p className="caption hcard-note">ПКМ по ней — её меню: задачи и инвентарь.</p>
          </div>
          <button type="button" className={'hcard hcard--shots' + (latest ? ' has-shot' : '')} onClick={() => setRoute('shots')}>
            {latest ? <img className="hcard-shot" src={screenshotSrc(latest.path)} alt="" decoding="async" draggable={false} /> : null}
            <span className="hcard-head"><span className="overline">Скриншоты</span><Icon name="camera" size={16} /></span>
            <span className="title">{latest ? dayLabel(latest.taken_ms) + ', ' + timeLabel(latest.taken_ms) : 'Пока пусто'}</span>
            <span className="caption hcard-note">{latest ? shotCount(shots.length) + ' · открыть альбом' : 'Нажми F2 в игре — снимок появится здесь сам.'}</span>
          </button>
        </section>
      </div>
      <aside className="side">
        <div className="side-head">
          <span className="title">На сервере</span>
          <span className="caption side-count"><i className={'lm-mark-dot ' + (online ? 'is-online' : 'is-offline')} />{known ? (online ? server.players + ' из ' + server.max : 'выключен') : '…'}</span>
        </div>
        <div className="side-list">
          {here.length ? here.map((name) => <FriendRow key={name} name={name} status="ingame" activity="играет на Luma" realmColor={r.light} compact action="none" />) : (
            <div className="side-empty">
              <Icon name={online ? 'sparkle' : 'clock'} size={24} />
              <p className="body">{!known ? 'Спрашиваем сервер…' : online ? 'Сейчас никого. Зайди первым — кошкодевочка уже ждёт.' : 'Сервер не отвечает. Возможно, он выключен или закончилась оплата хостинга.'}</p>
              {known && server.players > here.length ? <p className="caption">Сервер не показывает ники всех игроков.</p> : null}
            </div>
          )}
        </div>
        <p className="caption side-foot">{known ? 'Проверено в ' + new Date(server.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + ' · обновляется каждые 30 с' : ''}</p>
      </aside>
    </div>
  );
}
