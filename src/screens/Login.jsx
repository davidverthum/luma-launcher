import { useState } from 'react';
import { VoxelArt, Logo, Input, Button, IconButton, Toggle, Led, Emblem, REALMS, useDrift, Icon, StatusMark } from '../ds/index.js';
import { win, elyLogin, openUrl } from '../native.js';

export default function Login({ onLogin, isMac }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const online = useDrift(12480, 0.002, 1700);
  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const pass = totp != null ? password + ':' + totp : password;
      const session = await elyLogin(username, pass, null);
      const name = session.selectedProfile.name;
      onLogin({
        profile: { name, rank: null },
        mc: { username, accessToken: session.accessToken, clientToken: session.clientToken, uuid: session.selectedProfile.id, name },
      });
    } catch (e2) {
      const msg = (e2 && e2.message) || String(e2);
      if (msg === '2fa_required') { setTotp(''); setErr('Включена двухфакторная защита — введи код из приложения'); }
      else setErr(msg);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="lg">
      <div className="lg-art">
        <VoxelArt biome="sky" light="var(--realm-sky)" seed={9} fill={0.66} focusX={0.56} focusY={0.44} particles={60} />
        <div className="lg-fade" />
      </div>
      <div className="lg-top" data-tauri-drag-region="">
        {isMac ? <span className="lg-mac-gap" /> : null}
        <Logo height={18} />
        <span className="lg-drag" data-tauri-drag-region="" />
        {!isMac ? <span className="lg-win"><IconButton icon="minus" label="Свернуть" size="sm" onClick={win.minimize} /><IconButton icon="close" label="Закрыть" size="sm" onClick={win.close} /></span> : null}
      </div>
      <div className="lg-pitch">
        <div className="overline lg-kicker">Сеть Minecraft-серверов</div>
        <h1 className="display-lg lg-title">Сеть миров,<br />где всегда горит свет.</h1>
        <div className="lg-stats">
          <span className="lg-online"><Led value={online} size="lg" color="var(--luma-ink)" /><span className="caption">игроков<br />сейчас в сети</span></span>
          <span className="lg-realms">{REALMS.map((r) => <span key={r.id} title={r.name} style={{ color: r.light }}><Emblem realm={r.emblem} size={32} /></span>)}</span>
        </div>
      </div>
      <form className="lg-panel" onSubmit={submit}>
        <div>
          <h2 className="display-md lg-h">С возвращением</h2>
          <p className="body lg-sub">Вход аккаунтом Ely.by — без Microsoft, сервер принимает его напрямую.</p>
        </div>
        <div className="lg-fields">
          <Input label="Ник или e-mail" icon="user" placeholder="Например, Nyx_" value={username} autoFocus onChange={(e) => { setUsername(e.target.value.trim()); setErr(null); }} />
          <Input label="Пароль" icon="lock" type="password" placeholder="••••••••" value={password} onChange={(e) => { setPassword(e.target.value); setErr(null); }} error={totp == null ? err : undefined} />
          {totp != null ? <Input label="Код двухфакторной защиты" icon="lock" value={totp} autoFocus onChange={(e) => setTotp(e.target.value)} error={err} /> : null}
          <Toggle defaultChecked label="Запомнить меня" />
          <Button variant="luma" size="lg" block iconRight={busy ? undefined : 'arrow-right'} loading={busy} disabled={busy} type="submit">Войти</Button>
        </div>
        <div className="lg-or"><span>или</span></div>
        <Button size="lg" block icon="block" type="button" onClick={() => openUrl('https://ely.by/register')}>Нет аккаунта — зарегистрироваться</Button>
        <div className="lg-foot caption">Лаунчер 0.1.0 · <StatusMark status="online" /> аккаунт Ely.by, не Microsoft</div>
      </form>
    </div>
  );
}
