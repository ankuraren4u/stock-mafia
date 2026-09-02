const YAHOO_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

const quoteCache = new Map<string, { at: number; data: Quote }>();
const chartCache = new Map<string, { at: number; data: ChartPayload }>();
const QUOTE_TTL_MS = 45_000;
const STALE_QUOTE_MS = 6 * 60 * 60_000;
const CHART_TTL_MS = 10 * 60_000;

let crumb: string | null = null;
let cookieHeader = "";
let sessionAt = 0;
let yahooPauseUntil = 0;

const lanes: Record<"ui" | "bg", Promise<void>> = {
  ui: Promise.resolve(),
  bg: Promise.resolve(),
};

export type YahooLane = "ui" | "bg";

export interface Quote {
  symbol: string;
  yahoo: string;
  price: number;
  change: number;
  changePct: number;
  previousClose: number;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  marketCap: number | null;
  currency: string;
}

export interface ChartPayload {
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  meta: Record<string, unknown>;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function enqueue<T>(fn: () => Promise<T>, lane: YahooLane = "ui"): Promise<T> {
  const run = lanes[lane].then(fn, fn);
  lanes[lane] = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function yahooPaused() {
  return Date.now() < yahooPauseUntil;
}

function tripYahoo(ms = 180_000) {
  yahooPauseUntil = Math.max(yahooPauseUntil, Date.now() + ms);
  crumb = null;
}

export function rememberQuote(data: Quote) {
  quoteCache.set(data.yahoo, { at: Date.now(), data });
}

export function peekQuote(yahooSymbol: string, allowStale = false): Quote | null {
  const cached = quoteCache.get(yahooSymbol);
  if (!cached) return null;
  const age = Date.now() - cached.at;
  if (age < QUOTE_TTL_MS || (allowStale && age < STALE_QUOTE_MS)) return cached.data;
  return null;
}

async function fetchTimed(url: string, headers: Record<string, string>, ms: number) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { headers, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function refreshSession() {
  crumb = null;
  cookieHeader = "";
  const boot = await fetch("https://fc.yahoo.com", {
    redirect: "manual",
    headers: YAHOO_HEADERS,
  });
  const parts = typeof boot.headers.getSetCookie === "function" ? boot.headers.getSetCookie() : [];
  cookieHeader = parts.map((c) => c.split(";")[0]).join("; ");
  const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { ...YAHOO_HEADERS, Cookie: cookieHeader },
  });
  const text = (await crumbRes.text()).trim();
  if (!crumbRes.ok || !text || text.length > 80) {
    throw new Error("Could not obtain Yahoo crumb");
  }
  crumb = text;
  sessionAt = Date.now();
}

async function yahooGet(url: string, lane: YahooLane = "ui"): Promise<unknown> {
  if (yahooPaused() && lane === "ui") {
    throw new Error("Yahoo cooling down");
  }
  return enqueue(async () => {
    if (yahooPaused()) throw new Error("Yahoo cooling down");
    let lastStatus = 0;
    const attempts = lane === "ui" ? 2 : 3;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (!crumb || Date.now() - sessionAt > 45 * 60_000) {
        try {
          await refreshSession();
        } catch {
          /* continue without crumb */
        }
      }
      const sep = url.includes("?") ? "&" : "?";
      const withCrumb = crumb ? `${url}${sep}crumb=${encodeURIComponent(crumb)}` : url;
      const hosts = [withCrumb];
      if (withCrumb.includes("query1.finance.yahoo.com")) {
        hosts.push(withCrumb.replace("query1.finance.yahoo.com", "query2.finance.yahoo.com"));
      }
      for (const target of hosts) {
        try {
          const res = await fetchTimed(target, { ...YAHOO_HEADERS, Cookie: cookieHeader }, lane === "ui" ? 7000 : 12000);
          lastStatus = res.status;
          if (res.status === 429 || res.status === 401) {
            tripYahoo(res.status === 429 ? 240_000 : 60_000);
            throw new Error(`Yahoo request failed ${res.status} for ${url}`);
          }
          if (!res.ok) continue;
          return res.json();
        } catch (err) {
          if (yahooPaused()) throw err;
          lastStatus = lastStatus || 0;
        }
      }
      await sleep(lane === "ui" ? 400 : 1200 * 2 ** attempt);
    }
    throw new Error(`Yahoo request failed ${lastStatus || 429} for ${url}`);
  }, lane);
}

