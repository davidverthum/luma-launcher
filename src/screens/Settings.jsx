import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Slider, Button, Icon, Tabs, Tag, PlayerHead, RankBadge, Input, Toggle } from '../ds/index.js';
import { CHANNEL_INFO, historyFor } from '../changelog.js';
import { systemInfo, inTauri, modpack, packMods, openUrl, elyLogin, checkUpdate, appVersion, CHANNELS, channelLabel, buildChannel, listShaders, listLocalMods, addLocalMod, removeLocalMod, setLocalModEnabled, modCards, setShader, applyPerfPreset } from '../native.js';

const plural = (n, [one, few, many]) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many; };

const NAV = [['perf', 'chip', 'Производительность'], ['mods', 'package', 'Моды'], ['look', 'sparkle', 'Внешний вид'], ['account', 'user', 'Аккаунт'], ['launcher', 'block', 'О лаунчере']];
const PRESETS = [['low', 'Слабый ПК'], ['medium', 'Средний'], ['high', 'Мощный']];

/** A Modrinth icon, or a package glyph while it loads or when Modrinth doesn't know the mod. */
function ModIcon({ card }) {
  return <span className="mod-icon">{card && card.icon ? <img src={card.icon} alt="" loading="lazy" /> : <Icon name="package" size={24} />}</span>;
}

