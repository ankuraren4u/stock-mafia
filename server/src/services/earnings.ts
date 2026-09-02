import { fetchChart } from "./market.js";

export interface EarningsEvent {
  symbol: string;
  date: string;
  time: "before-market" | "after-market" | "unknown";
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  surprisePercent: number | null;
  quarter: string;
  year: number;
}

export interface EarningsHistory {
  date: string;
  epsEstimate: number;
  epsActual: number;
  surprisePercent: number;
  priceOnDate: number;
  priceAfter1d: number;
  priceChange1d: number;
  priceAfter5d: number;
  priceChange5d: number;
}

export interface EarningsAnalysis {
  symbol: string;
  nextEarnings: EarningsEvent | null;
  history: EarningsHistory[];
  beatRate: number;
  avgSurprisePercent: number;
  avgPostEarningsDrift1d: number;
  avgPostEarningsDrift5d: number;
  tendency: "beats" | "misses" | "mixed";
  upcomingInDays: number | null;
}

const YAHOO_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Accept: "application/json",
};

async function yahooFetch(url: string): Promise<any> {
  const res = await fetch(url, { headers: YAHOO_HEADERS });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchEarningsSchedule(symbol: string): Promise<EarningsEvent[]> {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents,earnings`;
    const json = await yahooFetch(url);
    const result = json?.quoteSummary?.result?.[0];
    if (!result) return [];

    const upcoming: EarningsEvent[] = [];
    const earningsDate = result.calendarEvents?.earningsDate;
    if (earningsDate) {
      const dates = Array.isArray(earningsDate) ? earningsDate : [earningsDate];
      for (const d of dates) {
        const dateStr = d.fmt ?? String(d);
        if (!dateStr) continue;
        const earningsChart = result.earnings?.earningsChart;
        const quarterly = earningsChart?.quarterly ?? [];
        const latest = quarterly[quarterly.length - 1];
        upcoming.push({
          symbol,
          date: dateStr,
          time: "unknown",
          epsEstimate: latest?.earnings?.estimate?.raw ?? null,
          epsActual: latest?.earnings?.actual?.raw ?? null,
          revenueEstimate: result.earnings?.financialsChart?.yearly?.slice(-1)?.[0]?.revenue?.raw ?? null,
          revenueActual: null,
          surprisePercent: null,
          quarter: "",
          year: new Date(dateStr).getFullYear(),
        });
      }
    }
    return upcoming;
  } catch {
    return [];
  }
}

export async function fetchEarningsHistory(symbol: string, limit = 8): Promise<EarningsHistory[]> {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=earnings`;
    const json = await yahooFetch(url);
    const result = json?.quoteSummary?.result?.[0];
    if (!result?.earnings?.earningsChart) return [];

    const quarterly = result.earnings.earningsChart.quarterly ?? [];
    const history: EarningsHistory[] = [];

    for (const q of quarterly.slice(-limit)) {
      const date = q.date ?? "";
      const epsEstimate = q.earnings?.estimate?.raw ?? 0;
      const epsActual = q.earnings?.actual?.raw ?? 0;
      const surprisePercent = epsEstimate !== 0 ? ((epsActual - epsEstimate) / Math.abs(epsEstimate)) * 100 : 0;

      history.push({
        date,
        epsEstimate,
        epsActual,
        surprisePercent: Number(surprisePercent.toFixed(2)),
        priceOnDate: 0,
        priceAfter1d: 0,
        priceChange1d: 0,
        priceAfter5d: 0,
        priceChange5d: 0,
      });
    }
    return history;
  } catch {
    return [];
  }
}

export async function analyzeEarnings(symbol: string): Promise<EarningsAnalysis> {
  const [upcoming, history] = await Promise.all([
    fetchEarningsSchedule(symbol),
    fetchEarningsHistory(symbol),
  ]);

  const nextEarnings = upcoming[0] ?? null;
  let upcomingInDays: number | null = null;
  if (nextEarnings?.date) {
    const diff = new Date(nextEarnings.date).getTime() - Date.now();
    upcomingInDays = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  const beats = history.filter((h) => h.surprisePercent > 0).length;
  const beatRate = history.length > 0 ? (beats / history.length) * 100 : 0;
  const avgSurprise = history.length > 0
    ? history.reduce((a, h) => a + h.surprisePercent, 0) / history.length
    : 0;
  const avgDrift1d = history.length > 0
    ? history.reduce((a, h) => a + h.priceChange1d, 0) / history.length
    : 0;
  const avgDrift5d = history.length > 0
    ? history.reduce((a, h) => a + h.priceChange5d, 0) / history.length
    : 0;

  const tendency = beatRate >= 65 ? "beats" : beatRate <= 35 ? "misses" : "mixed";

  return {
    symbol,
    nextEarnings,
    history,
    beatRate: Number(beatRate.toFixed(1)),
    avgSurprisePercent: Number(avgSurprise.toFixed(2)),
    avgPostEarningsDrift1d: Number(avgDrift1d.toFixed(2)),
    avgPostEarningsDrift5d: Number(avgDrift5d.toFixed(2)),
    tendency,
    upcomingInDays,
  };
}
