import { Router }                              from 'express';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import db                                      from './db.js';
import { createToken, verifyToken }            from './jwt.js';
import { requireAuth }                         from './middleware.js';

const router = Router();

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString('hex');
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /api/auth/signup
router.post('/signup', (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (!validEmail(email))  return res.status(400).json({ error: 'Invalid email' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const normalized = email.trim().toLowerCase();
  const existing   = db.prepare('SELECT id FROM users WHERE email = ?').get(normalized);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  const salt          = randomBytes(16).toString('hex');
  const password_hash = hashPassword(password, salt);
  const now           = Date.now();

  const result = db.prepare(
    'INSERT INTO users (email, password_hash, salt, created_at) VALUES (?, ?, ?, ?)'
  ).run(normalized, password_hash, salt, now);

  const token = createToken(result.lastInsertRowid);
  res.json({ token, user: { id: result.lastInsertRowid, email: normalized } });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const normalized = email.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalized);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const hash = hashPassword(password, user.salt);
  try {
    const match = timingSafeEqual(Buffer.from(hash), Buffer.from(user.password_hash));
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });
  } catch { return res.status(401).json({ error: 'Invalid email or password' }); }

  const token = createToken(user.id);
  res.json({ token, user: { id: user.id, email: user.email } });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

export default router;