function chartKey(yahooSymbol: string, range: string, interval: string) {
  return `${yahooSymbol}|${range}|${interval}`;
}

export async function fetchChart(
  yahooSymbol: string,
  range = "6mo",
  interval = "1d",
  lane: YahooLane = "ui",
): Promise<ChartPayload> {
  const key = chartKey(yahooSymbol, range, interval);
  const cached = chartCache.get(key);
  if (cached && Date.now() - cached.at < CHART_TTL_MS) return cached.data;
  if (yahooPaused() && cached) return cached.data;
  if (yahooPaused()) throw new Error("Yahoo cooling down");

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      yahooSymbol,
    )}?range=${range}&interval=${interval}&includePrePost=false`;
    const json = (await yahooGet(url, lane)) as {
      chart?: { result?: Array<Record<string, unknown>> };
    };
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error(`No chart data for ${yahooSymbol}`);
    const timestamps = (result.timestamp as number[] | undefined) ?? [];
    const quote = ((result.indicators as { quote?: Array<Record<string, number[]>> })?.quote?.[0]) ?? {};
    const candles = timestamps
      .map((t, i) => ({
        time: t * 1000,
        open: quote.open?.[i],
        high: quote.high?.[i],
        low: quote.low?.[i],
        close: quote.close?.[i],
        volume: quote.volume?.[i],
      }))
      .filter((c) => [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v))) as ChartPayload["candles"];
    const data: ChartPayload = { candles, meta: (result.meta as Record<string, unknown>) ?? {} };
    chartCache.set(key, { at: Date.now(), data });
    return data;
  } catch (err) {
    if (cached) return cached.data;
    throw err;
  }
}

function quoteFromMeta(yahooSymbol: string, meta: Record<string, unknown>, candles: ChartPayload["candles"]): Quote {
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const price = Number(meta.regularMarketPrice ?? last?.close ?? 0);
  const previousClose = Number(meta.chartPreviousClose ?? prev?.close ?? price);
  const change = price - previousClose;
  return {
    symbol: String(meta.symbol ?? yahooSymbol),
    yahoo: yahooSymbol,
    price,
    change,
    changePct: previousClose ? (change / previousClose) * 100 : 0,
    previousClose,
    dayHigh: (meta.regularMarketDayHigh as number | undefined) ?? last?.high ?? null,
    dayLow: (meta.regularMarketDayLow as number | undefined) ?? last?.low ?? null,
    volume: (meta.regularMarketVolume as number | undefined) ?? last?.volume ?? null,
    marketCap: (meta.marketCap as number | undefined) ?? null,
    currency: String(meta.currency ?? "USD"),
  };
}

export async function fetchChartDirect(yahooSymbol: string, range = "6mo", interval = "1d"): Promise<ChartPayload> {
  const key = `direct|${yahooSymbol}|${range}|${interval}`;
  const cached = chartCache.get(key);
  if (cached && Date.now() - cached.at < CHART_TTL_MS) return cached.data;

  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol,
  )}?range=${range}&interval=${interval}&includePrePost=false`;
  try {
    const res = await fetchTimed(url, YAHOO_HEADERS, 10000);
    if (!res.ok) throw new Error(`Chart fetch failed ${res.status}`);
    const json = (await res.json()) as { chart?: { result?: Array<Record<string, unknown>> } };
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error(`No chart data for ${yahooSymbol}`);
    const timestamps = (result.timestamp as number[] | undefined) ?? [];
    const quote = ((result.indicators as { quote?: Array<Record<string, number[]>> })?.quote?.[0]) ?? {};
    const candles = timestamps
      .map((t, i) => ({
        time: t * 1000,
        open: quote.open?.[i],
        high: quote.high?.[i],
        low: quote.low?.[i],
        close: quote.close?.[i],
        volume: quote.volume?.[i],
      }))
      .filter((c) => [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v))) as ChartPayload["candles"];
    const data: ChartPayload = { candles, meta: (result.meta as Record<string, unknown>) ?? {} };
    chartCache.set(key, { at: Date.now(), data });
    return data;
  } catch (err) {
    if (cached) return cached.data;
    throw err;
  }
}

