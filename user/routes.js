import { Router }      from 'express';
import db              from '../auth/db.js';
import { requireAuth } from '../auth/middleware.js';

const router = Router();
router.use(requireAuth);

const ALLOWED_KEYS = new Set(['favorites', 'alertPrefs', 'zones', 'srLines']);

// GET /api/user/data — return all stored key-value pairs for this user
router.get('/data', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM user_data WHERE user_id = ?').all(req.userId);
  const data = {};
  for (const { key, value } of rows) {
    try { data[key] = JSON.parse(value); } catch { data[key] = value; }
  }
  res.json(data);
});

// PUT /api/user/data/:key — upsert one key
router.put('/data/:key', (req, res) => {
  const { key } = req.params;
  if (!ALLOWED_KEYS.has(key)) return res.status(400).json({ error: 'Unknown data key' });
  const { value } = req.body ?? {};
  if (value === undefined) return res.status(400).json({ error: 'value required' });
  db.prepare(`
    INSERT INTO user_data (user_id, key, value, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(req.userId, key, JSON.stringify(value), Date.now());
  res.json({ ok: true });
});

// GET /api/user/portfolio
router.get('/portfolio', (req, res) => {
  const rows = db.prepare('SELECT * FROM portfolio_holdings WHERE user_id = ? ORDER BY created_at').all(req.userId);
  res.json(rows);
});

// POST /api/user/portfolio
router.post('/portfolio', (req, res) => {
  const { coinId, amount, avgBuyPrice, note } = req.body ?? {};
  if (!coinId || amount == null) return res.status(400).json({ error: 'coinId and amount required' });
  const result = db.prepare(
    'INSERT INTO portfolio_holdings (user_id, coin_id, amount, avg_buy_price, note, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.userId, coinId, amount, avgBuyPrice ?? null, note ?? null, Date.now());
  res.json({ id: result.lastInsertRowid });
});

// PUT /api/user/portfolio/:id
router.put('/portfolio/:id', (req, res) => {
  const { amount, avgBuyPrice, note } = req.body ?? {};
  db.prepare(
    'UPDATE portfolio_holdings SET amount = ?, avg_buy_price = ?, note = ? WHERE id = ? AND user_id = ?'
  ).run(amount, avgBuyPrice ?? null, note ?? null, req.params.id, req.userId);
  res.json({ ok: true });
});

// DELETE /api/user/portfolio/:id
router.delete('/portfolio/:id', (req, res) => {
  db.prepare('DELETE FROM portfolio_holdings WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

export default router;
