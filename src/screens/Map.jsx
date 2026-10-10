import { useEffect, useRef, useState } from 'react';
import { Button, Spinner, Tag } from '../ds/index.js';
import { modpack, openUrl } from '../native.js';

const MAP_URL = modpack.server.map;
const LOAD_TIMEOUT_MS = 12000;

export default function MapScreen() {
  const [status, setStatus] = useState('loading'); // loading | ready | failed
  const [attempt, setAttempt] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    if (!MAP_URL) { setStatus('failed'); return; }
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
          src={MAP_URL}
          title="Карта сервера Luma"
          onLoad={() => setStatus('ready')}
          style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }}
        />
      </div>
    </div>
  );
}
