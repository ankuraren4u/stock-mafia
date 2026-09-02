export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function sma(values: number[], period: number): Array<number | null> {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    const slice = values.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

export function ema(values: number[], period: number): Array<number | null> {
  const k = 2 / (period + 1);
  const out: Array<number | null> = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
      prev = seed;
      out.push(seed);
      continue;
    }
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function rsi(values: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = [];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (i === 0) {
      out.push(null);
      continue;
    }
    const change = values[i] - values[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i < period) {
      avgGain += gain;
      avgLoss += loss;
      out.push(null);
      continue;
    }
    if (i === period) {
      avgGain = (avgGain + gain) / period;
      avgLoss = (avgLoss + loss) / period;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    if (avgLoss === 0) {
      out.push(100);
      continue;
    }
    const rs = avgGain / avgLoss;
    out.push(100 - 100 / (1 + rs));
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((_, i) => {
    const f = emaFast[i];
    const s = emaSlow[i];
    if (f == null || s == null) return null;
    return f - s;
  });
  const macdNumeric = macdLine.map((v) => v ?? 0);
  const signalLineRaw = ema(
    macdNumeric.slice(slow - 1),
    signal,
  );
  const signalLine: Array<number | null> = macdLine.map(() => null);
  for (let i = 0; i < signalLineRaw.length; i += 1) {
    signalLine[i + slow - 1] = signalLineRaw[i];
  }
  const histogram = macdLine.map((v, i) => {
    const sig = signalLine[i];
    if (v == null || sig == null) return null;
    return v - sig;
  });
  return { macdLine, signalLine, histogram };
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper: Array<number | null> = [];
  const lower: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (mid[i] == null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const slice = values.slice(i - period + 1, i + 1);
    const mean = mid[i] as number;
    const variance = slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper.push(mean + mult * sd);
    lower.push(mean - mult * sd);
  }
  return { mid, upper, lower };
}

export function atr(candles: Candle[], period = 14): Array<number | null> {
  const out: Array<number | null> = [];
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i];
    const prevClose = i === 0 ? c.close : candles[i - 1].close;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    trs.push(tr);
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    if (i === period - 1) {
      out.push(trs.slice(0, period).reduce((a, b) => a + b, 0) / period);
      continue;
    }
    const prev = out[i - 1] as number;
    out.push((prev * (period - 1) + tr) / period);
  }
  return out;
}

export function lastNumber(series: Array<number | null>): number | null {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const v = series[i];
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

export function vwap(candles: Candle[]): Array<number | null> {
  const out: Array<number | null> = [];
  let cumVolPrice = 0;
  let cumVol = 0;
  let prevDay = -1;
  for (const c of candles) {
    const d = new Date(c.time).getDate();
    if (d !== prevDay) {
      cumVolPrice = 0;
      cumVol = 0;
      prevDay = d;
    }
    const tp = (c.high + c.low + c.close) / 3;
    cumVolPrice += tp * (c.volume || 1);
    cumVol += c.volume || 1;
    out.push(cumVol > 0 ? cumVolPrice / cumVol : null);
  }
  return out;
}

export function adx(candles: Candle[], period = 14): { adx: Array<number | null>; plusDi: Array<number | null>; minusDi: Array<number | null> } {
  const len = candles.length;
  const trArr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  for (let i = 0; i < len; i++) {
    const c = candles[i];
    const prev = i > 0 ? candles[i - 1] : c;
    trArr.push(Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)));
    const upMove = c.high - prev.high;
    const downMove = prev.low - c.low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  const smoothTR: number[] = [];
  const smoothPDM: number[] = [];
  const smoothMDM: number[] = [];
  for (let i = 0; i < len; i++) {
    if (i < period) {
      smoothTR.push(i === period - 1 ? trArr.slice(0, period).reduce((a, b) => a + b, 0) : NaN);
      smoothPDM.push(i === period - 1 ? plusDM.slice(0, period).reduce((a, b) => a + b, 0) : NaN);
      smoothMDM.push(i === period - 1 ? minusDM.slice(0, period).reduce((a, b) => a + b, 0) : NaN);
      continue;
    }
    smoothTR.push(smoothTR[i - 1] - smoothTR[i - 1] / period + trArr[i]);
    smoothPDM.push(smoothPDM[i - 1] - smoothPDM[i - 1] / period + plusDM[i]);
    smoothMDM.push(smoothMDM[i - 1] - smoothMDM[i - 1] / period + minusDM[i]);
  }
  const plusDi: Array<number | null> = [];
  const minusDi: Array<number | null> = [];
  const dx: number[] = [];
  for (let i = 0; i < len; i++) {
    if (i < period || !Number.isFinite(smoothTR[i]) || smoothTR[i] === 0) {
      plusDi.push(null);
      minusDi.push(null);
      dx.push(NaN);
      continue;
    }
    const pdi = (smoothPDM[i] / smoothTR[i]) * 100;
    const mdi = (smoothMDM[i] / smoothTR[i]) * 100;
    plusDi.push(pdi);
    minusDi.push(mdi);
    dx.push(pdi + mdi === 0 ? 0 : (Math.abs(pdi - mdi) / (pdi + mdi)) * 100);
  }
  const adxOut: Array<number | null> = [];
  let adxVal: number | null = null;
  for (let i = 0; i < len; i++) {
    if (i < period * 2 - 1 || !Number.isFinite(dx[i])) {
      adxOut.push(null);
      continue;
    }
    if (adxVal === null) {
      adxVal = dx.slice(period - 1, i + 1).reduce((a, b) => a + b, 0) / period;
    } else {
      adxVal = (adxVal * (period - 1) + dx[i]) / period;
    }
    adxOut.push(adxVal);
  }
  return { adx: adxOut, plusDi, minusDi };
}

