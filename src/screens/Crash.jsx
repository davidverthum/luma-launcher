import { useState } from 'react';
import { Button, Icon } from '../ds/index.js';
import { copyText, openCrashDir, setLocalModEnabled } from '../native.js';

const errText = (e) => String((e && e.message) || e);

/** Shown when Minecraft quits badly: the reason, the player's mods the error mentions (with a
 * one-click switch-off), and the report to copy for whoever helps. */
export default function Crash({ crash, notify, onClose }) {
  const [off, setOff] = useState([]);
  const suspects = crash.suspects.filter((f) => !off.includes(f));

  const disable = (file) => setLocalModEnabled(file, false)
    .then(() => { setOff((l) => [...l, file]); notify({ icon: 'check', title: 'Мод выключен', body: file + ' — включить обратно можно в «Настройки» → «Моды».' }); })
    .catch((e) => notify({ tone: 'danger', icon: 'close', title: 'Не выключился', body: errText(e) }));
  const copy = async () => {
    const ok = await copyText(crash.details);
    notify({ icon: ok ? 'check' : 'close', title: ok ? 'Отчёт скопирован' : 'Не скопировалось', body: ok ? 'Вставь его в чат тому, кто поможет разобраться.' : '' });
  };

  return (
    <div className="upd" role="dialog" aria-label="Игра вылетела">
      <div className="upd-card crash-card">
        <span className="crash-icon"><Icon name="close" size={24} /></span>
        <div className="overline upd-kicker crash-kicker">Minecraft закрылся с ошибкой{crash.code != null ? ' · код ' + crash.code : ''}</div>
        <h1 className="display-lg upd-title">Игра вылетела</h1>
        <p className="mono crash-summary">{crash.summary}</p>
        {suspects.length ? (
          <div className="crash-suspects">
            <div className="body-strong">Похоже, виноват твой мод</div>
            {suspects.map((f) => (
              <div key={f} className="crash-suspect">
                <span className="mono">{f}</span>
                <Button size="sm" variant="luma" onClick={() => disable(f)}>Выключить</Button>
              </div>
            ))}
            <p className="caption">Мод останется в папке — включить его обратно можно в «Настройки» → «Моды».</p>
          </div>
        ) : (
          <p className="caption crash-note">{off.length ? 'Мод выключен — попробуй запустить игру ещё раз.' : crash.report ? 'Отчёт: ' + crash.report + '. Отправь его тому, кто поможет разобраться.' : 'Краш-отчёта нет — в отчёте последние строки лога игры.'}</p>
        )}
        <div className="upd-actions">
          <Button icon="chat" onClick={copy}>Скопировать отчёт</Button>
          <Button icon="folder" onClick={() => openCrashDir()}>Открыть папку</Button>
          <Button variant="ghost" onClick={onClose}>Закрыть</Button>
        </div>
      </div>
    </div>
  );
}
