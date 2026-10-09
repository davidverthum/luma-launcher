// Luma account service: register/login with nick+password, JWT sessions.
// This is separate from Minecraft itself — the official launcher still handles the
// Microsoft account; this is the Luma launcher's own account (wardrobe, store, friends).
import 'dotenv/config';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;
const TOKEN_TTL = '30d';
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('[luma-auth] JWT_SECRET не задан — используется небезопасный dev-секрет. Задай свой в .env перед деплоем.');
  return 'luma-dev-secret-change-me';
})();

mkdirSync(join(__dirname, 'data'), { recursive: true });
const db = new Database(join(__dirname, 'data', 'luma.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    rank TEXT,
    created_at INTEGER NOT NULL
  )
`);

const NICK = /^[A-Za-z0-9_]{3,16}$/;

const app = express();
app.use(cors());
app.use(express.json({ limit: '10kb' }));

const authLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
app.use(['/api/register', '/api/login'], authLimiter);

const toProfile = (row) => ({ name: row.name, rank: row.rank || null });
const issueToken = (row) => jwt.sign({ sub: row.id, name: row.name }, JWT_SECRET, { expiresIn: TOKEN_TTL });

app.post('/api/register', (req, res) => {
  const { name, password } = req.body || {};
  if (typeof name !== 'string' || !NICK.test(name)) {
    return res.status(400).json({ error: 'Ник: 3–16 символов, латиница, цифры и _' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Пароль: минимум 8 символов' });
  }
  if (db.prepare('SELECT id FROM users WHERE name = ?').get(name)) {
    return res.status(409).json({ error: 'Этот ник уже занят' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (name, password_hash, rank, created_at) VALUES (?, ?, NULL, ?)')
    .run(name, hash, Date.now());
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid);
  res.json({ token: issueToken(row), profile: toProfile(row) });
});

app.post('/api/login', (req, res) => {
  const { name, password } = req.body || {};
  if (typeof name !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Нужны ник и пароль' });
  }
  const row = db.prepare('SELECT * FROM users WHERE name = ?').get(name);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Неверный ник или пароль' });
  }
  res.json({ token: issueToken(row), profile: toProfile(row) });
});

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Нет токена' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Токен недействителен или истёк' });
  }
}

app.get('/api/me', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
  if (!row) return res.status(401).json({ error: 'Аккаунт не найден' });
  res.json(toProfile(row));
});

app.listen(PORT, () => console.log(`[luma-auth] слушаю на :${PORT}`));
