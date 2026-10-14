import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Icon, IconButton, PlayerHead, Spinner, Tag } from '../ds/index.js';
import { modpack, openUrl } from '../native.js';
import { useFeed, mapUrl, dimName } from '../feed.js';

const MAP_URL = modpack.server.map;
const LOAD_TIMEOUT_MS = 12000;
const coords = (p) => Math.round(p.x) + ' ' + Math.round(p.y) + ' ' + Math.round(p.z);

/** `focus` — a spot to show ({ dim, x, y, z, label, seq }), from a screenshot or the chronicle. */
export default function MapScreen({ focus }) {
  const [status, setStatus] = useState('loading'); // loading | ready | failed
  const [attempt, setAttempt] = useState(0);
  const [target, setTarget] = useState(focus || null);
  const frameRef = useRef(null);
  const places = useFeed('places', 60000);
  const maps = useFeed('maps', 5 * 60000);
  const list = places && Array.isArray(places.places) ? [...places.places].sort((a, b) => (b.t || 0) - (a.t || 0)) : null;

  useEffect(() => { if (focus) setTarget(focus); }, [focus && focus.seq]);

  // A fresh page opens straight at the spot; after that only the part after # changes, and BlueMap
  // flies there without reloading.
  const src = useMemo(() => mapUrl(target, maps), [attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useRef(target && target.seq);
  useEffect(() => { shown.current = target && target.seq; }, [attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!target || status !== 'ready' || shown.current === target.seq || !frameRef.current) return;
    shown.current = target.seq;
    frameRef.current.src = mapUrl(target, maps);
  }, [target, status, maps]);

  useEffect(() => {
    if (!MAP_URL) { setStatus('failed'); return undefined; }
    setStatus('loading');
    const timer = setTimeout(() => setStatus((s) => (s === 'loading' ? 'failed' : s)), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [attempt]);

  if (!MAP_URL) {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <div className="overline page-kicker">Luma · мир сверху</div>
            <h1 className="display-lg">Карта</h1>
            <p className="body page-sub">Карта сервера пока не настроена.</p>
          </div>
        </header>
      </div>
    );
  }

  const go = (p) => setTarget({ dim: p.dim, x: p.x, y: p.y, z: p.z, label: p.name, seq: Date.now() });

  return (
    <div className="page page--map">
      <header className="page-head">
        <div>
          <div className="overline page-kicker">Luma · мир сверху</div>
          <h1 className="display-lg">Карта</h1>
          <p className="body page-sub">Живая 3D-карта «Luma» — обновляется по мере того, как игроки исследуют мир.</p>
        </div>
        <Tag tone={status === 'ready' ? 'luma' : 'neutral'} icon="pin">{status === 'ready' ? 'на связи' : status === 'failed' ? 'не отвечает' : 'загрузка…'}</Tag>
      </header>
      <div className="map-body">
        <div className="map-frame-wrap">
          {status !== 'ready' ? (
            <div className="map-frame-overlay">
              {status === 'loading' ? (
                <><Spinner /><p className="body">Подключаемся к карте сервера…</p></>
              ) : (
                <>
                  <p className="body">Карта сейчас не отвечает. Сервер карты может быть перезагружен или временно недоступен.</p>
                  <div className="map-frame-actions">
                    <Button variant="luma" icon="bolt" onClick={() => setAttempt((n) => n + 1)}>Попробовать снова</Button>
                    <Button variant="glass" icon="globe" onClick={() => openUrl(MAP_URL)}>Открыть в браузере</Button>
                  </div>
                </>
              )}
            </div>
          ) : null}
          <iframe
            key={attempt}
            ref={frameRef}
            className="map-frame"
            src={src}
            title="Карта сервера Luma"
            onLoad={() => setStatus('ready')}
            style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }}
          />
          {target && status === 'ready' ? (
            <div className="map-focus">
              <Icon name="pin" size={12} />
              <span className="map-focus-label">{target.label || 'Точка'}</span>
              <span className="caption mono">{dimName(target.dim)} · {coords(target)}</span>
              <IconButton icon="close" label="Скрыть" size="sm" onClick={() => setTarget(null)} />
            </div>
          ) : null}
        </div>
        {list ? (
          <aside className="map-places">
            <div className="map-places-head">
              <span className="body-strong">Места</span>
              <span className="caption">{list.length || ''}</span>
            </div>
            {list.length ? (
              <ul className="map-places-list">
                {list.map((p) => (
                  <li key={p.id}>
                    <button type="button" className={'map-place' + (target && target.label === p.name && target.x === p.x && target.z === p.z ? ' is-on' : '')} onClick={() => go(p)} title="Показать на карте">
                      <PlayerHead name={p.owner} size={24} />
                      <span className="map-place-text">
                        <span className="map-place-name">{p.name}</span>
                        <span className="caption">{p.owner} · {dimName(p.dim)} · <span className="mono">{coords(p)}</span></span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="caption map-places-empty">Пока ни одного места.</p>}
            <p className="caption map-places-hint">Встань на месте в игре и напиши <span className="mono">/mark add Название</span> — метка появится на карте у всех. Убрать: <span className="mono">/mark remove Название</span>.</p>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
