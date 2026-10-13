// Capes, pets, titles, name colors and trails that the Luma Cosmetics mod (cosmetics-mod/) shows in
// game. The ids are the contract with the mod: it ships one cape texture per id here (made from
// capeTexture below) and knows the same ids (Cosmetics.java), and the server drops anything else.
import { defaultCape } from './ds/index.js';

export const CAPES = [
  { id: 'luma', name: 'Плащ Luma', icon: 'block', rarity: 'Сезонный', tone: 'var(--luma-ink)', hex: '#d4ff3d' },
  { id: 'dawn', name: 'Плащ «Рассвет»', icon: 'sparkle', rarity: 'Тёплый', tone: 'var(--realm-dawn)', hex: '#ffb547' },
  { id: 'soul', name: 'Плащ «Огонь душ»', icon: 'bolt', rarity: 'Редкий', tone: 'var(--realm-techno)', hex: '#4fe3ff' },
  { id: 'neon', name: 'Плащ «Неон»', icon: 'crown', rarity: 'Яркий', tone: 'var(--realm-arena)', hex: '#ff5fae' },
  { id: 'lava', name: 'Плащ «Лава»', icon: 'gem', rarity: 'Редкий', tone: 'var(--realm-anarchy)', hex: '#ff6b3d' },
  { id: 'crystal', name: 'Плащ «Аметист»', icon: 'gift', rarity: 'Легендарный', tone: 'var(--realm-sky)', hex: '#b39bff' },
  { id: 'night', name: 'Плащ «Полночь»', icon: 'clock', rarity: 'Строгий', tone: 'var(--ink-2)', hex: '#6e757c' },
  { id: 'star', name: 'Плащ «Звездопад»', icon: 'sparkle', rarity: 'Светлый', tone: 'var(--luma-ink)', hex: '#e8edf1' },
];

export const PETS = [
  { id: 'fox', name: 'Лисёнок', tone: '#ff8a3d' },
  { id: 'cat', name: 'Котёнок', tone: '#c9a27a' },
  { id: 'axolotl', name: 'Аксолотль', tone: '#ff9ecf' },
  { id: 'parrot', name: 'Попугай', tone: '#ff4d4d' },
  { id: 'bee', name: 'Пчёлка', tone: '#ffd93d' },
  { id: 'frog', name: 'Лягушка', tone: '#7bc96f' },
  { id: 'rabbit', name: 'Крольчонок', tone: '#d8c3a5' },
  { id: 'chicken', name: 'Цыплёнок', tone: '#fff3b0' },
];

// Shown above the name in game; the mod has the same words in its lang files.
export const TITLES = [
  { id: 'builder', name: 'Строитель' },
  { id: 'miner', name: 'Шахтёр' },
  { id: 'farmer', name: 'Фермер' },
  { id: 'explorer', name: 'Путешественник' },
  { id: 'cook', name: 'Повар' },
  { id: 'warrior', name: 'Воин' },
  { id: 'fisher', name: 'Рыбак' },
  { id: 'trader', name: 'Торговец' },
];

// Name colors: the launcher's accents (accent.js), the same ids the mod knows.
export const NAME_COLORS = [
  { id: 'luma', name: 'Лайм', hex: '#d4ff3d' },
  { id: 'mint', name: 'Мята', hex: '#3dffa8' },
  { id: 'ice', name: 'Лёд', hex: '#4fe3ff' },
  { id: 'violet', name: 'Аметист', hex: '#b39bff' },
  { id: 'pink', name: 'Неон', hex: '#ff5fae' },
  { id: 'lava', name: 'Лава', hex: '#ff6b3d' },
  { id: 'amber', name: 'Янтарь', hex: '#ffb547' },
];

// Particles at the feet while walking; `icon` is from the launcher's icon set.
export const TRAILS = [
  { id: 'sparks', name: 'Искры', icon: 'sparkle', note: 'в цвет ника' },
  { id: 'petals', name: 'Лепестки', icon: 'gift', note: 'вишнёвые' },
  { id: 'snow', name: 'Снежинки', icon: 'clock', note: 'зимние' },
  { id: 'notes', name: 'Ноты', icon: 'chat', note: 'разноцветные' },
  { id: 'soul', name: 'Огонь душ', icon: 'bolt', note: 'голубой' },
  { id: 'hearts', name: 'Сердечки', icon: 'crown', note: 'редкие' },
];

/** Everything the player wears in game, from settings — for setLook and «Играть». */
export const lookOf = (s) => ({ cape: s.cape || 'luma', pet: s.pet || 'none', title: s.title || '', color: s.nameColor || '', trail: s.trail || '' });

/** A 64×32 cape texture in one light: dark cloth, a lit stepped hem and a small mark. */
export function capeTexture(hex) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#15171a'; x.fillRect(0, 0, 22, 17);
  x.fillStyle = '#23272e'; x.fillRect(1, 1, 10, 16);
  x.fillStyle = hex;
  [[4, 3, 2, 1], [3, 4, 4, 1], [2, 5, 6, 1], [3, 6, 4, 1], [4, 7, 2, 1]].forEach(([a, b, w, h]) => x.fillRect(1 + a, 1 + b, w, h));
  for (let r = 0; r < 4; r++) { const w = 4 + r * 2; x.fillRect(1 + (10 - w) / 2, 13 + r, w, 1); }
  x.globalAlpha = 0.35; x.fillRect(12, 1, 10, 16); x.globalAlpha = 1;
  x.fillStyle = '#15171a'; x.fillRect(12, 1, 10, 3);
  return c.toDataURL('image/png');
}

/** The texture the wardrobe previews and the mod wears for a cape id. */
export const capeImage = (id) => (id === 'luma' ? defaultCape() : capeTexture((CAPES.find((c) => c.id === id) || CAPES[0]).hex));
