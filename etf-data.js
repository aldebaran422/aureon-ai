// ─────────────────────────────────────────────────────────────────────────────
// ETF Flow Data — updated manually each week from farside.co.uk
//
// HOW TO UPDATE:
//   1. Go to https://farside.co.uk  (BTC, ETH, XRP tabs)
//   2. Edit the values below
//   3. git commit + git push → Railway redeploys automatically (~30 s)
//   4. Tap Refresh in the iOS app — it will detect the new lastUpdated date
//
// FIELD REFERENCE:
//   lastUpdated   — date string 'YYYY-MM-DD'  → shown as "Latest available (Apr X)" in app
//   btcFlow       — net BTC ETF 24h flow in USD (negative = outflow)
//   ethFlow       — net ETH ETF 24h flow in USD (negative = outflow)
//   xrpFlow       — net XRP ETF 24h flow in USD (negative = outflow)
//   btcAUM        — total BTC spot ETF AUM in USD
//   ethAUM        — total ETH spot ETF AUM in USD
//   xrpAUM        — total XRP spot ETF AUM in USD
//   btcRecentFlows — last 7 daily BTC net flows, oldest → newest (index 6 = today)
//   ethRecentFlows — last 7 daily ETH net flows, oldest → newest
//   xrpRecentFlows — last 7 daily XRP net flows, oldest → newest
// ─────────────────────────────────────────────────────────────────────────────

export const etfData = {

  // ── Date ─────────────────────────────────────────────────────────────────
  lastUpdated: '2026-04-26',          // UPDATE THIS when you refresh data

  // ── 24h Net Flows ─────────────────────────────────────────────────────────
  btcFlow:  -384_900_000,             // BTC spot ETF net flow today
  ethFlow:   -20_300_000,             // ETH spot ETF net flow today
  xrpFlow:    14_600_000,             // XRP spot ETF net flow today  ← TEST CHANGE (+300k vs Apr 19)

  // ── AUM ──────────────────────────────────────────────────────────────────
  btcAUM:  94_000_000_000,            // total BTC ETF assets under management
  ethAUM:   6_800_000_000,            // total ETH ETF assets under management
  xrpAUM:   1_413_300_000,            // total XRP ETF assets under management

  // ── 7-day Flow History (oldest first, index 6 = most recent day) ──────────
  btcRecentFlows: [
    -108_500_000,   // day -6
     462_400_000,   // day -5
    -113_300_000,   // day -4
    -117_700_000,   // day -3
    -384_900_000,   // day -2
    -384_900_000,   // day -1
    -384_900_000,   // today
  ],
  ethRecentFlows: [
    -133_200_000,   // day -6
      26_200_000,   // day -5
      89_000_000,   // day -4
     -35_000_000,   // day -3
     -20_300_000,   // day -2
     -20_300_000,   // day -1
     -20_300_000,   // today
  ],
  xrpRecentFlows: [
      8_200_000,    // day -6
     -2_100_000,    // day -5
     15_400_000,    // day -4
      6_800_000,    // day -3
     -3_200_000,    // day -2
     11_700_000,    // day -1
     14_600_000,    // today  ← matches xrpFlow test change
  ],
};
