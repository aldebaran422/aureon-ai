/**
 * question-intent.js — Aureon Question Intent Model (QIM)
 *
 * Classifies each user question into one of four intent types before Aureon responds.
 * Intent determines the response mode: how Aureon answers, not just what it says.
 *
 * Types:
 *   'decision'  — wants a verdict (Yes/No/Not yet). Speak in verdicts.
 *   'forecast'  — wants the expected path or likely outcome. Speak in probabilities.
 *   'explain'   — wants to understand why/how/what. Speak in causes.
 *   'general'   — open-ended or structural question. Use default mode.
 *
 * Priority order: decision > explain > forecast > general
 * (decision is most specific; forecast is the broadest catch)
 */

// DECISION: auxiliary-verb openers + explicit confirmation-seeking phrases.
// "Will/would/can/could" openers are excluded — those lean forecast.
const DECISION_TESTS = [
  q => /^(is|are|was|were|should|did|does|do|has|have)\b/i.test(q) && q.length < 90,
  q => /\b(in simple terms|plain english|simply put|yes or no)\b/i.test(q),
];

// EXPLAIN: questions about cause, meaning, or mechanism.
const EXPLAIN_TESTS = [
  q => /^why\b/i.test(q),
  q => /^how (does|do|is|are|can|did|would)\b/i.test(q),
  q => /\bwhy (is|are|was|were|did|does|do|has|have)\b/i.test(q),
  q => /\bexplain\b/i.test(q),
  q => /\bwhat does (this|that|it|xrp|btc|eth) (mean|tell|indicate|show)\b/i.test(q),
  q => /\bwhat'?s (happening|going on|causing|behind|driving|pushing)\b/i.test(q),
  q => /\bwhat caused\b/i.test(q),
  q => /\b(walk me through|help me understand|break (it|this) down)\b/i.test(q),
];

// FORECAST: directional, path, or outcome questions.
const FORECAST_TESTS = [
  q => /price target|target price|price forecast|price prediction/i.test(q),
  q => /will (it|xrp|btc|eth) (hit|reach|get to|make it to)/i.test(q),
  q => /by year end|end of year|\beoy\b/i.test(q),
  q => /how (high|low) can/i.test(q),
  q => /long term target|12 month|1 year target/i.test(q),
  q => /(reach|hit|get to|make it to) \$/i.test(q),
  q => /what (do|does|will|would|can|could|is|are) (you see |it |xrp |btc |eth |the market )?(do|doing|happen|go|going|move|moving|head|headed|look|looking)/i.test(q),
  q => /next (few )?(days|weeks|hours)/i.test(q),
  q => /over the next|this week|next week|going forward|upcoming/i.test(q),
  q => /what'?s next/i.test(q),
  q => /(near|short)[- ]term (outlook|view|target|move)/i.test(q),
  q => /forecast for/i.test(q),
  q => /what happens/i.test(q),
  q => /where (is|are|will|do) (xrp|btc|eth|it|this|crypto|the market)/i.test(q),
  q => /did (it|xrp|btc|eth) bottom|bottom (yet|in|confirmed)/i.test(q),
  q => /\b(likely path|expected path|probable path|likely outcome)\b/i.test(q),
  q => /consolidat|reversal confirmed|trend (change|reversal|continue)/i.test(q),
];

function matchesAny(tests, q) {
  return tests.some(fn => fn(q));
}

/**
 * Classify the user's question into an intent type.
 * Returns 'decision' | 'forecast' | 'explain' | 'general'.
 */
export function classifyIntent(question) {
  const q = (question ?? '').trim();
  if (!q) return 'general';

  if (matchesAny(DECISION_TESTS, q)) return 'decision';
  if (matchesAny(EXPLAIN_TESTS, q))  return 'explain';
  if (matchesAny(FORECAST_TESTS, q)) return 'forecast';

  return 'general';
}

/**
 * EXPLAIN_MODE_RULE — injected into the prompt only when intent === 'explain'.
 * Speak in causes: what is driving it, evidence, practical takeaway.
 */
export const EXPLAIN_MODE_RULE = `
EXPLAIN MODE ACTIVE. Target: 60–120 words.

STRUCTURE — strictly in this order:
1. First sentence: the cause or primary driver. State what is happening and why — directly.
2. One supporting sentence: evidence from the chart or context that confirms it.
3. One plain-English takeaway: what this means practically for the asset right now.

BANNED in explain mode:
✗ Opening with a price target or directional forecast before explaining the cause
✗ Yes/No verdicts delivered before the explanation
✗ Listing indicator values without connecting them to meaning
✗ Restating the question before answering it

CORRECT examples:
Q: "Why is XRP falling?"
✓ "Sellers regained control after price failed to hold $1.14. Each bounce attempt since has been absorbed — a pattern that signals sustained distribution, not temporary weakness. Until buyers defend a higher low, the path of least resistance stays lower."

Q: "What does this mean for XRP?"
✓ "It means the market is testing whether buyers have conviction at this level. The previous support at $1.09 is now the key reference — a hold here sets up a potential base, while a break accelerates the move toward $1.05."`;
