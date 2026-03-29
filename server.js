import { config } from 'dotenv';
config(); // reads .env from the current working directory (ignored on Railway/Render where env vars are set in the dashboard)
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { validate }     from './assistant/validate.js';
import { buildContext } from './assistant/context.js';
import { buildPrompt }  from './assistant/prompt.js';
import { callModel }    from './assistant/model.js';
import authRoutes       from './auth/routes.js';
import userRoutes       from './user/routes.js';

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
