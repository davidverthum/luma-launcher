import { useEffect, useState } from 'react';
import { Button, IconButton, Icon, Tag, Spinner } from '../ds/index.js';
import { inTauri, platform, screenshotSrc, openScreenshotsDir, openScreenshot, revealScreenshot, copyScreenshot, deleteScreenshot } from '../native.js';
import { useScreenshots, shotCount, byDay, dayLabel, timeLabel } from '../shots.js';

const PAGE = 48;
const errText = (e) => String((e && e.message) || e);

export default function Shots({ notify, setRoute }) {
  const [list, reload] = useScreenshots();
  const [open, setOpen] = useState(null); // file name shown in the viewer
  const [limit, setLimit] = useState(PAGE);
  const shots = list || [];
  const index = open ? shots.findIndex((s) => s.file === open) : -1;

  // The shot was deleted from the folder while open — close the viewer.
  useEffect(() => { if (open && list && index < 0) setOpen(null); }, [open, list, index]);

  const openDir = () => openScreenshotsDir()
    .then((path) => { if (!path) notify({ icon: 'folder', title: 'Папок здесь нет', body: 'В браузерной версии папок нет — открой Luma как приложение.' }); })
    .catch((e) => notify({ tone: 'danger', icon: 'close', title: 'Не открыли папку', body: errText(e) }));

  return (
    <>
      <div className="page">
        <header className="page-head">
          <div>
            <div className="overline page-kicker">Luma · твои кадры</div>
            <h1 className="display-lg">Скриншоты</h1>
            <p className="body page-sub">Нажми F2 в игре — снимок сразу появится здесь. Открой любой, чтобы скопировать его в чат, показать в папке или удалить.</p>
          </div>
          <div className="shots-head-actions">
            {list && shots.length ? <Tag tone="outline" icon="camera">{shotCount(shots.length)}</Tag> : null}
            <Button size="sm" icon="folder" onClick={openDir}>Папка</Button>
          </div>
        </header>
        {!list ? (
          <div className="shots-loading"><Spinner /><span className="body">Ищем скриншоты…</span></div>
        ) : !shots.length ? (
          <div className="shots-empty">
            <Icon name="camera" size={24} />
            <p className="body">{inTauri ? 'Пока пусто. Зайди в игру и нажми F2 — снимок появится тут сам.' : 'В браузерной версии скриншотов нет — открой Luma как приложение.'}</p>
            {inTauri ? <Button variant="luma" icon="play" onClick={() => setRoute('home')}>К игре</Button> : null}
          </div>
        ) : (
          <>
            {byDay(shots.slice(0, limit)).map((g) => (
              <section key={g.label} className="shots-day">
                <div className="overline shots-day-title">{g.label}</div>
                <div className="shots-grid">
                  {g.items.map((s) => (
                    <button key={s.file} type="button" className="shot" onClick={() => setOpen(s.file)}>
                      <img src={screenshotSrc(s.path)} alt={'Скриншот: ' + dayLabel(s.taken_ms).toLowerCase() + ', ' + timeLabel(s.taken_ms)} loading="lazy" decoding="async" draggable={false} />
                      <span className="caption shot-time">{timeLabel(s.taken_ms)}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {shots.length > limit ? <Button className="shots-more" onClick={() => setLimit((n) => n + PAGE)}>Показать ещё {Math.min(PAGE, shots.length - limit)}</Button> : null}
          </>
        )}
      </div>
      {index >= 0 ? <Viewer shots={shots} index={index} onIndex={(i) => setOpen(shots[i].file)} onClose={() => setOpen(null)} onDeleted={(next) => { setOpen(next); reload(); }} notify={notify} /> : null}
    </>
  );
}

function Viewer({ shots, index, onIndex, onClose, onDeleted, notify }) {
  const s = shots[index];
  const [confirm, setConfirm] = useState(false);
  const [copying, setCopying] = useState(false);
  useEffect(() => { setConfirm(false); }, [s.file]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      else if (e.key === 'ArrowRight' && index < shots.length - 1) onIndex(index + 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, shots.length, onIndex, onClose]);

  const fail = (title) => (e) => notify({ tone: 'danger', icon: 'close', title, body: errText(e) });
  const copy = () => {
    setCopying(true);
    copyScreenshot(s.file)
      .then(() => notify({ icon: 'check', title: 'Скриншот скопирован', body: 'Вставь его в чат — ' + (platform() === 'mac' ? '⌘V' : 'Ctrl V') + '.' }))
      .catch(fail('Не скопировалось'))
      .finally(() => setCopying(false));
  };
  const remove = () => {
    if (!confirm) { setConfirm(true); return; }
    const next = shots[index + 1] || shots[index - 1];
    deleteScreenshot(s.file)
      .then(() => onDeleted(next ? next.file : null))
      .catch(fail('Не удалилось'));
  };

  return (
    <div className="shot-viewer" role="dialog" aria-label="Скриншот">
      <div className="shot-viewer-top">
        <span className="body-strong">{dayLabel(s.taken_ms)}, {timeLabel(s.taken_ms)}</span>
        <span className="caption">{index + 1} из {shots.length} · {String(Math.round(s.size / 1e5) / 10).replace('.', ',')} МБ</span>
        <IconButton icon="close" label="Закрыть" onClick={onClose} />
      </div>
      <div className="shot-viewer-stage">
        <IconButton icon="chevron-left" label="Новее" variant="glass" size="lg" disabled={index === 0} onClick={() => onIndex(index - 1)} />
        <div className="shot-viewer-frame">
          <img src={screenshotSrc(s.path)} alt="" draggable={false} />
        </div>
        <IconButton icon="chevron-right" label="Старше" variant="glass" size="lg" disabled={index === shots.length - 1} onClick={() => onIndex(index + 1)} />
      </div>
      <div className="shot-viewer-bar">
        <Button variant="luma" icon="chat" loading={copying} onClick={copy}>Скопировать</Button>
        <Button icon="eye" onClick={() => openScreenshot(s.file).catch(fail('Не открылся'))}>Открыть</Button>
        <Button icon="folder" onClick={() => revealScreenshot(s.file).catch(fail('Не открыли папку'))}>Показать в папке</Button>
        <Button variant={confirm ? 'danger' : 'ghost'} icon="trash" onClick={remove} onBlur={() => setConfirm(false)}>{confirm ? 'Точно удалить?' : 'Удалить'}</Button>
      </div>
    </div>
  );
}
