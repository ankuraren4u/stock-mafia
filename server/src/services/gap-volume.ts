import type { Candle } from "../lib/indicators.js";

export interface GapEvent {
  date: string;
  type: "gap_up" | "gap_down";
  open: number;
  prevClose: number;
  gapPercent: number;
  gapHigh: number;
  gapLow: number;
  filled: boolean;
  barsToFill: number | null;
  fillPercent: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
}

export interface GapAnalysis {
  symbol: string;
  gaps: GapEvent[];
  openGaps: GapEvent[];
  gapUpCount: number;
  gapDownCount: number;
  fillRate: number;
  avgFillBars: number;
  currentPrice: number;
  nearestGapAbove: { price: number; percent: number } | null;
  nearestGapBelow: { price: number; percent: number } | null;
}

export interface VolumeLevel {
  price: number;
  volume: number;
  percentage: number;
  type: "support" | "resistance" | "neutral";
}

export interface VolumeProfileAnalysis {
  poc: number;
  valueAreaHigh: number;
  valueAreaLow: number;
  valueAreaVolumePct: number;
  levels: VolumeLevel[];
  hvn: number[];
  lvn: number[];
  bias: "bullish" | "bearish" | "neutral";
}

export function detectGaps(candles: Candle[], avgLookback = 20, thresholdPct = 0.5): GapEvent[] {
  const gaps: GapEvent[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const gapPct = ((c.open - prev.close) / prev.close) * 100;
    if (Math.abs(gapPct) < thresholdPct) continue;

    const avgVol = candles.slice(Math.max(0, i - avgLookback), i).reduce((a, x) => a + (x.volume || 0), 0) / avgLookback;
    const type = gapPct > 0 ? "gap_up" : "gap_down";

    let filled = false;
    let barsToFill: number | null = null;
    let fillPct = 0;
    const gapTop = Math.max(c.open, prev.close);
    const gapBottom = Math.min(c.open, prev.close);

    for (let j = i + 1; j < candles.length; j++) {
      if (type === "gap_up") {
        if (candles[j].low <= gapBottom) {
          filled = true;
          barsToFill = j - i;
          fillPct = 100;
          break;
        }
        const partial = Math.max(0, (gapTop - candles[j].low) / (gapTop - gapBottom)) * 100;
        if (partial > fillPct) fillPct = partial;
      } else {
        if (candles[j].high >= gapTop) {
          filled = true;
          barsToFill = j - i;
          fillPct = 100;
          break;
        }
        const partial = Math.max(0, (candles[j].high - gapBottom) / (gapTop - gapBottom)) * 100;
        if (partial > fillPct) fillPct = partial;
      }
    }

    gaps.push({
      date: new Date(c.time).toISOString().slice(0, 10),
      type,
      open: c.open,
      prevClose: prev.close,
      gapPercent: Number(gapPct.toFixed(2)),
      gapHigh: gapTop,
      gapLow: gapBottom,
      filled,
      barsToFill,
      fillPercent: Number(fillPct.toFixed(1)),
      volume: c.volume || 0,
      avgVolume: avgVol,
      volumeRatio: avgVol > 0 ? Number(((c.volume || 0) / avgVol).toFixed(2)) : 0,
    });
  }
  return gaps.reverse();
}

