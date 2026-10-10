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
  ['users', 'Вайтлист', 'whitelist list'],
  ['lock', 'Баны', 'banlist'],
];

/** `list` → { online, max, names }; null if the reply isn't the vanilla one. */
function parseList(reply) {
  const m = /There are (\d+) of a max(?: of)? (\d+) players online:?\s*([\s\S]*)$/.exec(reply || '');
  if (!m) return null;
  return { online: +m[1], max: +m[2], names: m[3].split(',').map((s) => s.trim()).filter(Boolean) };
}

// The console log and command history outlive switching screens (not an app restart).
const session = { log: [], history: [], seq: 0 };

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
  const put = (entry) => {
    const i = session.log.findIndex((x) => x.id === entry.id);
    session.log = i < 0 ? [...session.log, entry].slice(-200) : session.log.map((x) => (x.id === entry.id ? entry : x));
    rerender((n) => n + 1);
  };
  useEffect(() => { if (logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight; }, [log]);

  /** Runs a command; `quiet` keeps it out of the log (the periodic `list`). Resolves with the reply or null. */
  const run = async (command, quiet) => {
    const base = { id: ++session.seq, at: Date.now(), command };
    if (!quiet) put({ ...base, busy: true });
    try {
      const reply = await adminExec(command);
      setOffline(false);
      if (!quiet) put({ ...base, reply });
      return reply;
    } catch (e) {
      const error = errText(e);
      // A VPN in TUN mode accepts the connection itself and drops it when the server is down.
      if (/не отвечает|оборвалась/.test(error)) setOffline(true);
      if (!quiet) put({ ...base, error });
      return null;
    }
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
          <form className="st-card adm-say" onSubmit={broadcast}>
            <div className="body-strong">Объявление в чат</div>
            <Input placeholder="Через 5 минут рестарт" value={say} onChange={(e) => setSay(e.target.value)} maxLength={256}
              right={<Button size="sm" variant="luma" type="submit" disabled={!say.trim()}>В чат</Button>} />
          </form>
        </div>
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
