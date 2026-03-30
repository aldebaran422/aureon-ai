// model.js — calls the Claude API directly using ANTHROPIC_API_KEY from env.
// The key is set in Railway's Variables dashboard; never hard-coded here.

export async function callModel({ systemPrompt, messages }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  // Let the SDK read ANTHROPIC_API_KEY from process.env directly.
  // Passing apiKey explicitly can cause auth failures if the value is
  // evaluated before the env is fully loaded.
  const client = new Anthropic();

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
