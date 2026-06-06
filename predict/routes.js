import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function fetchOHLC(coinId, days = 30, retries = 3) {
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url);
    if (res.ok) return await res.json();
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      continue;
    }
    throw new Error(`CoinGecko OHLC error: ${res.status}`);
  }
  throw new Error('CoinGecko rate limit exceeded after retries');
}

function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return Math.round(100 - (100 / (1 + avgGain / avgLoss)));
}

function calculateSMA(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function findSupportResistance(ohlc) {
  const highs = ohlc.map(c => c[2]);
  const lows = ohlc.map(c => c[3]);
  const recentHighs = highs.slice(-10);
  const recentLows = lows.slice(-10);
  return {
    resistance: Math.max(...recentHighs),
    support: Math.min(...recentLows)
  };
}

// Compute market regime from price structure.
// Deterministic and code-only — the AI receives this as a locked input, not a question to answer.
function computeRegime(ohlc) {
  if (ohlc.length < 10) return {
    trendState: 'Range Bound', regimeStrength: 'Neutral',
    description: 'insufficient data', lhPct: 0, llPct: 0, hhPct: 0, hlPct: 0
  };

  const recent = ohlc.slice(-14);
  const highs = recent.map(c => c[2]);
  const lows  = recent.map(c => c[3]);

  let lhCount = 0, llCount = 0, hhCount = 0, hlCount = 0;
  for (let i = 1; i < highs.length; i++) {
    if (highs[i] < highs[i - 1]) lhCount++; else hhCount++;
    if (lows[i]  < lows[i - 1])  llCount++; else hlCount++;
  }

  const total = highs.length - 1;
  const lhPct = lhCount / total;
  const llPct = llCount / total;
  const hhPct = hhCount / total;
  const hlPct = hlCount / total;

  let trendState, regimeStrength;
  if      (lhPct >= 0.75 && llPct >= 0.75) { trendState = 'Bearish Trend'; regimeStrength = 'Strong'; }
  else if (lhPct >= 0.60 && llPct >= 0.60) { trendState = 'Bearish Trend'; regimeStrength = 'Moderate'; }
  else if (hhPct >= 0.75 && hlPct >= 0.75) { trendState = 'Bullish Trend'; regimeStrength = 'Strong'; }
  else if (hhPct >= 0.60 && hlPct >= 0.60) { trendState = 'Bullish Trend'; regimeStrength = 'Moderate'; }
  else                                      { trendState = 'Range Bound';   regimeStrength = 'Neutral'; }

  return {
    trendState,
    regimeStrength,
    description: `LH: ${Math.round(lhPct * 100)}% LL: ${Math.round(llPct * 100)}% HH: ${Math.round(hhPct * 100)}% HL: ${Math.round(hlPct * 100)}%`,
    lhPct, llPct, hhPct, hlPct
  };
}

// Returns setup definitions for a given regime — injected verbatim into the AI prompt.
function regimeSetupDefinitions(trendState) {
  if (trendState === 'Bearish Trend') return [
    '  "Oversold Bounce": RSI < 35. Tactical bounce within the downtrend — trend has NOT changed.',
    '  "Breakdown Risk": price testing or failing a key support level.',
    '  "Failed Bounce": prior bounce rejected; downtrend resuming.',
    '  "Continuation Setup": trend intact, resetting for another leg lower.',
    '  "Support Test": price probing a known support level for the first time.',
  ].join('\n');
  if (trendState === 'Bullish Trend') return [
    '  "Overbought Pullback": RSI > 65. Tactical pullback within the uptrend — trend has NOT reversed.',
    '  "Breakout Setup": compressing near resistance with decreasing range.',
    '  "Continuation Setup": trend intact, resetting for another leg higher.',
    '  "Resistance Test": price approaching a known resistance level.',
  ].join('\n');
  return [
    '  "Mean Reversion": price extended from midpoint, likely to return toward center.',
    '  "Range Test": price probing the upper or lower bound of the established range.',
    '  "Compression": range narrowing, volatility contracting before a move.',
    '  "Breakout Attempt": price pushing above range resistance.',
    '  "Breakdown Attempt": price pushing below range support.',
  ].join('\n');
}

// Valid setups per regime. The AI can only choose from the list for the active regime.
const SETUP_STATES_BY_REGIME = {
  'Bearish Trend': ['Oversold Bounce', 'Breakdown Risk', 'Failed Bounce', 'Continuation Setup', 'Support Test'],
  'Bullish Trend': ['Overbought Pullback', 'Breakout Setup', 'Continuation Setup', 'Resistance Test'],
  'Range Bound':   ['Mean Reversion', 'Range Test', 'Compression', 'Breakout Attempt', 'Breakdown Attempt'],
};

const DEFAULT_SETUP_BY_REGIME = {
  'Bearish Trend': 'Continuation Setup',
  'Bullish Trend': 'Continuation Setup',
  'Range Bound':   'Range Test',
};

// Enforce regime, signal, and setup consistency.
// regime is always code-computed — the AI cannot override any of these values.
function enforceConsistency(prediction, regime) {
  // Regime fields are always from code, never from AI
  prediction.trendState     = regime.trendState;
  prediction.regimeStrength = regime.regimeStrength;

  // Signal and trend direction are derived from regime, never from AI
  if (regime.trendState === 'Bearish Trend') {
    prediction.signal = 'bearish';
    prediction.trend  = 'downtrend';
  } else if (regime.trendState === 'Bullish Trend') {
    prediction.signal = 'bullish';
    prediction.trend  = 'uptrend';
  } else {
    prediction.signal = 'neutral';
    prediction.trend  = 'sideways';
  }

  // Validate setupState is compatible with the current regime; fall back if not
  const validSetups = SETUP_STATES_BY_REGIME[regime.trendState] ?? [];
  if (!validSetups.includes(prediction.setupState)) {
    prediction.setupState = DEFAULT_SETUP_BY_REGIME[regime.trendState] ?? 'Continuation Setup';
  }

  return prediction;
}

router.post('/', async (req, res) => {
  const { coinId, coinName, symbol, currentPrice, change24h, marketCap, volume } = req.body;
  if (!coinId || !currentPrice) return res.status(400).json({ error: 'Missing coinId or currentPrice' });

  try {
    const ohlc = await fetchOHLC(coinId, 30);
    if (!ohlc || ohlc.length < 10) return res.status(400).json({ error: 'Insufficient OHLC data' });

    const closes = ohlc.map(c => c[4]);
    const rsi = calculateRSI(closes);
    const sma7 = calculateSMA(closes, 7);
    const sma25 = calculateSMA(closes, 25);
    const { support, resistance } = findSupportResistance(ohlc);
    const smaTrend = sma7 && sma25 ? (sma7 > sma25 ? 'SMA7 above SMA25' : 'SMA7 below SMA25') : 'N/A';
    const regime = computeRegime(ohlc);
    const validSetupList = (SETUP_STATES_BY_REGIME[regime.trendState] ?? []).join(' | ');

    const prompt = `You are Aureon, an expert crypto technical analyst. Analyze ${coinName} (${symbol}) and classify its current tactical setup.

MARKET REGIME — pre-computed from price structure. This is locked. Do NOT reclassify it.
  Regime:    ${regime.trendState} (${regime.regimeStrength})
  Structure: ${regime.description}

Technical Data:
- Current Price: $${currentPrice}
- 24h Change: ${change24h}%
- RSI (14): ${rsi ?? 'N/A'}
- 7-day SMA: $${sma7?.toFixed(4) ?? 'N/A'} | 25-day SMA: $${sma25?.toFixed(4) ?? 'N/A'}
- SMA relationship: ${smaTrend}
- Support: $${support.toFixed(4)} | Resistance: $${resistance.toFixed(4)}

YOUR TASK:
The market regime is pre-computed and locked. Your job is to:
1. Classify the tactical SETUP within the ${regime.trendState} regime.
2. Generate a price forecast consistent with that regime.

SETUP — choose exactly one:
${validSetupList}

Setup definitions:
${regimeSetupDefinitions(regime.trendState)}

confidence: your conviction in the setupState classification (1–100).
This is setup confidence only — the regime is already determined.

Respond ONLY with valid JSON, no markdown:
{
  "setupState": <one of: ${validSetupList}>,
  "confidence": <1-100, conviction in setupState only>,
  "pattern": "<one-line setup description>",
  "shortTermTarget": <most probable near-term price target for this setup>,
  "invalidationLevel": <price level that proves this setup wrong>,
  "upsideTarget": <price for the bullish scenario within this regime>,
  "downsideRisk": <price for the bearish scenario within this regime>,
  "support": <nearest key support>,
  "resistance": <nearest key resistance>,
  "rsi": ${rsi ?? null},
  "summary": "<2-3 sentences. Lead with the setup and expected outcome. Reflect the ${regime.trendState} regime accurately. Do NOT describe the trend as bullish unless the regime is Bullish Trend.>",
  "risks": "<1-2 sentences on the primary risk to this setup>",
  "timeframe": "1-2 weeks"
}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = message.content[0].text.trim();
    const raw = JSON.parse(text);
    const prediction = enforceConsistency(raw, regime);
    res.json({ prediction });
  } catch (err) {
    console.error('[predict] error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
