import { useEffect, useMemo, useState } from 'react';
import { SkinViewer, Tabs, Button, Tag, Icon } from '../ds/index.js';
import { CAPES, PETS, TITLES, NAME_COLORS, TRAILS, capeImage, lookOf } from '../cosmetics.js';
import { skinFor, openElySkins, onElyClosed, setLook, isAdmin } from '../native.js';


// Luma Cosmetics rereads the pick every couple of seconds, so a running game changes too.
const INSTANT = 'В игре — через пару секунд, даже если она уже запущена.';

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
  const it = CAPES.find((c) => c.id === sel) || null;
  const capeTex = useMemo(() => (it ? capeImage(it.id) : false), [sel]);
  const worn = settings.cape || 'luma';
  const pet = settings.pet || 'none';
  const [petSel, setPetSel] = useState(pet === 'none' ? PETS[0].id : pet);
  const petIt = PETS.find((p) => p.id === petSel) || PETS[0];
  const mcName = (settings.mc && settings.mc.name) || settings.profile.name;
  const titleIt = TITLES.find((t) => t.id === settings.title) || null;
  const colorIt = NAME_COLORS.find((c) => c.id === settings.nameColor) || null;
  // The server gives operators the crown; the launcher's admin list is its best guess.
  const admin = isAdmin(mcName);
  const wear = (patch) => {
    update(patch);
    setLook(lookOf({ ...settings, ...patch })).catch(() => {});
  };

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
        <div className="wr-model">
          <div className="wr-nameplate" aria-label="Так тебя видят в игре">
            {titleIt ? <span className="wr-nameplate-title">{titleIt.name}</span> : null}
            <span className="wr-nameplate-name" style={colorIt ? { color: colorIt.hex } : undefined}>
              {admin ? <span className="wr-nameplate-crown">♛</span> : null}{mcName}
            </span>
          </div>
          <SkinViewer scale={10} pose={pose} angle={-24} skin={elySkin || undefined} cape={capeTex} />
        </div>
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
          items={[{ id: 'skins', label: 'Скин', icon: 'shirt' }, { id: 'capes', label: 'Плащи', icon: 'sparkle' }, { id: 'pets', label: 'Питомцы', icon: 'gift' }, { id: 'emotes', label: 'Эмоции', icon: 'bolt' }, { id: 'style', label: 'Стиль', icon: 'crown' }]} />
        <div className="wr-shop-body">
        {tab === 'style' ? (
          <div className="wr-style">
            <section className="wr-style-part">
              <div className="body-strong">Титул над ником</div>
              <div className="wr-chips">
                {[{ id: '', name: 'Без титула' }, ...TITLES].map((x) => (
                  <button key={x.id || 'none'} type="button" className={'wr-chip' + ((settings.title || '') === x.id ? ' is-on' : '')} onClick={() => wear({ title: x.id || null })}>{x.name}</button>
                ))}
              </div>
            </section>
            <section className="wr-style-part">
              <div className="body-strong">Цвет ника</div>
              <div className="wr-colors">
                {[{ id: '', name: 'Белый', hex: '#f3f5f0' }, ...NAME_COLORS].map((x) => {
                  const on = (settings.nameColor || '') === x.id;
                  return (
                    <button key={x.id || 'none'} type="button" className={'wr-color' + (on ? ' is-on' : '')} style={{ '--sw': x.hex }} onClick={() => wear({ nameColor: x.id || null })} title={x.name} aria-label={x.name} aria-pressed={on}>
                      {on ? <Icon name="check" size={12} /> : null}
                    </button>
                  );
                })}
              </div>
            </section>
            <section className="wr-style-part">
              <div className="body-strong">След за тобой</div>
              <div className="wr-grid">
                {[{ id: '', name: 'Без следа', icon: 'close', note: 'ничего' }, ...TRAILS].map((x) => (
                  <button key={x.id || 'none'} type="button" className={'wr-item' + ((settings.trail || '') === x.id ? ' is-on' : '')} style={{ '--tone': x.id ? 'var(--luma-ink)' : 'var(--ink-3)' }} onClick={() => wear({ trail: x.id || null })}>
                    <span className="wr-slot wr-slot--sm"><Icon name={x.icon} size={24} /></span>
                    <span className="wr-item-name">{x.name}</span>
                    <span className="wr-item-meta">{x.note}</span>
                  </button>
                ))}
              </div>
            </section>
            <p className="caption wr-style-note">
              Меняется сразу, в игре — через пару секунд. Видят все игроки на сервере с Luma.
              {admin ? ' Корона ♛ у ника — потому что ты админ сервера.' : ''}
            </p>
          </div>
        ) : null}
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
        {tab === 'pets' ? (<>
          <div className="wr-grid">
            {PETS.map((x) => (
              <button key={x.id} type="button" className={'wr-item' + (petSel === x.id ? ' is-on' : '')} style={{ '--tone': x.tone }} onClick={() => setPetSel(x.id)}>
                <span className="wr-slot"><Icon name="gift" size={36} /></span>
                <span className="wr-item-name">{x.name}</span>
                <span className="wr-item-meta">{pet === x.id ? 'С тобой' : 'в игре'}</span>
              </button>
            ))}
          </div>
          <div className="wr-detail">
            <div>
              <div className="wr-detail-name"><span className="title">{petIt.name}</span></div>
              <div className="caption">Ходит рядом и виден всем на сервере. Прячется, когда ты крадёшься, — засаду не выдаст.</div>
            </div>
            <span className="wr-detail-actions">
              {pet !== 'none' ? <Button variant="ghost" onClick={() => { wear({ pet: 'none' }); notify({ icon: 'gift', title: 'Питомец остался дома', body: INSTANT }); }}>Без питомца</Button> : null}
              {pet === petIt.id ? <Button variant="luma" icon="check" disabled>С тобой</Button> : <Button variant="luma" icon="gift" onClick={() => { wear({ pet: petIt.id }); notify({ icon: 'gift', title: petIt.name + ' с тобой', body: INSTANT }); }}>Взять</Button>}
            </span>
          </div>
        </>) : null}
        {tab === 'capes' ? (<>
        <div className="wr-grid">
          {CAPES.map((x) => (
            <button key={x.id} type="button" className={'wr-item' + (sel === x.id ? ' is-on' : '')} style={{ '--tone': x.tone }} onClick={() => setSel(x.id)}>
              <span className="wr-slot"><Icon name={x.icon} size={36} /></span>
              <span className="wr-item-name">{x.name}</span>
              <span className="wr-item-meta">{worn === x.id ? 'Надето' : x.rarity}</span>
            </button>
          ))}
          <button type="button" className={'wr-item' + (sel === 'none' ? ' is-on' : '')} style={{ '--tone': 'var(--ink-3)' }} onClick={() => setSel('none')}>
            <span className="wr-slot"><Icon name="close" size={36} /></span>
            <span className="wr-item-name">Без плаща</span>
            <span className="wr-item-meta">{worn === 'none' ? 'Надето' : 'плащ с Ely.by, если есть'}</span>
          </button>
        </div>
        <div className="wr-detail">
          <div>
            <div className="wr-detail-name"><span className="title">{it ? it.name : 'Без плаща'}</span></div>
            <div className="caption">{it ? 'Его видят все игроки на сервере — и на элитрах тоже.' : 'Будет виден твой плащ с Ely.by, если он у тебя есть.'}</div>
          </div>
          {worn === sel ? <Button variant="luma" icon="check" disabled>Надето</Button> : <Button variant="luma" icon="shirt" onClick={() => { wear({ cape: sel }); notify({ icon: 'shirt', title: it ? it.name + ' надет' : 'Плащ снят', body: INSTANT }); }}>{it ? 'Надеть' : 'Снять плащ'}</Button>}
        </div>
        </>) : null}
        </div>
      </section>
    </div>
  );
}
