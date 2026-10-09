# luma-auth-server

Аккаунты лаунчера Luma: регистрация и вход по нику+паролю, сессия — JWT. Отдельно от
Minecraft/Microsoft — в игру всё равно входишь через официальный Minecraft Launcher.

## Запуск

```bash
cd auth-server
npm install
cp .env.example .env   # и впиши свой JWT_SECRET
npm start
```

По умолчанию слушает `:8787`. Адрес сервиса лаунчер берёт из `src-tauri/modpack.json` → `auth.url`
— поменяй его на адрес реального деплоя (VPS, Fly.io, Railway и т.п.; на qwertyx.host это не
хостится — там только игровые серверы, не Node-приложения).

## API

- `POST /api/register { name, password }` → `{ token, profile }`
- `POST /api/login { name, password }` → `{ token, profile }`
- `GET /api/me` с `Authorization: Bearer <token>` → `profile`

`profile` — `{ name, rank }`. База — SQLite в `data/luma.db` (в `.gitignore`).
