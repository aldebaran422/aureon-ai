import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import db from '../db.js';

const router = Router();

db.prepare(`CREATE TABLE IF NOT EXISTS price_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  coin_id TEXT NOT NULL,
  coin_name TEXT NOT NULL,
  coin_symbol TEXT NOT NULL,
  target_price REAL NOT NULL,
  direction TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`).run();

router.get('/', requireAuth, (req, res) => {
  const alerts = db.prepare('SELECT * FROM price_alerts WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);
  res.json({ alerts });
});

router.post('/', requireAuth, (req, res) => {
  const { coinId, coinName, coinSymbol, targetPrice, direction } = req.body;
  if (!coinId || !coinName || !coinSymbol || !targetPrice || !direction) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const result = db.prepare(
    'INSERT INTO price_alerts (user_id, coin_id, coin_name, coin_symbol, target_price, direction) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.userId, coinId, coinName, coinSymbol, targetPrice, direction);
  const alert = db.prepare('SELECT * FROM price_alerts WHERE id = ?').get(result.lastInsertRowid);
  res.json({ alert });
});

router.delete('/:id', requireAuth, (req, res) => {
  const alert = db.prepare('SELECT * FROM price_alerts WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  db.prepare('DELETE FROM price_alerts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
