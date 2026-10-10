import { useEffect, useRef, useState } from 'react';
import { Button, Icon, Input, Tag, Spinner, PlayerHead } from '../ds/index.js';
import { modpack, openUrl, adminStatus, adminLogin, adminExec, adminLogout } from '../native.js';

const errText = (e) => String((e && e.message) || e);
// Nicknames go into commands as arguments — anything else is not a player name.
const NAME = /^[A-Za-z0-9_-]{1,16}$/;
const QUICK = [
  ['bolt', 'День', 'time set day'],
  ['clock', 'Ночь', 'time set night'],
  ['sparkle', 'Ясно', 'weather clear'],
  ['download', 'Сохранить мир', 'save-all'],
  // Vanilla, answers in the same RCON reply (spark's `tps` prints later and never reaches RCON).
  ['chip', 'TPS', 'tick query'],
];

/** `list` → { online, max, names }; null if the reply isn't the vanilla one. */
function parseList(reply) {
  const m = /There are (\d+) of a max(?: of)? (\d+) players online:?\s*([\s\S]*)$/.exec(reply || '');
  if (!m) return null;
  return { online: +m[1], max: +m[2], names: m[3].split(',').map((s) => s.trim()).filter(Boolean) };
}

/** `whitelist list` → names ("There are 2 whitelisted player(s): a, b" / "There are no whitelisted players"). */
function parseWhitelist(reply) {
  const m = /whitelisted players?(?:\(s\))?:\s*([\s\S]*)$/.exec(reply || '');
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
}

/** `banlist players` → names. RCON glues the lines together, so match each "X was banned by". */
const parseBans = (reply) => [...String(reply || '').matchAll(/([A-Za-z0-9_-]{1,16}) was banned by/g)].map((m) => m[1]);

// The console log and command history outlive switching screens (not an app restart); the
// restart countdown keeps sending even while another screen is open.
const session = { log: [], history: [], seq: 0 };
const listeners = new Set();
function record(entry) {
  const i = session.log.findIndex((x) => x.id === entry.id);
  session.log = i < 0 ? [...session.log, entry].slice(-200) : session.log.map((x) => (x.id === entry.id ? entry : x));
  listeners.forEach((f) => f());
}

/** Runs a command over RCON; `quiet` keeps it out of the log. Resolves to { reply } or { error }. */
async function exec(command, quiet) {
  const base = { id: ++session.seq, at: Date.now(), command };
  if (!quiet) record({ ...base, busy: true });
  try {
    const reply = await adminExec(command);
    if (!quiet) record({ ...base, reply });
    return { reply };
  } catch (e) {
    const error = errText(e);
    if (!quiet) record({ ...base, error });
    return { error };
  }
}

const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
const inWords = (s) => (s >= 60 ? Math.round(s / 60) + ' ' + plural(Math.round(s / 60), 'минуту', 'минуты', 'минут') : s + ' ' + plural(s, 'секунду', 'секунды', 'секунд'));
const tellraw = (text, color) => 'tellraw @a ' + JSON.stringify({ text: '[Luma] ' + text, color: color || 'gold' });

// Planned restart: countdown messages in the game chat, then save-all and a reminder to restart
// the server in the hosting panel (RCON can stop a server but nothing could start it again).
const restart = { endsAt: 0, timers: [] };
function startRestart(minutes, onDone) {
  stopRestart(false);
  const total = minutes * 60;
  restart.endsAt = Date.now() + total * 1000;
  exec(tellraw('Рестарт сервера через ' + inWords(total)));
  [600, 300, 120, 60, 30, 10, 5, 4, 3, 2, 1].filter((s) => s < total).forEach((s) => {
    restart.timers.push(setTimeout(() => exec(tellraw(s > 5 ? 'Рестарт сервера через ' + inWords(s) : s + '…', s <= 10 ? 'red' : 'gold')), (total - s) * 1000));
  });
  restart.timers.push(setTimeout(() => {
    exec('save-all');
    exec(tellraw('Рестарт! Мир сохранён — заходите через минуту.', 'red'));
    restart.endsAt = 0;
    restart.timers = [];
    if (onDone) onDone();
  }, total * 1000));
}
function stopRestart(announce) {
  restart.timers.forEach(clearTimeout);
  restart.timers = [];
  if (restart.endsAt && announce) exec(tellraw('Рестарт отменён', 'green'));
  restart.endsAt = 0;
}

