// ── Process-level crash guards (must be first) ────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { existsSync } from 'fs';

import { validate }     from './assistant/validate.js';
import { buildContext } from './assistant/context.js';
import { buildPrompt }  from './assistant/prompt.js';
import { callModel }    from './assistant/model.js';
import authRoutes       from './auth/routes.js';
import userRoutes       from './user/routes.js';

// ── Startup diagnostics ───────────────────────────────────────────────────────
console.log('[startup] ANTHROPIC_API_KEY present:', !!process.env.ANTHROPIC_API_KEY);
console.log('[startup] JWT_SECRET present:        ', !!process.env.JWT_SECRET);
console.log('[startup] DATABASE_PATH:             ', process.env.DATABASE_PATH || '(not set — using local aureon.db)');
console.log('[startup] EMAIL_FROM:                ', process.env.EMAIL_FROM    || '(not set — using default)');
console.log('[startup] RESEND_API_KEY present:    ', !!process.env.RESEND_API_KEY);

// Load .env for local development only.
// On Railway/Render, env vars are injected natively — no .env file exists there.
const envFile = new URL('.env', import.meta.url).pathname;
if (existsSync(envFile)) {
  const { config } = await import('dotenv');
  config({ path: envFile });
}

const app = express();
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);

// iOS Safari requires this exact MIME type for the web manifest
app.get('/site.webmanifest', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(new URL('./site.webmanifest', import.meta.url).pathname);
});

app.use(express.static(dirname(fileURLToPath(import.meta.url))));

app.post('/api/assistant', async (req, res) => {
  try {
    console.log('[api/assistant] incoming request:', req.body);

    const validationError = validate(req.body);
    if (validationError) {
      console.error('[api/assistant] validation error:', validationError);
      return res.status(400).json({ response: 'Invalid request: ' + validationError });
    }

    const ctx          = buildContext(req.body);
    const systemPrompt = buildPrompt(ctx);

    const { text, model } = await callModel({ systemPrompt, messages: ctx.history, market: ctx.market, mode: ctx.mode });
    const response = text || 'Claude returned an empty response';
    console.log('[api/assistant] sending response:', response);

    res.json({
      response,
      debug: {
        model,
        promptChars: systemPrompt.length,
        turns:       ctx.history.length,
      },
    });
  } catch (err) {
    console.error('[api/assistant] error:', err);
    res.status(500).json({ response: 'Server error: ' + (err?.message || 'unknown error') });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Aureon → http://localhost:${PORT}`));
