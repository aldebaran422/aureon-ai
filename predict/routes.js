import { Router } from 'express';
import db from '../db.js';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function fetchOHLC(coinId, days = 30) {
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko OHLC error: ${res.status}`);
  return await res.json();
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
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - (100 / (1 + rs)));
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
    support: Math.min(...recentLows),
    avgHigh: recentHighs.reduce((a, b) => a + b, 0) / recentHighs.length,
    avgLow: recentLows.reduce((a, b) => a + b, 0) / recentLows.length
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
    const { support, resistance, avgHigh, avgLow } = findSupportResistance(ohlc);
    const trend = sma7 && sma25 ? (sma7 > sma25 ? 'uptrend' : 'downtrend') : 'neutral';
    const priceVsSMA7 = sma7 ? ((currentPrice - sma7) / sma7 * 100).toFixed(2) : null;
    const recentVolumes = ohlc.slice(-5).map(c => c[5] || volume);
    const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const volumeSpike = volume > avgVolume * 1.5;

    const prompt = `You are Aureon, an expert crypto technical analyst. Analyze ${coinName} (${symbol}) and provide a structured prediction.

Technical Data:
- Current Price: $${currentPrice}
- 24h Change: ${change24h}%
- RSI (14): ${rsi ?? 'N/A'}
- 7-day SMA: $${sma7?.toFixed(4) ?? 'N/A'}
- 25-day SMA: $${sma25?.toFixed(4) ?? 'N/A'}
- Trend: ${trend}
- Price vs 7 SMA: ${priceVsSMA7}%
- Support: $${support.toFixed(4)}
- Resistance: $${resistance.toFixed(4)}
- Volume Spike: ${volumeSpike ? 'Yes' : 'No'}
- Market Cap: $${marketCap}
- 30-day OHLC data points: ${ohlc.length}

Respond ONLY with a valid JSON object, no markdown, no explanation outside JSON:
{
  "signal": "bullish" | "bearish" | "neutral",
  "confidence": <number 1-100>,
  "pattern": "<detected chart pattern name, e.g. Bull Flag, Double Bottom, etc>",
  "shortTermTarget": <price number>,
  "support": <price number>,
  "resistance": <price number>,
  "rsi": <number or null>,
  "trend": "<uptrend|downtrend|sideways>",
  "summary": "<2-3 sentence plain English analysis>",
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
    res.json({ prediction, technicals: { rsi, sma7, sma25, support, resistance, trend, volumeSpike } });
  } catch (err) {
    console.error('[predict] error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
