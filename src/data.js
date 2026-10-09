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
  { id: 'n1', realm: 'dawn', tag: 'Обновление', date: '9 окт', title: 'Luma открыт: Fabric 1.21.1 и 24 мода', excerpt: 'Путевые камни, рюкзаки, кухня Farmer\'s Delight, могилы, данжи и шахты YUNG\'а, карта Xaero — и своя кошкодевочка у каждого.' },
  { id: 'n2', realm: 'sky', tag: 'Гайд', date: '9 окт', title: 'Как зайти на сервер', excerpt: 'Нажми «Играть»: Luma поставит моды и откроет Minecraft Launcher с профилем «Luma». Там — «Играть», в игре — «Сетевая игра» → Luma. Нужна лицензия Minecraft Java.' },
  { id: 'n3', realm: 'techno', tag: 'Ивент', date: '9 окт', title: 'Кошкодевочки: Чэнь, Орин и Мике', excerpt: 'При первом входе рядом с тобой появится своя горничная. ПКМ по ней — меню задач и инвентаря; она ходит за тобой и помогает в бою и на ферме.' },
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