export function stochastic(candles: Candle[], kPeriod = 14, dPeriod = 3): { k: Array<number | null>; d: Array<number | null> } {
  const kOut: Array<number | null> = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) { kOut.push(null); continue; }
    const slice = candles.slice(i - kPeriod + 1, i + 1);
    const high = Math.max(...slice.map((c) => c.high));
    const low = Math.min(...slice.map((c) => c.low));
    kOut.push(high === low ? 50 : ((candles[i].close - low) / (high - low)) * 100);
  }
  const kNum = kOut.map((v) => v ?? 0);
  const dOut = sma(kNum, dPeriod);
  return { k: kOut, d: dOut };
}

export function supertrend(candles: Candle[], period = 10, multiplier = 3): Array<number | null> {
  const atrVals = atr(candles, period);
  const out: Array<number | null> = [];
  let upperBand = 0;
  let lowerBand = 0;
  let direction: 1 | -1 = 1;
  let prevUpperBand = 0;
  let prevLowerBand = 0;
  for (let i = 0; i < candles.length; i++) {
    if (i < period) { out.push(null); continue; }
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const a = atrVals[i] as number;
    let ub = hl2 + multiplier * a;
    let lb = hl2 - multiplier * a;
    if (i >= period) {
      ub = lb >= prevLowerBand || candles[i - 1].close < prevLowerBand ? ub : prevUpperBand;
      lb = ub <= prevUpperBand || candles[i - 1].close > prevUpperBand ? lb : prevLowerBand;
    }
    if (i >= period) {
      if (direction === 1) {
        if (candles[i].close <= ub) { direction = -1; lb = hl2 + multiplier * a; } else { lb = prevLowerBand; }
      } else {
        if (candles[i].close >= lb) { direction = 1; ub = hl2 - multiplier * a; } else { ub = prevUpperBand; }
      }
    }
    out.push(direction === 1 ? lb : ub);
    prevUpperBand = ub;
    prevLowerBand = lb;
  }
  return out;
}

export function ichimoku(candles: Candle[]): {
  tenkan: Array<number | null>;
  kijun: Array<number | null>;
  senkouA: Array<number | null>;
  senkouB: Array<number | null>;
  chikou: Array<number | null>;
} {
  function periodMid(candles: Candle[], period: number, offset: number): Array<number | null> {
    const out: Array<number | null> = [];
    for (let i = 0; i < candles.length; i++) {
      const j = i - offset;
      if (j < period - 1 || j < 0) { out.push(null); continue; }
      const slice = candles.slice(j - period + 1, j + 1);
      out.push((Math.max(...slice.map((c) => c.high)) + Math.min(...slice.map((c) => c.low))) / 2);
    }
    return out;
  }
  const tenkan = periodMid(candles, 9, 0);
  const kijun = periodMid(candles, 26, 0);
  const senkouA: Array<number | null> = [];
  for (let i = 0; i < candles.length; i++) {
    const t = tenkan[i];
    const k = kijun[i];
    senkouA.push(t != null && k != null ? (t + k) / 2 : null);
  }
  const senkouB = periodMid(candles, 52, 0);
  const chikou: Array<number | null> = [];
  for (let i = 0; i < candles.length; i++) {
    chikou.push(i < candles.length - 26 ? candles[i + 26]?.close ?? null : null);
  }
  return { tenkan, kijun, senkouA, senkouB, chikou };
}

export function fibonacciLevels(candles: Candle[], lookback = 120): { levels: Record<number, number | null>; high: number; low: number } | null {
  const start = Math.max(0, candles.length - lookback);
  const slice = candles.slice(start);
  if (slice.length < 10) return null;
  const high = Math.max(...slice.map((c) => c.high));
  const low = Math.min(...slice.map((c) => c.low));
  const range = high - low;
  const fibs = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const levels: Record<number, number | null> = {};
  for (const f of fibs) levels[f] = high - range * f;
  return { levels, high, low };
}

export function pivotPoints(high: number, low: number, close: number) {
  const pp = (high + low + close) / 3;
  return {
    pp,
    r1: 2 * pp - low,
    r2: pp + (high - low),
    r3: high + 2 * (pp - low),
    s1: 2 * pp - high,
    s2: pp - (high - low),
    s3: low - 2 * (high - pp),
  };
}

export function obv(candles: Candle[]): Array<number | null> {
  const out: Array<number | null> = [null];
  let val = 0;
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) val += candles[i].volume || 0;
    else if (candles[i].close < candles[i - 1].close) val -= candles[i].volume || 0;
    out.push(val);
  }
  return out;
}

export function mfi(candles: Candle[], period = 14): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period) { out.push(null); continue; }
    let posMF = 0;
    let negMF = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const tp = (candles[j].high + candles[j].low + candles[j].close) / 3;
      const prevTP = (candles[j - 1].high + candles[j - 1].low + candles[j - 1].close) / 3;
      const mf = tp * (candles[j].volume || 1);
      if (tp > prevTP) posMF += mf;
      else negMF += mf;
    }
    const ratio = negMF === 0 ? 100 : posMF / negMF;
    out.push(100 - 100 / (1 + ratio));
  }
  return out;
}

export function wma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = [];
  const weightSum = (period * (period + 1)) / 2;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    let sum = 0;
    for (let j = 0; j < period; j++) sum += values[i - period + 1 + j] * (j + 1);
    out.push(sum / weightSum);
  }
  return out;
}
