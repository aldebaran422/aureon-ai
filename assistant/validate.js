/**
 * validate.js
 * Validates the POST /api/assistant request body.
 * Returns an error string on failure, or null if valid.
 */

const VALID_MODES = ['quick', 'detailed', 'watch'];

export function validate(body) {
  if (!body || typeof body !== 'object') return 'Request body must be JSON.';
  if (typeof body.question !== 'string' || !body.question.trim()) {
    return 'question is required and must be a non-empty string.';
  }
  if (body.question.trim().length > 1000) {
    return 'question must be 1000 characters or fewer.';
  }
  if (body.history !== undefined && !Array.isArray(body.history)) {
    return 'history must be an array.';
  }
  if (body.mode !== undefined && !VALID_MODES.includes(body.mode)) {
    return `mode must be one of: ${VALID_MODES.join(', ')}.`;
  }
  if (body.market !== undefined) {
    const m = body.market;
    if (typeof m !== 'object') return 'market must be an object.';
    if (m.rsi !== undefined && typeof m.rsi !== 'object') return 'market.rsi must be an object.';
    if (m.zones !== undefined && typeof m.zones !== 'object') return 'market.zones must be an object.';
    if (m.mtf !== undefined && !Array.isArray(m.mtf)) return 'market.mtf must be an array.';
    if (m.news !== undefined && !Array.isArray(m.news)) return 'market.news must be an array.';
  }
  return null;
}
