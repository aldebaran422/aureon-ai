/**
 * model.js
 * Model adapter — the only file that needs to change when connecting a real LLM.
 *
 * callModel({ systemPrompt, messages, market, mode }) → Promise<{ text, model }>
 *
 * Live mode:  set ANTHROPIC_API_KEY in your environment.
 *             npm install @anthropic-ai/sdk  (if not already installed)
 * Mock mode:  no API key → returns a placeholder message.
 */

// ── Live Claude API (auto-enabled when ANTHROPIC_API_KEY is set) ─────────────

async function callClaude(systemPrompt, messages) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  const msg = await client.messages.create({
    model:      'claude-opus-4-5',
    max_tokens: 1024,
    system:     systemPrompt,
    messages,
  });
  return {
    text:  msg.content.find(b => b.type === 'text')?.text ?? '',
    model: 'claude-opus-4-5',
  };
}

export async function callModel({ systemPrompt, messages }) {
  if (process.env.ANTHROPIC_API_KEY) {
    return callClaude(systemPrompt, messages);
  }
  return {
    text:  'No API key set — add ANTHROPIC_API_KEY to enable live responses.',
    model: 'mock',
  };
}
