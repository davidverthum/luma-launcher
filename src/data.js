// Demo content until the launcher is connected to the network's API.
export const FRIENDS = [
  { name: 'Lex_', status: 'ingame', activity: 'Арена · BedWars 4×4', realm: 'arena', rank: 'nova' },
  { name: 'Mira', status: 'ingame', activity: 'Техномагия · строит ракету', realm: 'techno' },
  { name: 'Kote', status: 'ingame', activity: 'Анархия · 2 ч 14 мин', realm: 'anarchy', rank: 'flare' },
  { name: 'Zed', status: 'online' },
  { name: 'Bo', status: 'away', activity: 'Отошёл · 12 мин' },
  { name: 'Arkadiy', status: 'offline', activity: 'Был вчера в 23:40' },
];

export const HERE = { techno: ['Mira', 'Toxa', 'Yuki'], arena: ['Lex_', 'Gleb'], anarchy: ['Kote'], dawn: ['Sonya', 'Rem', 'Faust', 'Ira_'], sky: [] };

// Server news, written by hand for now.
export const NEWS = [
  { id: 'n7', realm: 'dawn', tag: 'Обновление', date: '12 окт', title: 'Эмоции, свой цвет и дальняя прорисовка', excerpt: 'Эмоции в игре на клавишу X — машешь, хлопаешь, делаешь сальто, и это видят все рядом. В «Внешнем виде» можно выбрать любой акцентный цвет. Для мощных ПК — Distant Horizons: горы видно на тысячи блоков. Скин меняется прямо из гардероба, а колокольчик теперь помнит, кто заходил.' },
  { id: 'n6', realm: 'arena', tag: 'PvP', date: '11 окт', title: 'Честная миникарта', excerpt: 'Сервер выключил на миникарте радар мобов и игроков сквозь стены, режим пещер и поиск слизневых чанков. Своих по-прежнему видно — иконкой на краю карты, в какой стороне они.' },
  { id: 'n5', realm: 'sky', tag: 'Обновление', date: '11 окт', title: 'Голосовой чат', excerpt: 'На сервере работает Simple Voice Chat: слышно тех, кто рядом, и чем дальше — тем тише. Нажми V — выберешь микрофон и как говорить, G — группы, J — выключить микрофон.' },
  { id: 'n4', realm: 'dawn', tag: 'Обновление', date: '11 окт', title: 'Новый мир и чистка модов', excerpt: 'Мир пересоздан на Tectonic и Terralith: горы до облаков и около сотни биомов, плюс крепости и монументы от YUNG\'а. Убрали кошкодевочек, могилы, Carry On и Comforts — вещи погибшего снова можно забрать. Зум — на клавишу C.' },
  { id: 'n1', realm: 'dawn', tag: 'Обновление', date: '9 окт', title: 'Luma открыт: Fabric 1.21.1 и 24 мода', excerpt: 'Путевые камни, рюкзаки, кухня Farmer\'s Delight, могилы, данжи и шахты YUNG\'а, карта Xaero — и своя кошкодевочка у каждого.' },
  { id: 'n2', realm: 'sky', tag: 'Гайд', date: '9 окт', title: 'Как зайти на сервер', excerpt: 'Войди в Luma аккаунтом Ely.by и нажми «Играть»: лаунчер сам скачает игру, Java и моды. В главном меню игры — «Подключиться к серверу». Лицензия Minecraft не нужна.' },
];

export const RANK_OFFERS = [
  { rank: 'spark', price: 149, perks: ['Цветной ник в чате', '2 дома на Рассвете', '+10% люменов за игру'] },
  { rank: 'flare', price: 349, perks: ['Всё из SPARK', 'Набор /kit каждые 3 дня', 'Приоритет в очереди'] },
  { rank: 'nova', price: 690, perks: ['Всё из FLARE', 'Свои варпы и /fly на спавне', 'Плащ «Огонь душ»'] },
  { rank: 'zenith', price: 1490, perks: ['Всё из NOVA', 'Без очереди на любые миры', 'Эксклюзивный плащ и питомец'] },
];

export const LUMEN_PACKS = [
  { amount: 500, price: 99 },
  { amount: 1200, price: 199, bonus: '+20%' },
  { amount: 3000, price: 449, bonus: '+35%' },
];
