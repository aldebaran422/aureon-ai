import { Router }                                        from 'express';
import { scryptSync, randomBytes, timingSafeEqual }       from 'node:crypto';
import db                                                 from './db.js';
import { createToken, verifyToken }                       from './jwt.js';
import { requireAuth }                                    from './middleware.js';
import { sendVerificationEmail }                          from '../email/send.js';

const router = Router();

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString('hex');
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function safeUser(user) {
  return {
    id:       user.id,
    email:    user.email,
    verified: !!user.verified_at,
  };
}

function getBaseUrl(req) {
  // Use APP_URL env var if set (recommended on Railway), otherwise derive from request
  return process.env.APP_URL ||
    `${req.protocol}://${req.get('host')}`;
}

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (!validEmail(email))   return res.status(400).json({ error: 'Invalid email address' });
  if (password.length < 8)  return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const normalized = email.trim().toLowerCase();
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(normalized)) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  const salt               = randomBytes(16).toString('hex');
  const password_hash      = hashPassword(password, salt);
  const verification_token = randomBytes(32).toString('hex');
  const expires            = Date.now() + TOKEN_TTL_MS;
  const now                = Date.now();

  const result = db.prepare(
    `INSERT INTO users
       (email, password_hash, salt, created_at, verification_token, verification_token_expires)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(normalized, password_hash, salt, now, verification_token, expires);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

  // Send verification email (non-blocking — don't fail signup if email fails)
  sendVerificationEmail({ to: normalized, token: verification_token, baseUrl: getBaseUrl(req) })
    .catch(err => console.error('[signup] Email send error:', err));

  const token = createToken(user.id);
  res.json({ token, user: safeUser(user) });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const normalized = email.trim().toLowerCase();
  const user       = db.prepare('SELECT * FROM users WHERE email = ?').get(normalized);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const hash = hashPassword(password, user.salt);
  try {
    const match = timingSafeEqual(Buffer.from(hash), Buffer.from(user.password_hash));
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });
  } catch { return res.status(401).json({ error: 'Invalid email or password' }); }

  const token = createToken(user.id);
  res.json({ token, user: safeUser(user) });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: safeUser(user) });
});

// ── GET /api/auth/verify?token=... ───────────────────────────────────────────
// Email link lands here. Marks the user verified, then redirects to the app.
router.get('/verify', (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/?verified=error');

  const user = db.prepare(
    'SELECT * FROM users WHERE verification_token = ?'
  ).get(token);

  if (!user) return res.redirect('/?verified=invalid');

  if (user.verified_at) {
    // Already verified — just send them to the app
    return res.redirect('/?verified=already');
  }

  if (user.verification_token_expires < Date.now()) {
    return res.redirect('/?verified=expired');
  }

  db.prepare(
    `UPDATE users
     SET verified_at = ?, verification_token = NULL, verification_token_expires = NULL
     WHERE id = ?`
  ).run(Date.now(), user.id);

  console.log(`[auth] Email verified for user ${user.id} (${user.email})`);
  res.redirect('/?verified=1');
});

// ── POST /api/auth/resend-verification ───────────────────────────────────────
router.post('/resend-verification', requireAuth, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user)          return res.status(404).json({ error: 'User not found' });
  if (user.verified_at) return res.status(400).json({ error: 'Email already verified' });

  const token   = randomBytes(32).toString('hex');
  const expires = Date.now() + TOKEN_TTL_MS;

  db.prepare(
    'UPDATE users SET verification_token = ?, verification_token_expires = ? WHERE id = ?'
  ).run(token, expires, user.id);

  const { ok, error } = await sendVerificationEmail({
    to:      user.email,
    token,
    baseUrl: getBaseUrl(req),
  });

  if (!ok) return res.status(500).json({ error: 'Failed to send email: ' + error });
  res.json({ ok: true });
});

// ── DELETE /api/auth/account ──────────────────────────────────────────────────
// Permanently deletes the authenticated user and all their data.
router.delete('/account', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Cascading deletes handle user_data and portfolio_holdings (ON DELETE CASCADE)
  db.prepare('DELETE FROM users WHERE id = ?').run(req.userId);

  console.log(`[auth] Account deleted: user ${req.userId} (${user.email})`);
  res.json({ ok: true });
});

export default router;