export function analyzeGaps(candles: Candle[]): GapAnalysis {
  const gaps = detectGaps(candles);
  const openGaps = gaps.filter((g) => !g.filled);
  const currentPrice = candles[candles.length - 1]?.close ?? 0;

  const filled = gaps.filter((g) => g.filled);
  const fillRate = gaps.length > 0 ? (filled.length / gaps.length) * 100 : 0;
  const avgFillBars = filled.length > 0
    ? filled.reduce((a, g) => a + (g.barsToFill ?? 0), 0) / filled.length
    : 0;

  const gapsAbove = openGaps.filter((g) => g.gapLow > currentPrice).sort((a, b) => a.gapLow - b.gapLow);
  const gapsBelow = openGaps.filter((g) => g.gapHigh < currentPrice).sort((a, b) => b.gapHigh - a.gapHigh);

  return {
    symbol: "",
    gaps,
    openGaps,
    gapUpCount: gaps.filter((g) => g.type === "gap_up").length,
    gapDownCount: gaps.filter((g) => g.type === "gap_down").length,
    fillRate: Number(fillRate.toFixed(1)),
    avgFillBars: Number(avgFillBars.toFixed(1)),
    currentPrice,
    nearestGapAbove: gapsAbove[0] ? { price: gapsAbove[0].gapLow, percent: Number((((gapsAbove[0].gapLow - currentPrice) / currentPrice) * 100).toFixed(2)) } : null,
    nearestGapBelow: gapsBelow[0] ? { price: gapsBelow[0].gapHigh, percent: Number((((currentPrice - gapsBelow[0].gapHigh) / currentPrice) * 100).toFixed(2)) } : null,
  };
}

export function buildVolumeProfile(candles: Candle[], numBins = 40): VolumeProfileAnalysis {
  if (candles.length < 10) {
    return { poc: 0, valueAreaHigh: 0, valueAreaLow: 0, valueAreaVolumePct: 0, levels: [], hvn: [], lvn: [], bias: "neutral" };
  }

  const high = Math.max(...candles.map((c) => c.high));
  const low = Math.min(...candles.map((c) => c.low));
  const range = high - low;
  const binSize = range / numBins;

  const bins: { price: number; volume: number; low: number; high: number }[] = [];
  for (let i = 0; i < numBins; i++) {
    const binLow = low + i * binSize;
    const binHigh = binLow + binSize;
    const mid = (binLow + binHigh) / 2;
    let vol = 0;
    for (const c of candles) {
      if (c.high >= binLow && c.low <= binHigh) {
        const overlap = Math.min(c.high, binHigh) - Math.max(c.low, binLow);
        if (overlap > 0) vol += (c.volume || 0) * (overlap / (c.high - c.low || 1));
      }
    }
    bins.push({ price: mid, volume: vol, low: binLow, high: binHigh });
  }

  const totalVolume = bins.reduce((a, b) => a + b.volume, 0);
  const pocBin = bins.reduce((max, b) => b.volume > max.volume ? b : max, bins[0]);

  const sorted = [...bins].sort((a, b) => b.volume - a.volume);
  let cumVol = 0;
  const valueAreaBins: number[] = [];
  for (const b of sorted) {
    cumVol += b.volume;
    valueAreaBins.push(b.price);
    if (cumVol >= totalVolume * 0.7) break;
  }

  const valueAreaHigh = Math.max(...valueAreaBins);
  const valueAreaLow = Math.min(...valueAreaBins);
  const levels: VolumeLevel[] = bins.map((b) => {
    const pct = totalVolume > 0 ? (b.volume / totalVolume) * 100 : 0;
    let type: VolumeLevel["type"] = "neutral";
    if (b.price === pocBin.price) type = "support";
    else if (b.price > valueAreaHigh) type = "resistance";
    else if (b.price < valueAreaLow) type = "support";
    return { price: b.price, volume: b.volume, percentage: Number(pct.toFixed(1)), type };
  });

  const hvn = bins.filter((b) => b.volume > totalVolume / numBins * 2).map((b) => b.price);
  const lvn = bins.filter((b) => b.volume < totalVolume / numBins * 0.3).map((b) => b.price);

  const lastClose = candles[candles.length - 1].close;
  const bias = lastClose > pocBin.price ? "bullish" : lastClose < pocBin.price ? "bearish" : "neutral";

  return {
    poc: Number(pocBin.price.toFixed(2)),
    valueAreaHigh: Number(valueAreaHigh.toFixed(2)),
    valueAreaLow: Number(valueAreaLow.toFixed(2)),
    valueAreaVolumePct: 70,
    levels,
    hvn,
    lvn,
    bias,
  };
}
