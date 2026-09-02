import { fetchChart } from "./market.js";

export interface MonthlyPattern {
  month: number;
  monthName: string;
  avgReturn: number;
  winRate: number;
  occurrences: number;
  bestReturn: number;
  worstReturn: number;
}

export interface DayOfWeekPattern {
  day: number;
  dayName: string;
  avgReturn: number;
  winRate: number;
  occurrences: number;
}

export interface SeasonalityAnalysis {
  symbol: string;
  monthlyPatterns: MonthlyPattern[];
  dayOfWeekPatterns: DayOfWeekPattern[];
  bestMonths: string[];
  worstMonths: string[];
  currentMonthSignal: "bullish" | "bearish" | "neutral";
  currentDaySignal: "bullish" | "bearish" | "neutral";
  summary: string;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function analyzeSeasonality(symbol: string): Promise<SeasonalityAnalysis> {
  const { candles } = await fetchChart(symbol, "5y", "1d");
  if (candles.length < 200) {
    return {
      symbol,
      monthlyPatterns: [],
      dayOfWeekPatterns: [],
      bestMonths: [],
      worstMonths: [],
      currentMonthSignal: "neutral",
      currentDaySignal: "neutral",
      summary: "Insufficient data for seasonality analysis",
    };
  }

  const monthlyReturns = new Map<number, number[]>();
  const dailyReturns = new Map<number, number[]>();

  for (let i = 1; i < candles.length; i++) {
    const ret = (candles[i].close - candles[i - 1].close) / candles[i - 1].close;
    const date = new Date(candles[i].time);
    const month = date.getMonth();
    const day = date.getDay();

    if (!monthlyReturns.has(month)) monthlyReturns.set(month, []);
    monthlyReturns.get(month)!.push(ret);

    if (!dailyReturns.has(day)) dailyReturns.set(day, []);
    dailyReturns.get(day)!.push(ret);
  }

  const monthlyPatterns: MonthlyPattern[] = [];
  for (let m = 0; m < 12; m++) {
    const returns = monthlyReturns.get(m) ?? [];
    if (returns.length < 2) continue;
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const wins = returns.filter((r) => r > 0).length;
    monthlyPatterns.push({
      month: m,
      monthName: MONTHS[m],
      avgReturn: Number((avg * 100).toFixed(2)),
      winRate: Number(((wins / returns.length) * 100).toFixed(1)),
      occurrences: returns.length,
      bestReturn: Number((Math.max(...returns) * 100).toFixed(2)),
      worstReturn: Number((Math.min(...returns) * 100).toFixed(2)),
    });
  }

  const dayOfWeekPatterns: DayOfWeekPattern[] = [];
  for (let d = 0; d < 7; d++) {
    const returns = dailyReturns.get(d) ?? [];
    if (returns.length < 10) continue;
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const wins = returns.filter((r) => r > 0).length;
    dayOfWeekPatterns.push({
      day: d,
      dayName: DAYS[d],
      avgReturn: Number((avg * 100).toFixed(3)),
      winRate: Number(((wins / returns.length) * 100).toFixed(1)),
      occurrences: returns.length,
    });
  }

  const sorted = [...monthlyPatterns].sort((a, b) => b.avgReturn - a.avgReturn);
  const bestMonths = sorted.slice(0, 3).map((m) => m.monthName);
  const worstMonths = sorted.slice(-3).reverse().map((m) => m.monthName);

  const currentMonth = new Date().getMonth();
  const today = new Date().getDay();
  const currentMonthPattern = monthlyPatterns.find((m) => m.month === currentMonth);
  const currentDayPattern = dayOfWeekPatterns.find((d) => d.day === today);

  const currentMonthSignal: SeasonalityAnalysis["currentMonthSignal"] =
    currentMonthPattern && currentMonthPattern.avgReturn > 0.5 ? "bullish"
    : currentMonthPattern && currentMonthPattern.avgReturn < -0.5 ? "bearish"
    : "neutral";

  const currentDaySignal: SeasonalityAnalysis["currentDaySignal"] =
    currentDayPattern && currentDayPattern.avgReturn > 0.05 ? "bullish"
    : currentDayPattern && currentDayPattern.avgReturn < -0.05 ? "bearish"
    : "neutral";

  const summary = [
    `${MONTHS[currentMonth]} historically ${currentMonthSignal} for this name`,
    `Best months: ${bestMonths.join(", ")}`,
    `Worst months: ${worstMonths.join(", ")}`,
    `${DAYS[today]} avg return: ${currentDayPattern?.avgReturn?.toFixed(3) ?? "?"}%`,
  ].join(" · ");

  return {
    symbol,
    monthlyPatterns,
    dayOfWeekPatterns,
    bestMonths,
    worstMonths,
    currentMonthSignal,
    currentDaySignal,
    summary,
  };
}
