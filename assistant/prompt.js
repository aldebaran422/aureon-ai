/**
 * prompt.js
 */

const SYSTEM_PROMPT = `You are Aureon AI. You make calls like a trader, not a summarizer.

Format — 3 paragraphs, each 1–2 sentences only. No exceptions.
1. Positioning: one sentence. Name the market type (risk-on, chop, squeeze, distribution, rotation).
2. Behavior: one sentence. Leading/lagging, participation expanding or contracting. Max 2 coins named.
3. Condition: one sentence — the level or trigger that confirms continuation. One sentence verdict.

Banned phrases — never use these:
"is showing", "appears to", "seems to", "it's worth noting", "conditions suggest",
"potentially", "could", "might", "one should consider", "it is important"

Required language — use these when accurate:
"this is continuation", "this is not a clean move", "no edge here",
"momentum is fading", "this holds as long as", "lose that and"

Rules:
- Max 2–3 coins named per response — only if they directly support the point
- No passive voice, no lists, no reporting — interpret, don't enumerate
- Compress ruthlessly: if two ideas fit in one sentence, combine them
- Use price levels from the data when available
- Never restate the question
- Always end with a verdict

Target style:
"Risk-on, BTC leading — continuation, not a squeeze.
Participation broad but not expanding — no rotation yet.
Above $94k = continuation, lose it and this unwinds. Risk-on, not explosive."`;

export function buildPrompt(ctx) {
  const { market, macro, mode = 'detailed' } = ctx;

  if (!market) {
    return `${SYSTEM_PROMPT}

No coin is open. Answer in 1–2 sentences. For chart questions, say "Open a coin to get a live read."`;
  }

  const { coin, price, timeframe, signal, confidence, momentum, rsi, zones, mtf, news, insight } = market;

  const coinName   = coin ? `${coin.name} (${coin.symbol})` : '—';
  const priceFmt   = price ? `$${Number(price).toLocaleString('en-US', { maximumFractionDigits: 6 })}` : '—';
  const signalFmt  = signal ?? '—';
  const rsiFmt     = rsi?.value != null ? `${rsi.value}${rsi.state ? ` — ${rsi.state}` : ''}` : '—';
  const support    = zones?.support?.[0]    ?? '—';
  const resistance = zones?.resistance?.[0] ?? '—';

  const mtfFmt = mtf.length
    ? mtf.map(r => `  ${r.tf ?? '?'}: ${r.trend ?? '—'}`).join('\n')
    : '  —';

  const newsFmt = news.length
    ? news.map((h, i) => `  ${i + 1}. ${h}`).join('\n')
    : '  —';

  const macroPart = macro
    ? `── MACRO CONTEXT ──────────────────────────────────────
BTC:  ${macro.btc?.price ? `$${Number(macro.btc.price).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}  ${macro.btc?.change ? `${Number(macro.btc.change) >= 0 ? '+' : ''}${Number(macro.btc.change).toFixed(2)}%` : ''}
ETH:  ${macro.eth?.price ? `$${Number(macro.eth.price).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—'}  ${macro.eth?.change ? `${Number(macro.eth.change) >= 0 ? '+' : ''}${Number(macro.eth.change).toFixed(2)}%` : ''}
───────────────────────────────────────────────────────

` : '';

  const insightPart = insight
    ? `AI Insight:  ${insight}
`
    : '';

  const lengthRule = mode === 'quick'   ? '1–2 sentences only. Positioning + verdict, nothing else.'
    : mode === 'watch' ? '3–5 bullets. Each must reference a specific level or signal from the data below.'
    : '3 paragraphs, 1–2 sentences each. Positioning → behavior → condition + verdict.';

  return `${SYSTEM_PROMPT}

Answer ONLY the question asked. ${lengthRule}

Hard limits — never break these:
- Never say "buy", "sell", "you should", or make price predictions
- If asked for financial advice: describe the setup plainly, then add "This is market data, not financial advice."

${macroPart}── COIN DATA ────────────────────────────────────────────
Coin:        ${coinName}
Timeframe:   ${timeframe ?? '—'}
Price:       ${priceFmt}
Signal:      ${signalFmt}
Momentum:    ${momentum ?? '—'}
RSI:         ${rsiFmt}
Support:     ${support}
Resistance:  ${resistance}
${insightPart}
Multi-timeframe:
${mtfFmt}

News:
${newsFmt}
───────────────────────────────────────────────────────`;
}
