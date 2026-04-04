import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
const TTL    = 365 * 24 * 60 * 60; // 365 days in seconds

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function sign(header, payload) {
  const data = `${b64url(header)}.${b64url(payload)}`;
  const sig  = createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function createToken(userId) {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { alg: 'HS256', typ: 'JWT' },
    { sub: String(userId), iat: now, exp: now + TTL }
  );
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = createHmac('sha256', SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch { return null; }
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}
