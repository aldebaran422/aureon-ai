import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const dir    = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || join(dir, '..', 'aureon.db');

// Ensure the directory exists before opening the database.
// Required on Railway when DATABASE_PATH points to a volume mount (e.g. /data/aureon.db)
// that may not have been provisioned yet on first deploy.
mkdirSync(dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt          TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_data (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, key)
  );

  CREATE TABLE IF NOT EXISTS portfolio_holdings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coin_id       TEXT NOT NULL,
    amount        REAL NOT NULL,
    avg_buy_price REAL,
    note          TEXT,
    created_at    INTEGER NOT NULL
  );
`);

// ── Safe column migrations ─────────────────────────────────────────────────────
// Runs AFTER CREATE TABLE so the table always exists first.
// Each ALTER TABLE is silently ignored if the column already exists.
for (const sql of [
  'ALTER TABLE users ADD COLUMN verified          INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN verified_at       INTEGER',
  'ALTER TABLE users ADD COLUMN verification_token TEXT',
  'ALTER TABLE users ADD COLUMN verification_token_expires INTEGER',
]) {
  try { db.exec(sql); } catch (e) { /* column already exists — safe to ignore */ }
}

export default db;
