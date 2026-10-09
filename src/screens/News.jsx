import { NewsCard, Tabs, realmById } from '../ds/index.js';
import { useState } from 'react';
import { NEWS } from '../data.js';

export default function News() {
  const [tab, setTab] = useState('all');
  const list = NEWS.filter((n) => tab === 'all' || (tab === 'upd' && n.tag === 'Обновление') || (tab === 'events' && n.tag === 'Ивент') || (tab === 'guide' && n.tag === 'Гайд'));
  const [first, ...rest] = list;
  const art = (n, seed) => ({ biome: realmById(n.realm).biome, light: realmById(n.realm).light, seed });
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="overline page-kicker">Что нового</div>
          <h1 className="display-lg">Новости</h1>
        </div>
        <Tabs size="sm" value={tab} onChange={setTab} items={[{ id: 'all', label: 'Все' }, { id: 'upd', label: 'Обновления' }, { id: 'events', label: 'Ивенты' }, { id: 'guide', label: 'Гайды' }]} />
      </header>
      {first ? (
        <div className="news-grid">
          <NewsCard size="lg" tag={first.tag} date={first.date} title={first.title} excerpt={first.excerpt} art={art(first, 21)} style={{ gridColumn: '1 / -1' }} />
          {rest.map((n, i) => <NewsCard key={n.id} tag={n.tag} date={n.date} title={n.title} excerpt={n.excerpt} art={art(n, 30 + i)} />)}
        </div>
      ) : <p className="body page-sub">Здесь пока пусто.</p>}
    </div>
  );
}