export async function fetchQuoteFromChartDirect(yahooSymbol: string): Promise<Quote | null> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol,
  )}?range=5d&interval=1d&includePrePost=false`;
  try {
    const res = await fetchTimed(url, YAHOO_HEADERS, 6000);
    if (res.status === 429) {
      tripYahoo(240_000);
      return null;
    }
    if (!res.ok) return null;
    const json = (await res.json()) as { chart?: { result?: Array<Record<string, unknown>> } };
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const timestamps = (result.timestamp as number[] | undefined) ?? [];
    const quote = ((result.indicators as { quote?: Array<Record<string, number[]>> })?.quote?.[0]) ?? {};
    const candles = timestamps
      .map((t, i) => ({
        time: t * 1000,
        open: quote.open?.[i],
        high: quote.high?.[i],
        low: quote.low?.[i],
        close: quote.close?.[i],
        volume: quote.volume?.[i],
      }))
      .filter((c) => Number.isFinite(c.close)) as ChartPayload["candles"];
    const data = quoteFromMeta(yahooSymbol, (result.meta as Record<string, unknown>) ?? {}, candles);
    if (!data.price) return null;
    rememberQuote(data);
    return data;
  } catch {
    return null;
  }
}

export async function fetchQuote(yahooSymbol: string): Promise<Quote> {
  const cached = quoteCache.get(yahooSymbol);
  if (cached && Date.now() - cached.at < QUOTE_TTL_MS) return cached.data;
  try {
    const batch = await fetchQuotes([yahooSymbol]);
    if (batch[0]) return batch[0];
  } catch {
    /* fall through */
  }
  const direct = await fetchQuoteFromChartDirect(yahooSymbol);
  if (direct) return direct;
  const { candles, meta } = await fetchChart(yahooSymbol, "5d", "1d");
  const data = quoteFromMeta(yahooSymbol, meta, candles);
  quoteCache.set(yahooSymbol, { at: Date.now(), data });
  return data;
}

export async function fetchQuotes(yahooSymbols: string[]): Promise<Quote[]> {
  const fresh: Quote[] = [];
  const missing: string[] = [];
  for (const symbol of yahooSymbols) {
    const cached = quoteCache.get(symbol);
    if (cached && Date.now() - cached.at < QUOTE_TTL_MS) fresh.push(cached.data);
    else missing.push(symbol);
  }
  if (!missing.length) return yahooSymbols.map((s) => quoteCache.get(s)!.data);
  if (yahooPaused()) {
    return yahooSymbols.map((s) => quoteCache.get(s)?.data).filter((q): q is Quote => Boolean(q));
  }

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(missing.join(","))}`;
    const json = (await yahooGet(url, "ui")) as {
      quoteResponse?: { result?: Array<Record<string, unknown>> };
    };
    const rows = json?.quoteResponse?.result ?? [];
    for (const r of rows) {
      const yahoo = String(r.symbol ?? "");
      const price = Number(r.regularMarketPrice ?? 0);
      if (!yahoo || !price) continue;
      const previousClose = Number(r.regularMarketPreviousClose ?? price);
      const change = Number(r.regularMarketChange ?? price - previousClose);
      const data: Quote = {
        symbol: yahoo,
        yahoo,
        price,
        change,
        changePct: Number(r.regularMarketChangePercent ?? 0),
        previousClose,
        dayHigh: (r.regularMarketDayHigh as number | undefined) ?? null,
        dayLow: (r.regularMarketDayLow as number | undefined) ?? null,
        volume: (r.regularMarketVolume as number | undefined) ?? null,
        marketCap: (r.marketCap as number | undefined) ?? null,
        currency: String(r.currency ?? "USD"),
      };
      rememberQuote(data);
    }
  } catch {
    /* other sources fill gaps */
  }

  return yahooSymbols
    .map((s) => quoteCache.get(s)?.data)
    .filter((q): q is Quote => Boolean(q));
}

