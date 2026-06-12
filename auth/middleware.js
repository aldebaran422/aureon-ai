import { verifyToken } from './jwt.js';
import db from './db.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  const claims = verifyToken(token);
  if (!claims) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = Number(claims.sub);

  // Auto-restore: if the JWT is valid but the user row is gone (ephemeral Render restart
  // wiped the database), recreate a stub record so the session continues transparently.
  // Works for all valid tokens: uses the email claim if present (new tokens), or a
  // deterministic placeholder (old tokens issued before the email claim was added).
  const exists = db.prepare('SELECT 1 FROM users WHERE id = ?').get(req.userId);
  if (!exists) {
    const email = claims.email ?? `restored_${req.userId}@aureon.local`;
    const now   = Date.now();
    try {
      db.prepare(
        `INSERT OR IGNORE INTO users
           (id, email, password_hash, salt, created_at, verified, verified_at)
         VALUES (?, ?, 'restored', 'restored', ?, 1, ?)`
      ).run(req.userId, email, now, now);
      const confirmed = db.prepare('SELECT 1 FROM users WHERE id = ?').get(req.userId);
      if (confirmed) {
        console.log('[auth] Auto-restored user from JWT — userId:', req.userId,
                    '| email:', email, '| emailInJwt:', !!claims.email);
      } else {
        console.warn('[auth] Auto-restore skipped (id or email conflict) — userId:', req.userId);
      }
    } catch (err) {
      console.error('[auth] Auto-restore error:', err.message);
    }
  }

  next();
}
