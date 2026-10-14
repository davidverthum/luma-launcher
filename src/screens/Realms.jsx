import { useEffect, useState } from 'react';
import { RealmCard, Tag, Tabs, Icon, IconButton, PlayerHead, Button } from '../ds/index.js';
import { modpack, gameStats } from '../native.js';
import { useFeed, useMcLang, eventText } from '../feed.js';
import { dayLabel, timeLabel } from '../shots.js';

// Minecraft counts time in ticks (20 a second) and travel in centimetres.
const hours = (ticks) => ticks / 20 / 3600;
const km = (cm) => cm / 100000;
const fmt = (n, digits = 0) => n.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
const short = (n) => (n >= 100 ? fmt(n) : fmt(n, 1));

const TILES = [
  { id: 'time', label: 'наиграно', unit: 'ч', icon: 'clock', value: (m) => short(hours(m.playTicks)) },
  { id: 'km', label: 'пройдено', unit: 'км', icon: 'globe', value: (m) => short(km(m.distanceCm)) },
  { id: 'diamonds', label: 'алмазов добыто', icon: 'gem', value: (m) => fmt(m.diamonds) },
  { id: 'mobs', label: 'мобов побеждено', icon: 'bolt', value: (m) => fmt(m.mobKills) },
  { id: 'blocks', label: 'блоков добыто', icon: 'block', value: (m) => fmt(m.blocksMined || 0) },
  { id: 'deaths', label: 'смертей', icon: 'close', value: (m) => fmt(m.deaths) },
];

const BOARDS = [
  { id: 'time', label: 'Время', icon: 'clock', key: (e) => e.playTicks, show: (e) => short(hours(e.playTicks)) + ' ч' },
  { id: 'diamonds', label: 'Алмазы', icon: 'gem', key: (e) => e.diamonds, show: (e) => fmt(e.diamonds) },
  { id: 'km', label: 'Путь', icon: 'globe', key: (e) => e.distanceCm, show: (e) => short(km(e.distanceCm)) + ' км' },
  { id: 'mobs', label: 'Мобы', icon: 'bolt', key: (e) => e.mobKills, show: (e) => fmt(e.mobKills) },
];

