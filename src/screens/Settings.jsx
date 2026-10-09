import { useEffect, useState } from 'react';
import { Slider, Button, Icon, Tabs, Tag, PlayerHead, RankBadge, Input } from '../ds/index.js';
import { systemInfo, inTauri, modpack, elyLogin } from '../native.js';

const plural = (n, [one, few, many]) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many; };

const NAV = [['perf', 'chip', 'Производительность'], ['look', 'sparkle', 'Внешний вид'], ['account', 'user', 'Аккаунт'], ['launcher', 'block', 'О лаунчере']];

export default function Settings({ settings, update, notify, realm, openFolder }) {
  const [nav, setNav] = useState('perf');
  const [sys, setSys] = useState(null);
  useEffect(() => { systemInfo().then(setSys); }, []);

  const [mcUser, setMcUser] = useState('');
  const [mcPass, setMcPass] = useState('');
  const [mcTotp, setMcTotp] = useState(null);
  const [mcErr, setMcErr] = useState(null);
  const [mcBusy, setMcBusy] = useState(false);

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
        <div className="st-nav-foot caption">Сервер: <b>{realm.name} · {modpack.minecraft}</b><br />Память уходит в профиль «Luma» официального Minecraft Launcher</div>
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
              <section className="st-card st-launch">
                <div className="body-strong">Как запускается игра</div>
                <ol className="st-steps">
                  <li><b>Luma</b> скачивает и сверяет {modpack.mods.length} модов ({String(modpack.totalMb).replace('.', ',')} МБ) и ставит Fabric {modpack.loader.version}.</li>
                  <li>Создаёт профиль <b>«Luma»</b> в официальном Minecraft Launcher и добавляет сервер в «Сетевую игру».</li>
                  <li>Открывает Minecraft Launcher: там вход в твой аккаунт Microsoft и Java — нажимаешь «Играть».</li>
                </ol>
                <div className="st-row">
                  <Button size="sm" icon="folder" onClick={() => openFolder()}>Папка игры</Button>
                  <Tag tone="outline" icon="package">Fabric {modpack.minecraft}</Tag>
                </div>
              </section>
            </div>
          </>
        ) : null}
        {nav === 'look' ? (
          <>
            <header className="st-head"><div><h1 className="display-lg">Внешний вид</h1><p className="body st-sub">Тема лаунчера меняется вместе с циклом дня. Пока сервер не подключён — по часам компьютера: день с 7:00 до 19:00.</p></div></header>
            <section className="st-card st-look">
              <div className="body-strong">Тема</div>
              <Tabs value={settings.theme} onChange={(t) => update({ theme: t })} items={[{ id: 'auto', label: 'По циклу дня', icon: 'clock' }, { id: 'night', label: 'Ночь', icon: 'sparkle' }, { id: 'day', label: 'День', icon: 'bolt' }]} />
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
            <header className="st-head"><div><h1 className="display-lg">О лаунчере</h1><p className="body st-sub">Luma 0.1.0 · {inTauri ? 'приложение' : 'браузерная версия'} · {sys ? [sys.os, sys.os_version, sys.arch].filter(Boolean).join(' ') : ''}</p></div></header>
            <section className="st-card st-about">
              <p className="body">Собрано на Tauri 2 (Rust) и React. Интерфейс — дизайн-система Luma: стекло, свет миров, пиксельные цифры и воксельные острова, которые рисуются кодом.</p>
              <p className="body st-sub">Сервер: {modpack.server.address}. Свой вход через Microsoft прямо в Luma появится, когда Mojang одобрит приложение; до тех пор игру запускает официальный Minecraft Launcher.</p>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
