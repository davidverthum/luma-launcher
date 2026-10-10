// What changed in each release, and how the two update channels differ.
// Shown in Settings → «О лаунчере» and once, as «Что нового», after an update.
// `channel`: 'yug' | 'sever' — a line's own release; omitted — before the lines split.
// Add the entry before tagging a release; versions newer than the running app are hidden.

export const CHANGELOG = [
  { version: '0.1.5', channel: 'sever', items: [
    'Админка для админов сервера: игроки (кик, бан, OP), вайтлист и баны со списками, плановый рестарт с отсчётом в чате, быстрые команды и консоль — через RCON.',
    'Уведомление, когда кто-то заходит на сервер: в лаунчере, а если он свёрнут — уведомлением Windows.',
    'Помощник при вылете игры: причина из краш-отчёта, подозрительные свои моды с кнопкой «Выключить», отчёт в один клик.',
    'Свои моды можно выключать, не удаляя. У модов сборки и своих — иконки и описания с Modrinth.',
    'График онлайна за сутки в «На сервере».',
    'Лаунчер видит сервер, даже когда VPN ломает DNS.',
    'Головы игроков в списках — с настоящих скинов Ely.by, а не придуманные.',
    'Своё окно обновления: прогресс прямо в лаунчере, установка без окна установщика, перезапуск сам.',
    'Интерфейс масштабируется под большое окно и полный экран, островок встаёт над текстом и на вертикальном мониторе.',
    'История изменений и сравнение веток в «О лаунчере».',
    'Понятное уведомление при смене ветки обновлений.',
  ] },
  { version: '0.1.4', channel: 'sever', items: [
    'Альбом скриншотов: нажми F2 в игре — снимок сразу в лаунчере. Можно скопировать в чат, открыть, показать в папке или удалить.',
    'Последний скриншот на главной вместо карточки с адресом сервера.',
    'Карта сервера (BlueMap) прямо в лаунчере.',
    'Выбор ветки обновлений: Юг или Север.',
  ] },
  { version: '0.1.4', channel: 'yug', items: [
    'Выбор ветки обновлений: Юг или Север — в «Настройки» → «О лаунчере».',
  ] },
  { version: '0.1.3', items: [
    'Свои моды поверх сборки — перетащи .jar в окно лаунчера.',
    'Шейдеры в один клик и пресеты под слабый, средний и мощный ПК.',
  ] },
  { version: '0.1.2', items: ['Java скачивается сама — ставить её вручную больше не нужно.'] },
  { version: '0.1.1', items: ['Исправлено автообновление лаунчера.'] },
  { version: '0.1.0', items: [
    'Первый выпуск: «Играть» сам ставит сборку из 24 модов и запускает Minecraft с аккаунтом Ely.by.',
    'Живой статус сервера: онлайн, пинг и ники игроков.',
    'Гардероб со скином, настройки памяти и автообновление.',
  ] },
];

/** What each line is for, and what only Север has right now. */
export const CHANNEL_INFO = {
  yug: { about: 'Основная линия. Проверенные функции, обновляется реже.' },
  sever: {
    about: 'Новые функции раньше, чем в Юге. Иногда они ещё сыроваты.',
    only: ['Альбом скриншотов и последний кадр на главной', 'Уведомления, когда кто-то заходит на сервер', 'Помощник при вылете игры', 'Вкл/выкл своих модов, иконки с Modrinth', 'Карта сервера и график онлайна', 'Головы игроков со скинов Ely.by', 'Админка через RCON (видна только админам)', 'Своё окно обновления без установщика'],
  },
};

const parts = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0);
/** -1 / 0 / 1, numeric per part: 0.1.10 > 0.1.9. */
export function compareVersions(a, b) {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Entries a build of `version` on `channel` has seen: its own line plus the shared history. */
export function historyFor(channel, version) {
  return CHANGELOG.filter((e) => (!e.channel || e.channel === channel) && compareVersions(e.version, version) <= 0);
}

/** The notes for exactly this build, or null. */
export function notesFor(channel, version) {
  return CHANGELOG.find((e) => (!e.channel || e.channel === channel) && compareVersions(e.version, version) === 0) || null;
}
