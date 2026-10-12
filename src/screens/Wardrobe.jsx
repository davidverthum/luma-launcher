import { useEffect, useMemo, useState } from 'react';
import { SkinViewer, Tabs, Button, Tag, Icon, RankBadge, defaultCape } from '../ds/index.js';
import { skinFor, openElySkins, onElyClosed } from '../native.js';

const CAPES = [
  { id: 'luma', name: 'Плащ Luma', icon: 'block', rarity: 'Сезонный', tone: 'var(--luma-ink)', hex: '#d4ff3d', owned: true },
  { id: 'dawn', name: 'Плащ «Рассвет»', icon: 'sparkle', rarity: 'Награда пропуска', tone: 'var(--realm-dawn)', hex: '#ffb547', owned: true },
  { id: 'soul', name: 'Плащ «Огонь душ»', icon: 'bolt', rarity: 'Редкий', tone: 'var(--realm-techno)', hex: '#4fe3ff', price: 450 },
  { id: 'neon', name: 'Плащ «Неон»', icon: 'crown', rarity: 'Эпический', tone: 'var(--realm-arena)', hex: '#ff5fae', price: 690 },
  { id: 'lava', name: 'Плащ «Лава»', icon: 'gem', rarity: 'Редкий', tone: 'var(--realm-anarchy)', hex: '#ff6b3d', price: 450 },
  { id: 'crystal', name: 'Плащ «Аметист»', icon: 'gift', rarity: 'Легендарный', tone: 'var(--realm-sky)', hex: '#b39bff', price: 990, rank: 'zenith' },
  { id: 'night', name: 'Плащ «Полночь»', icon: 'clock', rarity: 'Обычный', tone: 'var(--ink-2)', hex: '#6e757c', price: 150 },
  { id: 'star', name: 'Плащ «Звездопад»', icon: 'sparkle', rarity: 'Ивентовый', tone: 'var(--luma-ink)', hex: '#e8edf1', locked: true },
];

// Emotecraft's built-in emotes (the jar ships these nine); the wheel opens on X in game.
const EMOTES = [
  { id: 'waving', name: 'Привет', icon: 'users' },
  { id: 'clap', name: 'Аплодисменты', icon: 'sparkle' },
  { id: 'point', name: 'Указать', icon: 'pin' },
  { id: 'here', name: 'Сюда!', icon: 'chat' },
  { id: 'palm', name: 'Фейспалм', icon: 'eye' },
  { id: 'crying', name: 'Плач', icon: 'hourglass' },
  { id: 'backflip', name: 'Сальто', icon: 'bolt' },
  { id: 'kazotsky_kick', name: 'Казачок', icon: 'crown' },
  { id: 'roblox_potion_dance', name: 'Танец с зельем', icon: 'gem' },
];

/** A 64×32 cape texture in one light: dark cloth, a lit stepped hem and a small mark. */
function capeTexture(hex) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#15171a'; x.fillRect(0, 0, 22, 17);
  x.fillStyle = '#23272e'; x.fillRect(1, 1, 10, 16);
  x.fillStyle = hex;
  [[4, 3, 2, 1], [3, 4, 4, 1], [2, 5, 6, 1], [3, 6, 4, 1], [4, 7, 2, 1]].forEach(([a, b, w, h]) => x.fillRect(1 + a, 1 + b, w, h));
  for (let r = 0; r < 4; r++) { const w = 4 + r * 2; x.fillRect(1 + (10 - w) / 2, 13 + r, w, 1); }
  x.globalAlpha = 0.35; x.fillRect(12, 1, 10, 16); x.globalAlpha = 1;
  x.fillStyle = '#15171a'; x.fillRect(12, 1, 10, 3);
  return c.toDataURL('image/png');
}

/** Ely.by can still serve legacy 64×32 skins; the viewer needs 64×64 — mirror the right limbs onto the left. */
function normalizeSkin(dataUri) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (img.height === 64) { resolve(dataUri); return; }
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      x.drawImage(img, 0, 0);
      x.drawImage(c, 0, 16, 16, 16, 16, 48, 16, 16);
      x.drawImage(c, 40, 16, 16, 16, 32, 48, 16, 16);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = dataUri;
  });
}