export interface SearchHit {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  sector?: string;
  quoteType?: string;
}

export async function searchYahoo(query: string): Promise<SearchHit[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    query,
  )}&quotesCount=12&newsCount=0`;
  const json = (await yahooGet(url, "ui")) as { quotes?: SearchHit[] };
  const quotes = Array.isArray(json?.quotes) ? json.quotes : [];
  return quotes
    .map((q) => ({
      symbol: String(q.symbol ?? ""),
      shortname: q.shortname,
      longname: q.longname,
      exchDisp: q.exchDisp,
      sector: q.sector,
      quoteType: q.quoteType,
    }))
    .filter((q) => q.symbol);
}

export async function fetchProfile(yahooSymbol: string) {
  const modules = ["assetProfile", "price", "summaryProfile"].join(",");
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    yahooSymbol,
  )}?modules=${modules}`;
  try {
    const json = (await yahooGet(url, "bg")) as { quoteSummary?: { result?: Array<Record<string, unknown>> } };
    const r = json?.quoteSummary?.result?.[0] ?? {};
    const profile = (r.assetProfile ?? r.summaryProfile ?? {}) as Record<string, string>;
    const price = (r.price ?? {}) as Record<string, string>;
    return {
      name: price.longName || price.shortName || null,
      sector: profile.sector || null,
      industry: profile.industry || null,
      country: profile.country || null,
      website: profile.website || null,
      summary: profile.longBusinessSummary || null,
      currency: price.currency || null,
      exchange: price.exchangeName || price.exchange || null,
    };
  } catch {
    return {
      name: null,
      sector: null,
      industry: null,
      country: null,
      website: null,
      summary: null,
      currency: null,
      exchange: null,
    };
  }
}

