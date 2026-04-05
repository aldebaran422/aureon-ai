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
    const trend = sma7 && sma25 ? (sma7 > sma25 ? 'uptrend' : 'downtrend') : 'neutral';

    const prompt = `You are Aureon, an expert crypto technical analyst. Analyze ${coinName} (${symbol}) and provide a structured prediction.

Technical Data:
- Current Price: $${currentPrice}
- 24h Change: ${change24h}%
- RSI (14): ${rsi ?? 'N/A'}
- 7-day SMA: $${sma7?.toFixed(4) ?? 'N/A'}
- 25-day SMA: $${sma25?.toFixed(4) ?? 'N/A'}
- Trend: ${trend}
- Support: $${support.toFixed(4)}
- Resistance: $${resistance.toFixed(4)}

Respond ONLY with a valid JSON object, no markdown:
{
  "signal": "bullish" or "bearish" or "neutral",
  "confidence": <number 1-100>,
  "pattern": "<chart pattern name>",
  "shortTermTarget": <price number>,
  "support": <price number>,
  "resistance": <price number>,
  "rsi": <number or null>,
  "trend": "<uptrend|downtrend|sideways>",
  "summary": "<2-3 sentence analysis>",
  "risks": "<1-2 sentence key risk>",
  "timeframe": "1-2 weeks"
}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = message.content[0].text.trim();
    const prediction = JSON.parse(text);
    res.json({ prediction });
  } catch (err) {
    console.error('[predict] error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
