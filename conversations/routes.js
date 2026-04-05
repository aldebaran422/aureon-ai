import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import db from '../db.js';

const router = Router();

db.prepare(`CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  asset_id TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  asset_symbol TEXT NOT NULL,
  messages TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`).run();

router.get('/', requireAuth, (req, res) => {
  const conversations = db.prepare(
    'SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50'
  ).all(req.userId);
  res.json({ conversations: conversations.map(c => ({ ...c, messages: JSON.parse(c.messages) })) });
});

router.get('/:assetId', requireAuth, (req, res) => {
  const conversation = db.prepare(
    'SELECT * FROM conversations WHERE user_id = ? AND asset_id = ? ORDER BY updated_at DESC LIMIT 1'
  ).get(req.userId, req.params.assetId);
  if (!conversation) return res.json({ conversation: null });
  res.json({ conversation: { ...conversation, messages: JSON.parse(conversation.messages) } });
});

router.post('/', requireAuth, (req, res) => {
  const { assetId, assetName, assetSymbol, messages } = req.body;
  if (!assetId || !assetName || !assetSymbol || !messages) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const existing = db.prepare(
    'SELECT id FROM conversations WHERE user_id = ? AND asset_id = ?'
  ).get(req.userId, assetId);
  if (existing) {
    db.prepare(
      'UPDATE conversations SET messages = ?, updated_at = datetime("now") WHERE id = ?'
    ).run(JSON.stringify(messages), existing.id);
    return res.json({ ok: true, id: existing.id });
  }
  const result = db.prepare(
    'INSERT INTO conversations (user_id, asset_id, asset_name, asset_symbol, messages) VALUES (?, ?, ?, ?, ?)'
  ).run(req.userId, assetId, assetName, assetSymbol, JSON.stringify(messages));
  res.json({ ok: true, id: result.lastInsertRowid });
});

router.delete('/:assetId', requireAuth, (req, res) => {
  db.prepare('DELETE FROM conversations WHERE user_id = ? AND asset_id = ?').run(req.userId, req.params.assetId);
  res.json({ ok: true });
});

export default router;