export async function fetchFundamentals(yahooSymbol: string) {
  const modules = ["summaryDetail", "defaultKeyStatistics", "financialData", "earnings", "incomeStatementHistory", "balanceSheetHistory"].join(",");
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    yahooSymbol,
  )}?modules=${modules}`;
  const empty = {
    pe: null as number | null,
    forwardPe: null as number | null,
    pb: null as number | null,
    dividendYield: null as number | null,
    marketCap: null as number | null,
    beta: null as number | null,
    eps: null as number | null,
    roe: null as number | null,
    debtToEquity: null as number | null,
    profitMargins: null as number | null,
    revenueGrowth: null as number | null,
    earningsGrowth: null as number | null,
    targetMeanPrice: null as number | null,
    recommendation: null as string | null,
    week52High: null as number | null,
    week52Low: null as number | null,
    revenue: null as number | null,
    netIncome: null as number | null,
    freeCashflow: null as number | null,
    operatingMargins: null as number | null,
    grossMargins: null as number | null,
    bookValue: null as number | null,
    priceToSales: null as number | null,
    enterpriseValue: null as number | null,
    pegRatio: null as number | null,
    shortRatio: null as number | null,
    heldPercentInsiders: null as number | null,
    heldPercentInstitutions: null as number | null,
    shortPercentOfFloat: null as number | null,
    analystTargetPrice: null as number | null,
    earningsQuarterlyGrowth: null as number | null,
    revenuePerShare: null as number | null,
    forwardEps: null as number | null,
  };
  try {
    const json = (await yahooGet(url, "bg")) as { quoteSummary?: { result?: Array<Record<string, unknown>> } };
    const r = json?.quoteSummary?.result?.[0] ?? {};
    const sd = (r.summaryDetail ?? {}) as Record<string, { raw?: number }>;
    const ks = (r.defaultKeyStatistics ?? {}) as Record<string, { raw?: number }>;
    const fd = (r.financialData ?? {}) as Record<string, { raw?: number } | string>;
    const income = (r.incomeStatementHistory ?? {}) as Record<string, unknown>;
    const balance = (r.balanceSheetHistory ?? {}) as Record<string, unknown>;
    const incomeStmtArr = (income.incomeStatementHistory ?? []) as Array<Record<string, { raw?: number }>>;
    const balanceStmtArr = (balance.balanceSheetHistory ?? []) as Array<Record<string, { raw?: number }>>;
    const incomeStmt = incomeStmtArr[0] ?? {};
    const balanceStmt = balanceStmtArr[0] ?? {};
    return {
      pe: sd.trailingPE?.raw ?? ks.trailingPE?.raw ?? null,
      forwardPe: sd.forwardPE?.raw ?? ks.forwardPE?.raw ?? null,
      pb: ks.priceToBook?.raw ?? null,
      dividendYield: sd.dividendYield?.raw ?? null,
      marketCap: sd.marketCap?.raw ?? ks.marketCap?.raw ?? null,
      beta: ks.beta?.raw ?? sd.beta?.raw ?? null,
      eps: ks.trailingEps?.raw ?? null,
      roe: typeof fd.returnOnEquity === "object" ? fd.returnOnEquity.raw ?? null : null,
      debtToEquity: typeof fd.debtToEquity === "object" ? fd.debtToEquity.raw ?? null : null,
      profitMargins: typeof fd.profitMargins === "object" ? fd.profitMargins.raw ?? null : null,
      revenueGrowth: typeof fd.revenueGrowth === "object" ? fd.revenueGrowth.raw ?? null : null,
      earningsGrowth: typeof fd.earningsGrowth === "object" ? fd.earningsGrowth.raw ?? null : null,
      targetMeanPrice: typeof fd.targetMeanPrice === "object" ? fd.targetMeanPrice.raw ?? null : null,
      recommendation: typeof fd.recommendationKey === "string" ? fd.recommendationKey : null,
      week52High: sd.fiftyTwoWeekHigh?.raw ?? ks.fiftyTwoWeekHigh?.raw ?? null,
      week52Low: sd.fiftyTwoWeekLow?.raw ?? ks.fiftyTwoWeekLow?.raw ?? null,
      revenue: incomeStmt.totalRevenue?.raw ?? (typeof fd.totalRevenue === "object" ? fd.totalRevenue.raw ?? null : null),
      netIncome: incomeStmt.netIncome?.raw ?? null,
      freeCashflow: typeof fd.freeCashflow === "object" ? fd.freeCashflow.raw ?? null : null,
      operatingMargins: typeof fd.operatingMargins === "object" ? fd.operatingMargins.raw ?? null : null,
      grossMargins: typeof fd.grossMargins === "object" ? fd.grossMargins.raw ?? null : null,
      bookValue: ks.bookValue?.raw ?? null,
      priceToSales: ks.priceToSalesTrailing12Months?.raw ?? null,
      enterpriseValue: ks.enterpriseValue?.raw ?? null,
      pegRatio: ks.pegRatio?.raw ?? sd.pegRatio?.raw ?? null,
      shortRatio: ks.shortRatio?.raw ?? null,
      heldPercentInsiders: ks.heldPercentInsiders?.raw ?? null,
      heldPercentInstitutions: ks.heldPercentInstitutions?.raw ?? null,
      shortPercentOfFloat: ks.shortPercentOfFloat?.raw ?? null,
      analystTargetPrice: typeof fd.targetMeanPrice === "object" ? fd.targetMeanPrice.raw ?? null : null,
      earningsQuarterlyGrowth: typeof fd.earningsQuarterlyGrowth === "object" ? fd.earningsQuarterlyGrowth.raw ?? null : null,
      revenuePerShare: ks.revenuePerShare?.raw ?? null,
      forwardEps: ks.forwardEps?.raw ?? null,
    };
  } catch {
    return empty;
  }
}
