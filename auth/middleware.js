import { verifyToken } from './jwt.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  const claims = verifyToken(token);
  if (!claims) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = Number(claims.sub);
  next();
}
