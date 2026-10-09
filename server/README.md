# Сервер Luma

Хостинг: Qwertyx.Host · адрес `x1.qwertyx.host:28828` · Minecraft 1.21.1 · Fabric Loader 0.19.5 · Java 21.

## Что лежит на сервере

- `mods/` — серверная часть сборки (22 файла): Fabric API, Lithium, FerriteCore, Chunky, spark, Touhou Little Maid: Orihime, Forge Config API Port, Cloth Config, Waystones, Balm, Traveler's Backpack, Cardinal Components API, Farmer's Delight Refabricated, AppleSkin, Jade, YUNG's Better Dungeons, YUNG's Better Mineshafts, YUNG's API, Universal Graves, Polymer, Carry On, Comforts.
- `world/datapacks/luma_cats/` — датапак из этой папки: при первом входе каждому игроку призывается своя горничная Touhou Little Maid с моделью Чэнь, Орин или Мике (случайно), хозяин — этот игрок.
- `server.properties` — как в этой папке: лицензия проверяется (`online-mode=true`), 10 мест, дистанция прорисовки 8 и симуляции 6 (под Xeon), `allow-flight=true` для модов.

## Полезные команды консоли

- Выдать кошкодевочку ещё раз: `execute as <ник> at @s run function luma:give_cat`
- Белый список: `whitelist add <ник>`, затем `whitelist on`
- Админ: `op <ник>`
- Прогрузка мира заранее: `chunky radius 1000` → `chunky start` (статус: `chunky progress`)

## Как поменять моды

1. Поменяй файлы в `mods/` на сервере.
2. Те же клиентские моды пропиши в `src-tauri/modpack.json` (ссылка, sha512, размер с Modrinth) и пересобери лаунчер — «Играть» само скачает новое и уберёт старое.