export default function Admin({ server, notify }) {
  const [status, setStatus] = useState(null);
  const refreshStatus = () => adminStatus().then(setStatus).catch(() => setStatus({ configured: false, has_password: false }));
  useEffect(() => { refreshStatus(); }, []);

  const online = server && server.online;
  const panel = modpack.server.panel;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="overline page-kicker">Luma · для админов</div>
          <h1 className="display-lg">Админка</h1>
          <p className="body page-sub">Команды уходят на сервер через RCON. Запустить, остановить или перезагрузить сервер — в панели QWERTYX.</p>
        </div>
        <div className="adm-head-actions">
          <Tag tone={online ? 'luma' : 'outline'} icon={online ? 'users' : 'close'}>{online ? server.players + ' из ' + server.max + ' онлайн' : server ? 'сервер выключен' : 'проверяем…'}</Tag>
          {panel ? <Button size="sm" icon="globe" onClick={() => openUrl(panel)}>Панель QWERTYX</Button> : null}
        </div>
      </header>
      {!status ? (
        <div className="shots-loading"><Spinner /><span className="body">Проверяем доступ…</span></div>
      ) : !status.configured ? (
        <section className="st-card adm-note">
          <Icon name="lock" size={24} />
          <div>
            <div className="body-strong">RCON ещё не настроен</div>
            <p className="caption">Включи RCON в server.properties и впиши его порт в modpack.json → server.rcon. После этого здесь появится пульт.</p>
          </div>
        </section>
      ) : !status.has_password ? (
        <Login onDone={(reply) => { refreshStatus(); notify({ icon: 'check', title: 'Подключено', body: reply || 'Сервер принял пароль.' }); }} />
      ) : (
        <Console panel={panel} notify={notify} onLogout={() => adminLogout().then(refreshStatus).catch((e) => notify({ tone: 'danger', icon: 'close', title: 'Не получилось', body: errText(e) }))} />
      )}
    </div>
  );
}

function Login({ onDone }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = (e) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true); setError(null);
    adminLogin(password).then((reply) => { setPassword(''); onDone(reply); }).catch((e2) => setError(errText(e2))).finally(() => setBusy(false));
  };
  return (
    <form className="st-card adm-login" onSubmit={submit}>
      <div className="body-strong">Пароль RCON</div>
      <p className="caption">Тот, что в server.properties → rcon.password. Лаунчер проверит его на сервере и сохранит в защищённом хранилище системы — открытым текстом на диск он не попадает.</p>
      <Input label="Пароль" icon="lock" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }} error={error} autoComplete="off" />
      <Button variant="luma" type="submit" loading={busy} disabled={busy || !password}>Подключить</Button>
    </form>
  );
}

