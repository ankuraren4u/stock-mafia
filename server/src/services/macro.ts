import { fetchChart } from "./market.js";

export interface MacroIndicator {
  name: string;
  symbol: string;
  value: number;
  change: number;
  changePct: number;
  trend: "up" | "down" | "flat";
  regime: string;
  signal: "risk_on" | "risk_off" | "neutral";
}

export interface MacroDashboard {
  vix: MacroIndicator | null;
  dxy: MacroIndicator | null;
  tenYearYield: MacroIndicator | null;
  gold: MacroIndicator | null;
  crude: MacroIndicator | null;
  sp500: MacroIndicator | null;
  btc: MacroIndicator | null;
  overallRegime: "risk_on" | "cautious" | "stress";
  summary: string;
  indicators: MacroIndicator[];
}

const MACRO_SYMBOLS: { name: string; yahoo: string; category: string }[] = [
  { name: "VIX", yahoo: "^VIX", category: "volatility" },
  { name: "DXY (US Dollar)", yahoo: "DX-Y.NYB", category: "currency" },
  { name: "10Y Treasury Yield", yahoo: "^TNX", category: "rates" },
  { name: "Gold", yahoo: "GC=F", category: "commodity" },
  { name: "Crude Oil (WTI)", yahoo: "CL=F", category: "commodity" },
  { name: "S&P 500", yahoo: "^GSPC", category: "index" },
  { name: "Bitcoin", yahoo: "BTC-USD", category: "crypto" },
  { name: "Nifty 50", yahoo: "^NSEI", category: "index" },
];

function classifyVIX(vix: number): string {
  if (vix < 12) return "Extremely low — complacency";
  if (vix < 16) return "Low — calm markets";
  if (vix < 20) return "Normal — baseline volatility";
  if (vix < 25) return "Elevated — cautious";
  if (vix < 30) return "High — fear rising";
  if (vix < 40) return "Very high — stress";
  return "Extreme — panic";
}

function classifyDXY(dxy: number): string {
  if (dxy > 107) return "Strong dollar — EM pressure";
  if (dxy > 104) return "Above average — headwind for commodities";
  if (dxy > 100) return "Neutral range";
  if (dxy > 97) return "Below average — tailwind for EM";
  return "Weak dollar — commodity tailwind";
}

function classifyYield(yield_: number): string {
  if (yield_ > 5) return "Very high — tight financial conditions";
  if (yield_ > 4.5) return "Elevated — growth headwind";
  if (yield_ > 4) return "Moderate — normal range";
  if (yield_ > 3) return "Low — accommodative";
  return "Very low — zero-bound territory";
}

function classifyGold(gold: number): string {
  if (gold > 2800) return "Record high — strong safe haven demand";
  if (gold > 2400) return "Strong — inflation/risk hedge active";
  if (gold > 2000) return "Elevated — macro uncertainty";
  return "Normal range";
}

async function fetchMacroIndicator(name: string, yahoo: string, classify: (v: number) => string): Promise<MacroIndicator | null> {
  try {
    const { candles, meta } = await fetchChart(yahoo, "3mo", "1d");
    if (candles.length < 5) return null;
    const last = candles[candles.length - 1].close;
    const prev = candles[candles.length - 2]?.close ?? last;
    const weekAgo = candles[Math.max(0, candles.length - 6)]?.close ?? last;
    const change = last - prev;
    const changePct = prev > 0 ? (change / prev) * 100 : 0;
    const trend = last > weekAgo * 1.005 ? "up" : last < weekAgo * 0.995 ? "down" : "flat";

    let signal: MacroIndicator["signal"] = "neutral";
    if (name === "VIX") signal = last > 25 ? "risk_off" : last < 15 ? "risk_on" : "neutral";
    else if (name.includes("Gold")) signal = last > 2600 ? "risk_off" : "neutral";

    return {
      name,
      symbol: yahoo,
      value: Number(last.toFixed(2)),
      change: Number(change.toFixed(2)),
      changePct: Number(changePct.toFixed(2)),
      trend,
      regime: classify(last),
      signal,
    };
  } catch {
    return null;
  }
}

export async function fetchMacroDashboard(): Promise<MacroDashboard> {
  const classifyMap: Record<string, (v: number) => string> = {
    "VIX": classifyVIX,
    "DXY (US Dollar)": classifyDXY,
    "10Y Treasury Yield": classifyYield,
    "Gold": classifyGold,
  };

  const results: MacroIndicator[] = [];
  for (const m of MACRO_SYMBOLS) {
    const indicator = await fetchMacroIndicator(m.name, m.yahoo, classifyMap[m.name] ?? (() => ""));
    if (indicator) results.push(indicator);
  }

  const vix = results.find((r) => r.name === "VIX") ?? null;
  const dxy = results.find((r) => r.name === "DXY (US Dollar)") ?? null;
  const tenYear = results.find((r) => r.name === "10Y Treasury Yield") ?? null;
  const gold = results.find((r) => r.name === "Gold") ?? null;
  const crude = results.find((r) => r.name === "Crude Oil (WTI)") ?? null;
  const sp500 = results.find((r) => r.name === "S&P 500") ?? null;
  const btc = results.find((r) => r.name === "Bitcoin") ?? null;

  let riskSignals = 0;
  if (vix && vix.value > 25) riskSignals--;
  if (vix && vix.value < 15) riskSignals++;
  if (sp500 && sp500.changePct > 0) riskSignals++;
  if (sp500 && sp500.changePct < -1) riskSignals--;
  if (gold && gold.changePct > 1) riskSignals--;

  const regime: MacroDashboard["overallRegime"] = riskSignals >= 2 ? "risk_on" : riskSignals <= -2 ? "stress" : "cautious";

  const summary = [
    `VIX: ${vix?.value ?? "?"} (${regime === "risk_on" ? "risk-on" : regime === "stress" ? "stress" : "cautious"})`,
    dxy ? `DXY ${dxy.value}` : "",
    tenYear ? `10Y ${tenYear.value}%` : "",
    gold ? `Gold $${gold.value}` : "",
    crude ? `Oil $${crude.value}` : "",
  ].filter(Boolean).join(" · ");

  return {
    vix,
    dxy,
    tenYearYield: tenYear,
    gold,
    crude,
    sp500,
    btc,
    overallRegime: regime,
    summary,
    indicators: results,
  };
}
