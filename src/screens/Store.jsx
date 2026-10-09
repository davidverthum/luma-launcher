import { SeasonPass, RankBadge, Button, Icon, Tag } from '../ds/index.js';
import { RANK_OFFERS, LUMEN_PACKS } from '../data.js';

export default function Store({ settings, notify }) {
  const soon = (what) => notify({ icon: 'bag', title: what, body: 'Оплата заработает, когда магазин подключится к серверу Luma. Сейчас это витрина.' });
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="overline page-kicker">Ранги, люмены и сезон</div>
          <h1 className="display-lg">Магазин</h1>
        </div>
        <Tag tone="luma" icon="gem">Баланс · {settings.balance} люменов</Tag>
      </header>
      <SeasonPass />
      <h2 className="title store-h">Ранги</h2>
      <div className="ranks-grid">
        {RANK_OFFERS.map((o) => (
          <div key={o.rank} className={'rank-card is-' + o.rank}>
            <RankBadge rank={o.rank} size="lg" />
            <ul>{o.perks.map((p) => <li key={p}><Icon name="check" size={12} />{p}</li>)}</ul>
            <Button variant={o.rank === 'zenith' ? 'luma' : 'glass'} block onClick={() => soon('Ранг ' + o.rank.toUpperCase())}>{o.price} ₽ · навсегда</Button>
          </div>
        ))}
      </div>
      <h2 className="title store-h">Люмены</h2>
      <div className="packs-grid">
        {LUMEN_PACKS.map((p) => (
          <button key={p.amount} type="button" className="pack" onClick={() => soon(p.amount + ' люменов')}>
            <Icon name="gem" size={36} />
            <span className="pack-amount"><span className="lm-led led-lg">{p.amount}</span><span className="caption">люменов</span></span>
            {p.bonus ? <Tag tone="luma">{p.bonus}</Tag> : <span />}
            <span className="body-strong">{p.price} ₽</span>
          </button>
        ))}
      </div>
    </div>
  );
}
