import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import db from '../auth/db.js';

const router = Router();

// Create portfolio_holdings table if not exists
db.prepare(`CREATE TABLE IF NOT EXISTS portfolio_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  coin_id TEXT NOT NULL,
  coin_name TEXT NOT NULL,
  coin_symbol TEXT NOT NULL,
  amount REAL NOT NULL,
  entry_price REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`).run();

router.get('/', requireAuth, (req, res) => {
  const holdings = db.prepare('SELECT * FROM portfolio_holdings WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);
  res.json({ holdings });
});

router.post('/', requireAuth, (req, res) => {
  const { coinId, coinName, coinSymbol, amount, entryPrice } = req.body;
  if (!coinId || !coinName || !coinSymbol || !amount || !entryPrice) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const result = db.prepare(
    'INSERT INTO portfolio_holdings (user_id, coin_id, coin_name, coin_symbol, amount, entry_price) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.userId, coinId, coinName, coinSymbol, amount, entryPrice);
  const holding = db.prepare('SELECT * FROM portfolio_holdings WHERE id = ?').get(result.lastInsertRowid);
  res.json({ holding });
});

router.delete('/:id', requireAuth, (req, res) => {
  const holding = db.prepare('SELECT * FROM portfolio_holdings WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!holding) return res.status(404).json({ error: 'Holding not found' });
  db.prepare('DELETE FROM portfolio_holdings WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
