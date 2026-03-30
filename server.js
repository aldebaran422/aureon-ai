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

// ── Startup diagnostics ──────────────────────────────────────────────────────
console.log('[startup] ANTHROPIC_API_KEY present:', !!process.env.ANTHROPIC_API_KEY);
console.log('[startup] JWT_SECRET present:        ', !!process.env.JWT_SECRET);
console.log('[startup] DATABASE_PATH:             ', process.env.DATABASE_PATH);

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
  const validationError = validate(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const ctx          = buildContext(req.body);
  const systemPrompt = buildPrompt(ctx);

  try {
    const { text, model } = await callModel({ systemPrompt, messages: ctx.history, market: ctx.market, mode: ctx.mode });
    res.json({
      response: text,
      debug: {
        model,
        promptChars: systemPrompt.length,
        turns:       ctx.history.length,
      },
    });
  } catch (err) {
    console.error('[/api/assistant]', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Aureon → http://localhost:${PORT}`));
