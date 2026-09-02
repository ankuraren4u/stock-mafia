import { INDIA_STOCKS, US_STOCKS } from "../lib/universe.js";
import { fetchChart, fetchQuote } from "./market.js";

export interface SectorData {
  sector: string;
  etf: string;
  week1Return: number;
  week4Return: number;
  week12Return: number;
  ytdReturn: number;
  relativeStrength: number;
  momentum: "leading" | "improving" | "weakening" | "lagging";
  rotationSignal: "rotate_in" | "rotate_out" | "hold";
}

const US_SECTORS: { name: string; etf: string; symbols: string[] }[] = [
  { name: "Technology", etf: "XLK", symbols: ["AAPL", "MSFT", "NVDA", "AVGO", "AMD"] },
  { name: "Healthcare", etf: "XLV", symbols: ["UNH", "JNJ", "LLY", "ABBV", "PFE"] },
  { name: "Financials", etf: "XLF", symbols: ["JPM", "V", "MA", "BAC", "WFC"] },
  { name: "Consumer Discretionary", etf: "XLY", symbols: ["AMZN", "TSLA", "HD", "MCD", "NKE"] },
  { name: "Energy", etf: "XLE", symbols: ["XOM", "CVX", "COP", "SLB", "EOG"] },
  { name: "Industrials", etf: "XLI", symbols: ["GE", "CAT", "HON", "UNP", "RTX"] },
  { name: "Consumer Staples", etf: "XLP", symbols: ["PG", "KO", "PEP", "COST", "WMT"] },
  { name: "Utilities", etf: "XLU", symbols: ["NEE", "SO", "DUK", "AEP", "SRE"] },
  { name: "Real Estate", etf: "XLRE", symbols: ["AMT", "PLD", "CCI", "EQIX", "SPG"] },
  { name: "Materials", etf: "XLB", symbols: ["LIN", "APD", "SHW", "ECL", "FCX"] },
  { name: "Communication Services", etf: "XLC", symbols: ["META", "GOOGL", "NFLX", "DIS", "TMUS"] },
];

const IN_SECTORS: { name: string; etf: string; symbols: string[] }[] = [
  { name: "IT", etf: "", symbols: ["TCS.NS", "INFY.NS", "WIPRO.NS"] },
  { name: "Banking", etf: "", symbols: ["HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS", "AXISBANK.NS"] },
  { name: "Energy", etf: "", symbols: ["RELIANCE.NS"] },
  { name: "Consumer", etf: "", symbols: ["ITC.NS", "HINDUNILVR.NS"] },
  { name: "Auto", etf: "", symbols: ["MARUTI.NS", "TATAMOTORS.NS"] },
  { name: "Pharma", etf: "", symbols: ["SUNPHARMA.NS"] },
  { name: "Finance", etf: "", symbols: ["BAJFINANCE.NS"] },
];

async function getMultiPeriodReturn(symbols: string[]): Promise<{ w1: number; w4: number; w12: number; ytd: number }> {
  const returns = { w1: 0, w4: 0, w12: 0, ytd: 0 };
  let count = 0;

  for (const sym of symbols) {
    try {
      const { candles } = await fetchChart(sym, "1y", "1d");
      if (candles.length < 20) continue;
      const last = candles[candles.length - 1].close;
      const idx5 = Math.max(0, candles.length - 5);
      const idx20 = Math.max(0, candles.length - 20);
      const idx60 = Math.max(0, candles.length - 60);
      const idxYear = candles.findIndex((c) => c.time >= new Date(`${new Date().getFullYear()}-01-01`).getTime());
      const startYear = idxYear >= 0 ? candles[idxYear].close : candles[0].close;

      returns.w1 += (last - candles[idx5].close) / candles[idx5].close;
      returns.w4 += (last - candles[idx20].close) / candles[idx20].close;
      returns.w12 += (last - candles[idx60].close) / candles[idx60].close;
      returns.ytd += (last - startYear) / startYear;
      count++;
    } catch {}
  }

  if (count > 0) {
    returns.w1 /= count;
    returns.w4 /= count;
    returns.w12 /= count;
    returns.ytd /= count;
  }
  return returns;
}

function classifyMomentum(w1: number, w4: number, w12: number): SectorData["momentum"] {
  if (w1 > 0 && w4 > 0 && w12 > 0) return "leading";
  if (w1 > 0 && w4 > 0 && w12 <= 0) return "improving";
  if (w1 <= 0 && w4 > 0 && w12 > 0) return "weakening";
  return "lagging";
}

function rotationSignal(momentum: SectorData["momentum"], rs: number): SectorData["rotationSignal"] {
  if (momentum === "improving" && rs > 0) return "rotate_in";
  if (momentum === "weakening" && rs > 0) return "rotate_out";
  return "hold";
}

export async function analyzeSectorRotation(market: "IN" | "US" = "US"): Promise<SectorData[]> {
  const sectors = market === "US" ? US_SECTORS : IN_SECTORS;
  const results: SectorData[] = [];

  for (const sector of sectors) {
    try {
      const returns = await getMultiPeriodReturn(sector.symbols);
      const rs = returns.w4 * 0.4 + returns.w12 * 0.4 + returns.ytd * 0.2;
      const momentum = classifyMomentum(returns.w1, returns.w4, returns.w12);
      const rotation = rotationSignal(momentum, rs);

      results.push({
        sector: sector.name,
        etf: sector.etf,
        week1Return: Number((returns.w1 * 100).toFixed(2)),
        week4Return: Number((returns.w4 * 100).toFixed(2)),
        week12Return: Number((returns.w12 * 100).toFixed(2)),
        ytdReturn: Number((returns.ytd * 100).toFixed(2)),
        relativeStrength: Number((rs * 100).toFixed(2)),
        momentum,
        rotationSignal: rotation,
      });
    } catch {}
  }

  return results.sort((a, b) => b.relativeStrength - a.relativeStrength);
}