function ago(ms) {
  if (!ms) return '';
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return min + ' мин назад';
  if (min < 24 * 60) return Math.round(min / 60) + ' ч назад';
  return new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

/** The player's numbers and the server's leaderboard, as the game (Luma Cosmetics) last saved them. */
function useGameStats() {
  const [stats, setStats] = useState(undefined);
  useEffect(() => {
    let alive = true;
    const load = () => gameStats().then((s) => { if (alive) setStats(s); }).catch(() => { if (alive) setStats(null); });
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return stats;
}

// The chronicle's kinds of lines (Luma Cosmetics: Chronicle.java).
const KINDS = { first_join: 'sparkle', advancement: 'trophy', death: 'skull', boss: 'crown', place: 'pin' };
const CHRONICLE_PAGE = 30;

/** A chronicle line with the player's name picked out. */
function Line({ text, name }) {
  const i = name ? text.indexOf(name) : -1;
  if (i < 0) return text;
  return <>{text.slice(0, i)}<b>{name}</b>{text.slice(i + name.length)}</>;
}

/** What happened on the server, newest first, by day. Lines newer than `since` are marked new. */
function Chronicle({ feed, since, me, openMap }) {
  const lang = useMcLang();
  const [limit, setLimit] = useState(CHRONICLE_PAGE);
  const events = feed && Array.isArray(feed.events) ? [...feed.events].reverse() : [];
  if (!events.length) {
    return (
      <p className="body stats-empty">
        {feed === undefined ? 'Загружаем…' : feed === null
          ? 'Хроника появится, когда на сервере обновят мод Luma Cosmetics: первые заходы, достижения, смерти, победы над боссами и новые места на карте.'
          : 'Пока тихо. Здесь появятся первые заходы, достижения, смерти, победы над боссами и новые места на карте.'}
      </p>
    );
  }
  const groups = [];
  for (const e of events.slice(0, limit)) {
    const label = dayLabel(e.t);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(e);
    else groups.push({ label, items: [e] });
  }
  return (
    <>
      {groups.map((g) => (
        <section key={g.label} className="chron-day">
          <div className="overline chron-day-title">{g.label}</div>
          <ol className="chron-list">
            {g.items.map((e, i) => {
              const text = eventText(e, lang);
              const fresh = since && e.t > since && String(e.player || '').toLowerCase() !== me;
              return (
                <li key={e.t + ':' + i} className={'chron-row is-' + e.kind + (fresh ? ' is-new' : '')}>
                  <span className="chron-icon"><Icon name={KINDS[e.kind] || 'news'} size={12} /></span>
                  <PlayerHead name={e.player || '?'} size={24} />
                  <span className="chron-text"><Line text={text} name={e.player} />{fresh ? <span className="chron-new">новое</span> : null}</span>
                  {e.dim && modpack.server.map ? (
                    <IconButton icon="pin" label="Показать на карте" size="sm" className="chron-map"
                      onClick={() => openMap({ dim: e.dim, x: e.x, y: e.y, z: e.z, label: text })} />
                  ) : null}
                  <span className="caption chron-time">{timeLabel(e.t)}</span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {events.length > limit ? <Button size="sm" className="chron-more" onClick={() => setLimit((n) => n + CHRONICLE_PAGE)}>Показать ещё</Button> : null}
    </>
  );
}

export default function Realms({ realm, setRoute, server, copyAddress, settings, update, openMap, chronicleSince }) {
  const online = server && server.online;
  const stats = useGameStats();
  const chronicle = useFeed('chronicle', 60000);
  const boardFeed = useFeed('board', 5 * 60000);
  const [board, setBoard] = useState('time');
  const me = stats && stats.me;
  const myName = me ? me.name : (settings && settings.mc && settings.mc.name) || '';
  const sort = BOARDS.find((b) => b.id === board) || BOARDS[0];
  // The leaderboard straight from the server when it publishes one, else what the game last saved.
  const local = stats && Array.isArray(stats.board) ? { rows: stats.board, at: stats.boardUpdated || 0 } : null;
  const remote = boardFeed && Array.isArray(boardFeed.board) ? { rows: boardFeed.board, at: boardFeed.updated || 0 } : null;
  const top = remote && (!local || remote.at >= local.at) ? remote : local;
  const rows = top ? [...top.rows].sort((a, b) => sort.key(b) - sort.key(a)).slice(0, 10) : [];

  // Seen here — not «while you were away» on the next launch.
  const newest = chronicle && Array.isArray(chronicle.events) && chronicle.events.length ? chronicle.events[chronicle.events.length - 1].t : 0;
  useEffect(() => {
    if (newest && newest > ((settings && settings.chronicleSeenAt) || 0)) update({ chronicleSeenAt: newest });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newest]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="overline page-kicker">Luma · один сервер для своих</div>
          <h1 className="display-lg">Сервер</h1>
          <p className="body page-sub">Minecraft {modpack.minecraft} на Fabric {modpack.loader.version}, {modpack.mods.length} модов. Лаунчер сам держит сборку в порядке — тебе остаётся нажать «Играть».</p>
        </div>
        <Tag tone="luma" icon="users">{online ? server.players + ' из ' + server.max + ' онлайн' : server ? 'сервер не отвечает' : 'проверяем…'}</Tag>
      </header>

      <div className="stats-row">
        <section className="hcard stats-me">
          <div className="hcard-head"><span className="overline">Твоя статистика</span>{me ? <span className="caption">обновлено {ago(stats.updated)}</span> : null}</div>
          {me ? (
            <div className="stats-tiles">
              {TILES.map((t) => (
                <div key={t.id} className="stats-tile">
                  <Icon name={t.icon} size={16} />
                  <span className="stats-value">{t.value(me)}{t.unit ? <small> {t.unit}</small> : null}</span>
                  <span className="caption">{t.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="body stats-empty">{stats === undefined ? 'Загружаем…' : 'Появится, когда поиграешь на сервере: игра раз в минуту сохраняет её для лаунчера.'}</p>
          )}
        </section>

        <section className="hcard stats-board">
          <div className="hcard-head">
            <span className="overline">Лидеры сервера</span>
            {rows.length ? <span className="caption">обновлено {ago(top.at)}</span> : null}
          </div>
          <Tabs size="sm" value={board} onChange={setBoard} items={BOARDS.map((b) => ({ id: b.id, label: b.label, icon: b.icon }))} />
          {rows.length ? (
            <ol className="board-list">
              {rows.map((e, i) => (
                <li key={e.name} className={'board-row' + (e.name.toLowerCase() === myName.toLowerCase() ? ' is-me' : '')}>
                  <span className={'board-rank' + (i < 3 ? ' is-top' : '')}>{i + 1}</span>
                  <PlayerHead name={e.name} size={24} />
                  <span className="board-name">{e.name}</span>
                  <span className="board-value">{sort.show(e)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="body stats-empty">{stats === undefined && boardFeed === undefined ? 'Загружаем…' : 'Таблица придёт с сервера, когда ты на него зайдёшь, и дальше будет обновляться раз в пять минут.'}</p>
          )}
        </section>
      </div>

      <section className="hcard chron">
        <div className="hcard-head">
          <span className="overline">Хроника сервера</span>
          <Icon name="news" size={16} />
        </div>
        <Chronicle feed={chronicle} since={chronicleSince} me={myName.toLowerCase()} openMap={openMap} />
      </section>

      <div className="realms-grid realms-grid--one">
        <RealmCard realm={realm} selected friends={(server && server.sample) || []} seed={3} onSelect={() => setRoute('home')} />
        <div className="realm-facts">
          <div className="hcard">
            <div className="hcard-head"><span className="overline">Адрес</span></div>
            <button type="button" className="hcard-addr mono" onClick={copyAddress} title="Скопировать">{modpack.server.address.split(':')[0]}<wbr />:{modpack.server.address.split(':')[1]}</button>
            <p className="caption hcard-note">Из любого лаунчера: «Сетевая игра» → «Добавить сервер». Нужна та же сборка модов.</p>
          </div>
          <div className="hcard">
            <div className="hcard-head"><span className="overline">Все моды</span></div>
            <div className="hcard-chips">{modpack.mods.map((m) => <span key={m} className="hcard-chip">{m}</span>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