function Console({ panel, notify, onLogout }) {
  const [, rerender] = useState(0);
  const [players, setPlayers] = useState(null);
  const [line, setLine] = useState('');
  const [say, setSay] = useState('');
  const [confirm, setConfirm] = useState(null); // `${name}:ban`
  const [offline, setOffline] = useState(false);
  const histPos = useRef(-1);
  const logBox = useRef(null);
  const log = session.log;

  // session.log is the source of truth, so a reply that lands after leaving the screen is kept.
  useEffect(() => {
    const f = () => rerender((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  useEffect(() => { if (logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight; }, [log]);

  /** Runs a command; `quiet` keeps it out of the log (the periodic `list`). Resolves with the reply or null. */
  const run = async (command, quiet) => {
    const { reply, error } = await exec(command, quiet);
    // A VPN in TUN mode accepts the connection itself and drops it when the server is down.
    setOffline(!!error && /не отвечает|оборвалась/.test(error));
    return error ? null : reply;
  };

  const loadPlayers = () => run('list', true).then((r) => { if (r != null) setPlayers(parseList(r)); });
  useEffect(() => {
    loadPlayers();
    const id = setInterval(loadPlayers, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (name, command, label) => {
    const reply = await run(command + ' ' + name);
    if (reply != null) notify({ icon: 'check', title: label, body: reply || name });
    setConfirm(null);
    loadPlayers();
  };

  const send = (e) => {
    e.preventDefault();
    const cmd = line.trim();
    if (!cmd) return;
    session.history = [cmd, ...session.history.filter((h) => h !== cmd)].slice(0, 50);
    histPos.current = -1;
    setLine('');
    run(cmd);
  };
  const onKey = (e) => {
    const h = session.history;
    if (e.key === 'ArrowUp' && h.length) { histPos.current = Math.min(histPos.current + 1, h.length - 1); setLine(h[histPos.current]); e.preventDefault(); }
    if (e.key === 'ArrowDown') { histPos.current = Math.max(histPos.current - 1, -1); setLine(histPos.current < 0 ? '' : h[histPos.current]); e.preventDefault(); }
  };
  const broadcast = (e) => {
    e.preventDefault();
    const text = say.replace(/[\r\n]+/g, ' ').trim();
    if (!text) return;
    run('say ' + text).then((r) => { if (r != null) setSay(''); });
  };

  return (
    <>
      {offline ? (
        <section className="st-card adm-note adm-note--warn">
          <Icon name="close" size={24} />
          <div>
            <div className="body-strong">RCON не отвечает</div>
            <p className="caption">Сервер выключен, перезагружается или порт RCON закрыт. Запустить сервер можно в панели QWERTYX.</p>
          </div>
          {panel ? <Button size="sm" variant="luma" icon="globe" onClick={() => openUrl(panel)}>Открыть панель</Button> : null}
        </section>
      ) : null}
      <div className="adm-grid">
        <section className="st-card adm-players">
          <div className="st-row">
            <div className="body-strong">Игроки{players ? ' · ' + players.online + ' из ' + players.max : ''}</div>
            <Button size="sm" variant="ghost" onClick={loadPlayers}>Обновить</Button>
          </div>
          {!players ? <p className="caption">Спрашиваем сервер…</p> : !players.names.length ? <p className="caption">Сейчас никого нет.</p> : (
            <ul className="adm-list">
              {players.names.map((name) => (
                <li key={name} className="adm-player">
                  <PlayerHead name={name} size={28} />
                  <span className="body-strong adm-player-name">{name}</span>
                  {NAME.test(name) ? (
                    <span className="adm-player-actions">
                      <Button size="sm" variant="ghost" onClick={() => act(name, 'kick', 'Кикнули')}>Кик</Button>
                      {confirm === name + ':ban'
                        ? <Button size="sm" variant="danger" onClick={() => act(name, 'ban', 'Забанили')} onBlur={() => setConfirm(null)}>Точно бан?</Button>
                        : <Button size="sm" variant="ghost" onClick={() => setConfirm(name + ':ban')}>Бан</Button>}
                      <Button size="sm" variant="ghost" onClick={() => act(name, 'op', 'Выдали OP')}>OP</Button>
                      <Button size="sm" variant="ghost" onClick={() => act(name, 'whitelist add', 'В вайтлисте')}>В вайтлист</Button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="adm-side">
          <section className="st-card">
            <div className="body-strong">Быстрые команды</div>
            <div className="adm-quick">
              {QUICK.map(([icon, label, command]) => <Button key={command} size="sm" icon={icon} onClick={() => run(command)}>{label}</Button>)}
            </div>
          </section>
          <RestartCard panel={panel} notify={notify} />
          <form className="st-card adm-say" onSubmit={broadcast}>
            <div className="body-strong">Объявление в чат</div>
            <Input placeholder="Через 5 минут рестарт" value={say} onChange={(e) => setSay(e.target.value)} maxLength={256}
              right={<Button size="sm" variant="luma" type="submit" disabled={!say.trim()}>В чат</Button>} />
          </form>
        </div>
        <WhitelistCard run={run} />
        <BansCard run={run} />
        <section className="st-card adm-console">
          <div className="st-row">
            <div className="body-strong">Консоль</div>
            <span className="caption">Здесь ответы на команды, отправленные из лаунчера. Полный лог сервера — в панели QWERTYX.</span>
          </div>
          <div className="adm-log mono" role="log" aria-live="polite" ref={logBox}>
            {!log.length ? <div className="adm-log-empty">Команды и ответы появятся здесь. ↑ / ↓ — история.</div> : log.map((x) => (
              <div key={x.id} className="adm-log-entry">
                <div className="adm-log-cmd"><span>{new Date(x.at).toLocaleTimeString('ru-RU')}</span> &gt; {x.command}</div>
                {x.busy ? <div className="adm-log-reply">…</div> : x.error ? <div className="adm-log-reply is-error">{x.error}</div> : <div className="adm-log-reply">{x.reply || '(без ответа)'}</div>}
              </div>
            ))}
          </div>
          <form className="adm-line" onSubmit={send}>
            <Input placeholder="Команда, например: give Rimfyy diamond 3" value={line} onChange={(e) => { setLine(e.target.value); histPos.current = -1; }} onKeyDown={onKey}
              autoComplete="off" spellCheck={false} right={<Button size="sm" variant="luma" type="submit" disabled={!line.trim()}>Выполнить</Button>} />
          </form>
          <div className="adm-foot">
            <Button size="sm" variant="ghost" icon="logout" onClick={onLogout}>Забыть пароль на этом компьютере</Button>
          </div>
        </section>
      </div>
    </>
  );
}

function RestartCard({ panel, notify }) {
  const [, tick] = useState(0);
  const left = restart.endsAt ? Math.max(0, Math.ceil((restart.endsAt - Date.now()) / 1000)) : 0;
  useEffect(() => {
    if (!restart.endsAt) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [restart.endsAt]);
  const begin = (minutes) => {
    startRestart(minutes, () => notify({ icon: 'bolt', title: 'Пора перезапустить сервер', body: 'Отсчёт закончился, мир сохранён. Перезапусти сервер в панели QWERTYX.', duration: 0,
      actions: panel ? [{ label: 'Открыть панель', icon: 'globe', variant: 'luma', run: () => openUrl(panel) }] : undefined }));
    tick((n) => n + 1);
  };
  return (
    <section className="st-card adm-restart">
      <div className="body-strong">Плановый рестарт</div>
      {left ? (
        <div className="st-row">
          <span className="adm-restart-left mono">{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}</span>
          <Button size="sm" variant="ghost" icon="close" onClick={() => { stopRestart(true); tick((n) => n + 1); }}>Отменить</Button>
        </div>
      ) : (
        <div className="adm-quick">
          {[1, 5, 10].map((m) => <Button key={m} size="sm" icon="clock" onClick={() => begin(m)}>Через {m} мин</Button>)}
        </div>
      )}
      <p className="caption">Игроки увидят отсчёт в чате. В конце лаунчер сохранит мир и напомнит перезапустить сервер в панели QWERTYX. Отсчёт идёт, пока лаунчер открыт.</p>
    </section>
  );
}

/** A list from the server with one action per name, plus an "add" field when `onAdd` is given. */
function NameListCard({ title, empty, names, onReload, actionLabel, onAction, addLabel, onAdd, extra }) {
  const [value, setValue] = useState('');
  const add = (e) => {
    e.preventDefault();
    const name = value.trim();
    if (!NAME.test(name)) return;
    setValue('');
    onAdd(name);
  };
  return (
    <section className="st-card adm-names">
      <div className="st-row">
        <div className="body-strong">{title}{names ? ' · ' + names.length : ''}</div>
        <span className="adm-names-tools">{extra}<Button size="sm" variant="ghost" onClick={onReload}>Обновить</Button></span>
      </div>
      {!names ? <p className="caption">Спрашиваем сервер…</p> : !names.length ? <p className="caption">{empty}</p> : (
        <ul className="adm-list">
          {names.map((name) => (
            <li key={name} className="adm-player">
              <PlayerHead name={name} size={28} />
              <span className="body-strong adm-player-name">{name}</span>
              {NAME.test(name) ? <Button size="sm" variant="ghost" onClick={() => onAction(name)}>{actionLabel}</Button> : null}
            </li>
          ))}
        </ul>
      )}
      {onAdd ? (
        <form onSubmit={add}>
          <Input placeholder="Ник игрока" value={value} onChange={(e) => setValue(e.target.value)} maxLength={16} autoComplete="off" spellCheck={false}
            right={<Button size="sm" variant="luma" type="submit" disabled={!NAME.test(value.trim())}>{addLabel}</Button>} />
        </form>
      ) : null}
    </section>
  );
}

function WhitelistCard({ run }) {
  const [names, setNames] = useState(null);
  const load = () => run('whitelist list', true).then((r) => { if (r != null) setNames(parseWhitelist(r)); });
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const then = (command) => run(command).then(load);
  return (
    <NameListCard title="Вайтлист" empty="В вайтлисте никого." names={names} onReload={load}
      actionLabel="Убрать" onAction={(n) => then('whitelist remove ' + n)}
      addLabel="Добавить" onAdd={(n) => then('whitelist add ' + n)}
      extra={<><Button size="sm" variant="ghost" onClick={() => then('whitelist on')}>Вкл</Button><Button size="sm" variant="ghost" onClick={() => then('whitelist off')}>Выкл</Button></>} />
  );
}

function BansCard({ run }) {
  const [names, setNames] = useState(null);
  const load = () => run('banlist players', true).then((r) => { if (r != null) setNames(parseBans(r)); });
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return (
    <NameListCard title="Баны" empty="Никто не забанен." names={names} onReload={load}
      actionLabel="Разбанить" onAction={(n) => run('pardon ' + n).then(load)} />
  );
}
