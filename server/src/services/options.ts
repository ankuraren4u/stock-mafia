export interface OptionContract {
  symbol: string;
  strike: number;
  expiry: string;
  type: "CE" | "PE";
  ltp: number;
  change: number;
  changePct: number;
  volume: number;
  oi: number;
  iv: number;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
}

export interface OptionChainData {
  underlying: string;
  underlyingPrice: number;
  expiry: string;
  expiryDates: string[];
  calls: OptionContract[];
  puts: OptionContract[];
  putCallRatio: number;
  maxPain: number;
  support: number[];
  resistance: number[];
}

export async function fetchOptionChain(yahooSymbol: string): Promise<OptionChainData | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(yahooSymbol)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const json = await res.json() as { optionChain?: { result?: Array<Record<string, unknown>> } };
    const result = json?.optionChain?.result?.[0];
    if (!result) return null;

    const quote = (result.quote ?? {}) as Record<string, unknown>;
    const underlyingPrice = Number(quote.regularMarketPrice ?? 0);
    const expiryDates = (result.expirationDates as number[] ?? []).map((ts) => new Date(ts * 1000).toISOString().slice(0, 10));
    const options = (result.options as Array<Record<string, unknown>>)?.[0];
    if (!options) return null;

    const rawCalls = (options.calls ?? []) as Array<Record<string, unknown>>;
    const rawPuts = (options.puts ?? []) as Array<Record<string, unknown>>;

    function mapContract(c: Record<string, unknown>, type: "CE" | "PE"): OptionContract {
      return {
        symbol: String(c.symbol ?? yahooSymbol),
        strike: Number(c.strike ?? 0),
        expiry: String(c.expiration ?? expiryDates[0] ?? ""),
        type,
        ltp: Number(c.lastPrice ?? 0),
        change: Number(c.change ?? 0),
        changePct: Number(c.percentChange ?? 0),
        volume: Number(c.volume ?? 0),
        oi: Number(c.openInterest ?? 0),
        iv: Number(c.impliedVolatility ?? 0),
        delta: null,
        gamma: null,
        theta: null,
        vega: null,
      };
    }

    const calls = rawCalls.map((c) => mapContract(c, "CE"));
    const puts = rawPuts.map((p) => mapContract(p, "PE"));

    const totalPutOI = puts.reduce((a, c) => a + c.oi, 0);
    const totalCallOI = calls.reduce((a, c) => a + c.oi, 0);
    const putCallRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;

    let maxPain = underlyingPrice;
    let minPain = Infinity;
    const allStrikes = [...new Set([...calls.map((c) => c.strike), ...puts.map((p) => p.strike)])].sort((a, b) => a - b);
    for (const strike of allStrikes) {
      let pain = 0;
      for (const c of calls) if (strike > c.strike) pain += (strike - c.strike) * c.oi;
      for (const p of puts) if (strike < p.strike) pain += (p.strike - strike) * p.oi;
      if (pain < minPain) { minPain = pain; maxPain = strike; }
    }

    const support = allStrikes.filter((s) => s < underlyingPrice).slice(-3).reverse();
    const resistance = allStrikes.filter((s) => s > underlyingPrice).slice(0, 3);

    return {
      underlying: yahooSymbol,
      underlyingPrice,
      expiry: expiryDates[0] ?? "",
      expiryDates,
      calls,
      puts,
      putCallRatio: Number(putCallRatio.toFixed(3)),
      maxPain,
      support,
      resistance,
    };
  } catch {
    return null;
  }
}