export default function Settings({ settings, update, notify, realm, openFolder, initialNav, startUpdate }) {
  const [nav, setNav] = useState(initialNav || 'perf');
  const [sys, setSys] = useState(null);
  useEffect(() => { systemInfo().then(setSys); }, []);

  const [mcUser, setMcUser] = useState('');
  const [mcPass, setMcPass] = useState('');
  const [mcTotp, setMcTotp] = useState(null);
  const [mcErr, setMcErr] = useState(null);
  const [mcBusy, setMcBusy] = useState(false);

  const [upd, setUpd] = useState(null);
  const [updChecking, setUpdChecking] = useState(false);
  const [builtOn, setBuiltOn] = useState(null);
  useEffect(() => { buildChannel().then(setBuiltOn).catch(() => setBuiltOn('yug')); }, []);
  const channel = settings.updateChannel || builtOn;

  const [presetBusy, setPresetBusy] = useState(null);
  const runPreset = (preset) => {
    setPresetBusy(preset);
    applyPerfPreset(preset)
      .then(() => { update((s) => ({ ...s, perfPreset: preset })); notify({ icon: 'bolt', title: 'Готово', body: 'Настройки применятся при следующем «Играть».' }); })
      .catch((e) => notify({ tone: 'danger', icon: 'close', title: 'Не применилось', body: String((e && e.message) || e) }))
      .finally(() => setPresetBusy(null));
  };

  const [shaders, setShaders] = useState([]);
  const [activeShader, setActiveShader] = useState(settings.shader || null);
  const [shaderBusy, setShaderBusy] = useState(null);
  const [localMods, setLocalMods] = useState([]);
  const [modDrag, setModDrag] = useState(false);
  const [modBusy, setModBusy] = useState(false);
  const [cards, setCards] = useState({ pack: {}, local: {} });
  const refreshLocalMods = (freshCards) => {
    listLocalMods().then(setLocalMods).catch(() => {});
    modCards(freshCards).then(setCards).catch(() => {});
  };
  useEffect(() => {
    if (nav !== 'mods') return;
    listShaders().then(setShaders).catch(() => {});
    refreshLocalMods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav]);
  const toggleMod = (m) => {
    setLocalMods((list) => list.map((x) => (x.file === m.file ? { ...x, enabled: !m.enabled } : x)));
    setLocalModEnabled(m.file, !m.enabled)
      .catch((e) => { notify({ tone: 'danger', icon: 'close', title: 'Не переключилось', body: String((e && e.message) || e) }); refreshLocalMods(); });
  };
  useEffect(() => {
    if (nav !== 'mods' || !inTauri) return;
    let unlisten = null;
    getCurrentWindow().onDragDropEvent((e) => {
      const t = e.payload.type;
      if (t === 'enter' || t === 'over') { setModDrag(true); return; }
      if (t === 'leave' || t === 'cancel') { setModDrag(false); return; }
      if (t !== 'drop') return;
      setModDrag(false);
      const jars = e.payload.paths.filter((p) => p.toLowerCase().endsWith('.jar'));
      if (!jars.length) { notify({ tone: 'danger', icon: 'close', title: 'Это не .jar', body: 'Перетащи файл мода.' }); return; }
      setModBusy(true);
      Promise.all(jars.map((p) => addLocalMod(p)))
        .then((names) => { notify({ icon: 'check', title: 'Добавлено', body: names.join(', ') }); refreshLocalMods(true); })
        .catch((e2) => notify({ tone: 'danger', icon: 'close', title: 'Не добавилось', body: String((e2 && e2.message) || e2) }))
        .finally(() => setModBusy(false));
    }).then((u) => { unlisten = u; });
    return () => { if (unlisten) unlisten(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav]);

  const pickShader = (slug) => {
    setShaderBusy(slug || 'off');
    setShader(slug)
      .then(() => { setActiveShader(slug); update((s) => ({ ...s, shader: slug })); })
      .catch((e) => notify({ tone: 'danger', icon: 'close', title: 'Не включилось', body: String((e && e.message) || e) }))
      .finally(() => setShaderBusy(null));
  };
  const dropMod = (filename) => {
    removeLocalMod(filename).then(refreshLocalMods).catch((e) => notify({ tone: 'danger', icon: 'close', title: 'Не удалилось', body: String((e && e.message) || e) }));
  };

  const checkForUpdate = (ch = channel) => {
    setUpd(null);
    setUpdChecking(true);
    checkUpdate(ch).then((u) => { setUpd(u); if (!u) notify({ icon: 'check', title: 'Это последняя версия', body: 'Luma ' + appVersion + ' — в ветке «' + channelLabel(ch) + '» обновлений нет.' }); })
      .catch((e) => notify({ tone: 'danger', icon: 'close', title: 'Не проверилось', body: String((e && e.message) || e) }))
      .finally(() => setUpdChecking(false));
  };
  const pickChannel = (ch) => {
    if (ch === channel) return;
    update({ updateChannel: ch });
    checkForUpdate(ch);
  };
  // The update screen (App) takes it from here: progress, quiet install, restart.
  const installFoundUpdate = () => { if (upd) startUpdate(upd); };

  const linkEly = async (e) => {
    e.preventDefault();
    setMcErr(null);
    setMcBusy(true);
    try {
      const password = mcTotp != null ? mcPass + ':' + mcTotp : mcPass;
      const session = await elyLogin(mcUser, password, null);
      const name = session.selectedProfile.name;
      update((s) => ({ ...s, profile: { ...s.profile, name }, mc: { username: mcUser, accessToken: session.accessToken, clientToken: session.clientToken, uuid: session.selectedProfile.id, name } }));
      notify({ icon: 'check', title: 'Снова в деле', body: name + ' может заходить на сервер.' });
      setMcUser(''); setMcPass(''); setMcTotp(null);
    } catch (err) {
      const msg = (err && err.message) || String(err);
      if (msg === '2fa_required') { setMcTotp(''); setMcErr('Включена двухфакторная защита — введи код из приложения'); }
      else setMcErr(msg);
    } finally {
      setMcBusy(false);
    }
  };
  const total = sys ? Math.max(4, Math.floor(sys.memory_gb)) : 16;
  const maxRam = Math.max(4, Math.min(32, total - 2));
  // Same rule as the Rust core uses when nothing is set: half the RAM, 3–6 GB.
  const auto = Math.min(6, Math.max(3, Math.floor(total / 2)));
  const rec = maxRam >= 6 ? [4, 6] : [3, maxRam];
  const ram = Math.min(maxRam, settings.ram[realm.id] || auto);
  const setRam = (v) => update((s) => ({ ...s, ram: { ...s.ram, [realm.id]: v } }));
  const marks = [];
  for (let x = 2; x <= maxRam; x += maxRam > 16 ? 4 : 2) marks.push({ value: x, label: x });

  const hw = sys ? [sys.cpu, sys.cores + ' ' + plural(sys.cores, ['поток', 'потока', 'потоков']), Math.round(sys.memory_gb) + ' ГБ памяти'].filter(Boolean).join(', ') : 'проверяем железо…';

  return (
    <div className="settings">
      <nav className="st-nav">
        <div className="overline st-nav-title">Настройки</div>
        {NAV.map(([id, icon, label]) => (
          <button key={id} type="button" className={'st-nav-item' + (nav === id ? ' is-on' : '')} onClick={() => setNav(id)}>
            <Icon name={icon} size={24} /><span>{label}</span>
          </button>
        ))}
        <div className="st-nav-foot caption">Сервер: <b>{realm.name} · {modpack.minecraft}</b><br />Luma запускает игру сама, без официального лаунчера</div>
      </nav>
      <div className="st-main">
        {nav === 'perf' ? (
          <>
            <header className="st-head">
              <div>
                <h1 className="display-lg">Производительность</h1>
                <p className="body st-sub">Железо: {hw}. Для сборки из {modpack.mods.length} модов хватает 4–6 ГБ.</p>
              </div>
              <Button variant="luma" icon="bolt" onClick={() => { setRam(auto); notify({ icon: 'bolt', title: 'Готово', body: 'Выставили ' + auto + ' ГБ памяти — применится при следующем «Играть».' }); }}>Автонастройка</Button>
            </header>
            <div className="st-grid">
              <section className="st-card">
                <Slider label="Память для игры" value={ram} onChange={setRam} min={2} max={maxRam} step={1} unit="ГБ" recommend={rec} marks={marks} />
              </section>
              <section className="st-card">
                <div className="body-strong">Пресет под твой ПК</div>
                <p className="caption">Дальность прорисовки, частицы, сглаживание теней и шейдеры — всё разом. Применится при следующем «Играть».</p>
                <div className="st-row">
                  {PRESETS.map(([id, label]) => (
                    <Button key={id} size="sm" variant={settings.perfPreset === id ? 'luma' : 'glass'} loading={presetBusy === id} disabled={!!presetBusy} onClick={() => runPreset(id)}>{label}</Button>
                  ))}
                </div>
              </section>
              <section className="st-card st-launch">
                <div className="body-strong">Как запускается игра</div>
                <ol className="st-steps">
                  <li><b>Luma</b> скачивает и сверяет {modpack.mods.length} модов ({String(modpack.totalMb).replace('.', ',')} МБ), версию игры и Java — ничего ставить вручную не нужно.</li>
                  <li>Запускает Minecraft напрямую со своим аккаунтом Ely.by — без официального лаунчера и Microsoft.</li>
                </ol>
                <div className="st-row">
                  <Button size="sm" icon="folder" onClick={() => openFolder()}>Папка игры</Button>
                  <Tag tone="outline" icon="package">Fabric {modpack.minecraft}</Tag>
                </div>
              </section>
            </div>
          </>
        ) : null}
        {nav === 'mods' ? (
          <>
            <header className="st-head"><div><h1 className="display-lg">Моды</h1><p className="body st-sub">Шейдеры и свои моды поверх сборки — Luma их не трогает при обновлении.</p></div></header>
            <section className="st-card">
              <div className="body-strong">Шейдеры</div>
              <div className="st-row">
                <Button size="sm" variant={!activeShader ? 'luma' : 'glass'} loading={shaderBusy === 'off'} disabled={!!shaderBusy} onClick={() => pickShader(null)}>Выключены</Button>
                {shaders.map((s) => (
                  <Button key={s.slug} size="sm" variant={activeShader === s.slug ? 'luma' : 'glass'} loading={shaderBusy === s.slug} disabled={!!shaderBusy} onClick={() => pickShader(s.slug)}>{s.name}</Button>
                ))}
              </div>
            </section>
            <section className="st-card">
              <div className="body-strong">Свои моды</div>
              <p className="caption">Перетащи .jar в окно лаунчера, пока открыта эта вкладка.</p>
              <div className="st-row" style={{ border: '1px dashed var(--line)', borderRadius: 12, padding: 16, opacity: modDrag ? 1 : 0.6, justifyContent: 'center' }}>
                <Icon name="download" size={24} />
                <span className="caption">{modBusy ? 'Добавляем…' : modDrag ? 'Отпусти, чтобы добавить' : 'Перетащи .jar сюда'}</span>
              </div>
              {localMods.length ? (
                <ul className="mod-list">
                  {localMods.map((m) => {
                    const c = cards.local[m.file];
                    return (
                      <li key={m.file} className={'mod-row' + (m.enabled ? '' : ' is-off')}>
                        <ModIcon card={c} />
                        <span className="mod-text">
                          <span className="body-strong">{c ? c.title : m.file.replace(/\.jar$/i, '')}</span>
                          <span className="mono caption">{m.file}{m.enabled ? '' : ' · выключен'}</span>
                        </span>
                        <Toggle checked={m.enabled} onChange={() => toggleMod(m)} label={undefined} />
                        <Button size="sm" variant="ghost" icon="trash" onClick={() => dropMod(m.file)}>Убрать</Button>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="caption">Своих модов пока нет.</p>}
            </section>
            <section className="st-card">
              <div className="st-row"><div className="body-strong">Моды сборки · {modpack.mods.length}</div><span className="caption">Ставятся и обновляются сами. Нажми, чтобы открыть на Modrinth.</span></div>
              <div className="mod-grid">
                {packMods.map((m) => {
                  const c = cards.pack[m.slug];
                  return (
                    <button key={m.slug} type="button" className="mod-card" onClick={() => openUrl(c ? c.url : 'https://modrinth.com/mod/' + m.slug)} title={c ? c.description : m.name}>
                      <ModIcon card={c} />
                      <span className="mod-text">
                        <span className="body-strong">{c ? c.title : m.name}</span>
                        <span className="caption">{c ? c.description : m.version}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}
        {nav === 'look' ? (
          <>
            <header className="st-head"><div><h1 className="display-lg">Внешний вид</h1><p className="body st-sub">Тема лаунчера меняется вместе с циклом дня. Пока сервер не подключён — по часам компьютера: день с 7:00 до 19:00.</p></div></header>
            <section className="st-card st-look">
              <div className="body-strong">Тема</div>
              <Tabs value={settings.theme} onChange={(t) => update({ theme: t })} items={[{ id: 'auto', label: 'По циклу дня', icon: 'clock' }, { id: 'night', label: 'Ночь', icon: 'sparkle' }, { id: 'day', label: 'День', icon: 'bolt' }]} />
            </section>
            <section className="st-card st-toggles st-look-notify">
              <Toggle label="Когда кто-то заходит на сервер" hint="Уведомление в лаунчере, а если он свёрнут — уведомление Windows."
                checked={settings.notifyJoins !== false} onChange={(v) => update({ notifyJoins: v })} />
            </section>
          </>
        ) : null}
        {nav === 'account' ? (
          <>
            <header className="st-head"><div><h1 className="display-lg">Аккаунт</h1><p className="body st-sub">Аккаунт Ely.by — вход в лаунчер и на сервер, без Microsoft.</p></div></header>
            <section className="st-card st-account">
              {settings.mc ? (
                <>
                  <PlayerHead name={settings.mc.name} skin={settings.skin || undefined} size={56} ring />
                  <div className="st-account-text">
                    <div className="st-account-name"><span className="title">{settings.mc.name}</span>{settings.profile.rank ? <RankBadge rank={settings.profile.rank} /> : null}</div>
                    <span className="caption">Аккаунт Ely.by</span>
                  </div>
                  <Button icon="logout" variant="ghost" onClick={() => update((s) => ({ ...s, profile: null, mc: null }))}>Выйти</Button>
                </>
              ) : (
                <form className="lg-fields" onSubmit={linkEly} style={{ width: '100%' }}>
                  <div className="body-strong">Сессия Ely.by истекла — войди ещё раз</div>
                  <p className="caption">Без этого не откроется «Играть».</p>
                  <Input label="Ник или e-mail" icon="user" value={mcUser} onChange={(e) => { setMcUser(e.target.value); setMcErr(null); }} autoComplete="username" />
                  <Input label="Пароль" icon="lock" type="password" value={mcPass} onChange={(e) => { setMcPass(e.target.value); setMcErr(null); }} autoComplete="current-password" />
                  {mcTotp != null ? <Input label="Код двухфакторной защиты" icon="lock" value={mcTotp} onChange={(e) => setMcTotp(e.target.value)} error={mcErr} /> : null}
                  {mcTotp == null && mcErr ? <div className="lm-input-error" role="alert"><Icon name="close" size={12} />{mcErr}</div> : null}
                  <Button variant="luma" loading={mcBusy} disabled={mcBusy} type="submit">Войти</Button>
                </form>
              )}
            </section>
          </>
        ) : null}
        {nav === 'launcher' ? (
          <>
            <header className="st-head"><div><h1 className="display-lg">О лаунчере</h1><p className="body st-sub">Luma {appVersion}{builtOn ? ' · ветка «' + channelLabel(builtOn) + '»' : ''} · {inTauri ? 'приложение' : 'браузерная версия'} · {sys ? [sys.os, sys.os_version, sys.arch].filter(Boolean).join(' ') : ''}</p></div></header>
            <section className="st-card st-about">
              <p className="body">Собрано на Tauri 2 (Rust) и React. Интерфейс — дизайн-система Luma: стекло, свет миров, пиксельные цифры и воксельные острова, которые рисуются кодом.</p>
              <p className="body st-sub">Сервер: {modpack.server.address}. Вход на сервер — через Ely.by, без Microsoft.</p>
            </section>
            {inTauri ? (
              <section className="st-card st-about st-channel">
                <div className="body-strong">Ветка обновлений</div>
                <p className="caption">У лаунчера две линии со своими выпусками. После смены ветки лаунчер предложит поставить её последнюю версию — даже если номер у неё меньше.</p>
                {channel ? <Tabs value={channel} onChange={pickChannel} items={CHANNELS} /> : null}
                <div className="st-channels">
                  {CHANNELS.map((c) => {
                    const info = CHANNEL_INFO[c.id];
                    return (
                      <div key={c.id} className={'st-channel-card' + (channel === c.id ? ' is-on' : '')}>
                        <div className="body-strong">{c.label}{builtOn === c.id ? <span className="caption"> · стоит сейчас</span> : null}</div>
                        <p className="caption">{info.about}</p>
                        {info.only ? <><div className="overline st-channel-only">Сейчас есть только тут</div><ul>{info.only.map((f) => <li key={f}>{f}</li>)}</ul></> : null}
                      </div>
                    );
                  })}
                </div>
                <div className="st-row">
                  {upd ? (
                    <Button variant="luma" icon="download" onClick={installFoundUpdate}>Установить {upd.version} · {channelLabel(upd.channel)}</Button>
                  ) : (
                    <Button icon="download" loading={updChecking} disabled={updChecking || !channel} onClick={() => checkForUpdate()}>Проверить обновления</Button>
                  )}
                </div>
              </section>
            ) : null}
            <section className="st-card st-about st-changelog">
              <div className="body-strong">Что нового</div>
              {historyFor(builtOn || 'yug', appVersion).map((e) => (
                <div key={e.version + (e.channel || '')} className="st-release">
                  <div className="st-release-head">
                    <span className="title">{e.version}</span>
                    {e.channel ? <Tag tone={e.channel === 'sever' ? 'luma' : 'outline'}>{channelLabel(e.channel)}</Tag> : null}
                    {e.version === appVersion && (!e.channel || e.channel === (builtOn || 'yug')) ? <span className="caption">стоит сейчас</span> : null}
                  </div>
                  <ul>{e.items.map((it) => <li key={it}>{it}</li>)}</ul>
                </div>
              ))}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
