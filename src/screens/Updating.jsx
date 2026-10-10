import { LumaMark, Led, Button } from '../ds/index.js';
import { appVersion, channelLabel } from '../native.js';

const SEGMENTS = 32;
const mb = (b) => String(Math.round(b / 1e5) / 10).replace('.', ',');

/** The launcher's own update screen: download progress, then a quiet install that restarts Luma. */
export default function Updating({ state, onRetry, onClose }) {
  const { upd, stage, done, total, error } = state;
  const switching = upd.channel !== upd.from_channel;
  const progress = stage === 'download' ? (total ? Math.min(1, done / total) : 0) : 1;
  const lit = Math.round(progress * SEGMENTS);
  const status = error ? 'Не получилось: ' + error
    : stage === 'download' ? (total ? 'Скачиваем · ' + mb(done) + ' из ' + mb(total) + ' МБ' : 'Скачиваем…')
    : 'Устанавливаем — Luma закроется и откроется сама через несколько секунд';

  return (
    <div className="upd" role="dialog" aria-label="Обновление Luma">
      <div className="upd-card">
        <LumaMark size={56} />
        <div className="overline upd-kicker">{switching ? 'Переход на ветку «' + channelLabel(upd.channel) + '»' : 'Обновление лаунчера'}</div>
        <h1 className="display-lg upd-title">Luma {upd.version}</h1>
        <p className="body upd-sub">Сейчас {appVersion}{switching ? ' · «' + channelLabel(upd.from_channel) + '»' : ''} → {upd.version} · «{channelLabel(upd.channel)}»</p>
        <div className="upd-progress">
          <div className="lm-dl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Обновление">
            {Array.from({ length: SEGMENTS }, (_, i) => <i key={i} className={i < lit ? 'is-on' : i === lit && !error ? 'is-head' : undefined} />)}
          </div>
          <span className="upd-pct"><Led value={Math.round(progress * 100)} size="md" color="var(--luma-ink)" ghost={false} animate={false} /><span>%</span></span>
        </div>
        <p className={'caption upd-status' + (error ? ' is-error' : '')}>{status}</p>
        {error ? (
          <div className="upd-actions">
            <Button variant="luma" icon="download" onClick={onRetry}>Попробовать снова</Button>
            <Button variant="ghost" onClick={onClose}>Позже</Button>
          </div>
        ) : <p className="caption upd-note">Не закрывай лаунчер — настройки, моды и миры остаются на месте.</p>}
      </div>
    </div>
  );
}
