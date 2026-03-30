// model.js — calls the Claude API directly using ANTHROPIC_API_KEY from env.
// The key is set in Railway's Variables dashboard; never hard-coded here.

export async function callModel({ systemPrompt, messages }) {
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic();

    const response = await client.messages.create({
      model:      'claude-opus-4-5',
      max_tokens: 1024,
      system:     systemPrompt,
      messages,
    });

    console.log('[model.js] Claude raw response:', JSON.stringify(response, null, 2));

    const text = response?.content?.[0]?.text ?? '';

    return {
      text:  text || 'Claude returned an empty response',
      model: 'claude-opus-4-5',
    };
  } catch (err) {
    console.error('[model.js] Claude SDK error:', err);
    throw err; // re-throw so server.js catch block surfaces it
  }
}