export default function Wardrobe({ settings, update, notify }) {
  const [sel, setSel] = useState(settings.cape || 'luma');
  const [pose, setPose] = useState('idle');
  const [tab, setTab] = useState('skins');
  const [emote, setEmote] = useState('waving');
  const [elySkin, setElySkin] = useState(null);
  const [elyLoading, setElyLoading] = useState(true);
  const it = CAPES.find((c) => c.id === sel) || CAPES[0];
  const capeTex = useMemo(() => (sel === 'luma' ? defaultCape() : capeTexture(it.hex)), [sel]);
  const worn = settings.cape || 'luma';
  const mcName = (settings.mc && settings.mc.name) || settings.profile.name;

  // The same cached skin as the player's head in the title bar, so both always match.
  const loadSkin = (fresh = false) => {
    if (!mcName) { setElySkin(null); setElyLoading(false); return; }
    setElyLoading(true);
    skinFor(mcName, fresh)
      .then((skin) => (skin ? normalizeSkin(skin) : null))
      .then(setElySkin)
      .catch(() => setElySkin(null))
      .finally(() => setElyLoading(false));
  };
  useEffect(() => loadSkin(), [mcName]);
  // Closing the Ely.by window means the player may have a new skin; Ely.by serves it a moment later.
  useEffect(() => {
    let stop = null;
    onElyClosed(() => { loadSkin(true); setTimeout(() => loadSkin(true), 4000); }).then((f) => { stop = f; });
    return () => { if (stop) stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mcName]);
  const changeSkin = () => openElySkins().catch((e) => notify({ tone: 'danger', icon: 'close', title: 'Не открылось окно Ely.by', body: String((e && e.message) || e) }));

  return (
    <div className="wardrobe">
      <section className="wr-stage">
        <div className="wr-stage-head">
          <div>
            <div className="overline page-kicker">Твой персонаж · {settings.profile.name}</div>
            <h1 className="display-lg">Гардероб</h1>
          </div>
          <div className="seg">
            {[['idle', 'Стоит'], ['walk', 'Идёт'], ['wave', 'Машет']].map(([k, l]) => (
              <button key={k} type="button" className={pose === k ? 'is-on' : ''} onClick={() => setPose(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="wr-model"><SkinViewer scale={10} pose={pose} angle={-24} skin={elySkin || undefined} cape={capeTex} /></div>
        <div className="wr-stage-foot">
          <span className="caption"><Icon name="arrow-left" size={12} /> Тяни, чтобы повернуть <Icon name="arrow-right" size={12} /></span>
          <span className="wr-skin-name"><span className="body-strong">{elyLoading ? 'Загружаем скин…' : elySkin ? 'Скин с Ely.by' : 'Скин по умолчанию'}</span><Tag tone="outline">64×64</Tag></span>
          <span className="wr-skin-actions">
            <Button size="sm" variant="ghost" onClick={() => loadSkin(true)} disabled={elyLoading}>Обновить</Button>
            <Button size="sm" icon="shirt" onClick={changeSkin}>Сменить скин</Button>
          </span>
        </div>
      </section>
      <section className="wr-shop">
        <Tabs size="sm" value={tab} onChange={setTab}
          items={[{ id: 'skins', label: 'Скин', icon: 'shirt' }, { id: 'capes', label: 'Плащи', icon: 'sparkle', count: CAPES.length }, { id: 'emotes', label: 'Эмоции', icon: 'bolt', count: EMOTES.length }, { id: 'pets', label: 'Питомцы', icon: 'gift' }]} />
        {tab === 'skins' ? (
          <div className="wr-panel">
            <div className="title">Твой скин — с Ely.by</div>
            <p className="body">Скин хранится в аккаунте Ely.by, поэтому его видят все игроки на сервере. Нажми «Сменить скин» — страница загрузки Ely.by откроется прямо здесь, в окне лаунчера. Когда закроешь её, новый скин подтянется сам.</p>
            <div className="wr-panel-actions">
              <Button variant="luma" icon="shirt" onClick={changeSkin}>Сменить скин</Button>
              <Button variant="ghost" onClick={() => loadSkin(true)} disabled={elyLoading}>Обновить</Button>
            </div>
          </div>
        ) : null}
        {tab === 'emotes' ? (
          <>
            <div className="wr-grid">
              {EMOTES.map((x) => (
                <button key={x.id} type="button" className={'wr-item' + (emote === x.id ? ' is-on' : '')} style={{ '--tone': 'var(--luma-ink)' }} onClick={() => { setEmote(x.id); if (x.id === 'waving') setPose('wave'); }}>
                  <span className="wr-slot"><Icon name={x.icon} size={36} /></span>
                  <span className="wr-item-name">{x.name}</span>
                  <span className="wr-item-meta">в игре</span>
                </button>
              ))}
            </div>
            <div className="wr-detail">
              <div>
                <div className="wr-detail-name"><span className="title">{(EMOTES.find((e) => e.id === emote) || EMOTES[0]).name}</span></div>
                <div className="caption">В игре нажми <b>X</b> — откроется колесо эмоций. Эмоцию видят все игроки рядом.</div>
              </div>
            </div>
          </>
        ) : null}
        {tab === 'pets' ? (
          <div className="wr-panel">
            <div className="title">Питомцы — в следующем обновлении</div>
            <p className="body">Маленький питомец, который ходит за тобой и виден всем на сервере. Делаем его вместе с настоящими плащами в игре.</p>
          </div>
        ) : null}
        {tab === 'capes' ? (<>
        <div className="wr-grid">
          {CAPES.map((x) => (
            <button key={x.id} type="button" className={'wr-item' + (sel === x.id ? ' is-on' : '') + (x.locked ? ' is-locked' : '')} style={{ '--tone': x.tone }} onClick={() => setSel(x.id)}>
              <span className="wr-slot"><Icon name={x.locked ? 'lock' : x.icon} size={36} /></span>
              <span className="wr-item-name">{x.name}</span>
              <span className="wr-item-meta">{x.owned ? (worn === x.id ? 'Надето' : 'Есть') : x.locked ? 'Ивент' : <><Icon name="gem" size={12} /><span className="lm-led">{x.price}</span></>}</span>
            </button>
          ))}
        </div>
        <div className="wr-detail">
          <div>
            <div className="wr-detail-name"><span className="title">{it.name}</span>{it.rank ? <RankBadge rank={it.rank} size="sm" /> : null}</div>
            <div className="caption wr-rarity" style={{ '--tone': it.tone }}><i />{it.rarity}{it.owned ? ' · в коллекции' : ''}</div>
          </div>
          {it.owned ? (
            worn === it.id ? <Button variant="luma" icon="check" disabled>Надето</Button> : <Button variant="luma" icon="shirt" onClick={() => update({ cape: it.id })}>Надеть</Button>
          ) : it.locked ? <Button icon="lock" disabled>Недоступно</Button> : (
            <Button variant="luma" icon="gem" onClick={() => notify({ icon: 'gem', title: 'Примерка', body: it.name + ' за ' + it.price + ' люменов — покупка заработает с магазином сервера.' })}>Купить · {it.price}</Button>
          )}
        </div>
        </>) : null}
      </section>
    </div>
  );
}
