import { computeReturns } from "./portfolio-analytics.js";

export interface CorrelationMatrix {
  symbols: string[];
  matrix: number[][];
}

export interface SectorHeatmap {
  sector: string;
  avgChange: number;
  stocks: { symbol: string; change: number; volume: number }[];
}

export function computeCorrelation(pricesA: number[], pricesB: number[]): number {
  const returnsA = computeReturns(pricesA);
  const returnsB = computeReturns(pricesB);
  if (returnsA.length < 5 || returnsB.length < 5) return 0;

  const n = Math.min(returnsA.length, returnsB.length);
  const a = returnsA.slice(-n);
  const b = returnsB.slice(-n);

  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;

  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }

  const denom = Math.sqrt(varA * varB);
  return denom === 0 ? 0 : cov / denom;
}

export function buildCorrelationMatrix(priceData: Map<string, number[]>): CorrelationMatrix {
  const symbols = [...priceData.keys()];
  const n = symbols.length;
  const matrix: number[][] = [];

  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) { row.push(1); continue; }
      const a = priceData.get(symbols[i]) ?? [];
      const b = priceData.get(symbols[j]) ?? [];
      row.push(Number(computeCorrelation(a, b).toFixed(3)));
    }
    matrix.push(row);
  }

  return { symbols, matrix };
}

export function computeSectorHeatmap(input: {
  symbols: { symbol: string; sector: string; market: string }[];
  quotes: Map<string, { changePct: number; volume: number }>;
}): SectorHeatmap[] {
  const sectorMap = new Map<string, { symbol: string; change: number; volume: number }[]>();

  for (const stock of input.symbols) {
    const q = input.quotes.get(stock.symbol);
    if (!q) continue;
    const sector = stock.sector || "Unknown";
    if (!sectorMap.has(sector)) sectorMap.set(sector, []);
    sectorMap.get(sector)!.push({ symbol: stock.symbol, change: q.changePct, volume: q.volume });
  }

  const heatmaps: SectorHeatmap[] = [];
  for (const [sector, stocks] of sectorMap) {
    const avgChange = stocks.reduce((a, s) => a + s.change, 0) / stocks.length;
    heatmaps.push({
      sector,
      avgChange: Number(avgChange.toFixed(2)),
      stocks: stocks.sort((a, b) => b.change - a.change),
    });
  }

  return heatmaps.sort((a, b) => b.avgChange - a.avgChange);
}
