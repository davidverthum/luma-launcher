import { RealmCard, Tag } from '../ds/index.js';
import { modpack } from '../native.js';

export default function Realms({ realm, setRoute, server, copyAddress }) {
  const online = server && server.online;
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
