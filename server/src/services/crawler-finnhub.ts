const token = () => process.env.FINNHUB_API_KEY || "";

export function finnhubEnabled() {
  return Boolean(token());
}

export async function fetchFinnhubQuote(symbol: string) {
  if (!finnhubEnabled()) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token()}`,
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { c?: number; d?: number; dp?: number; pc?: number; h?: number; l?: number };
    if (!j.c) return null;
    return {
      price: j.c,
      change: j.d ?? 0,
      changePct: j.dp ?? 0,
      previousClose: j.pc ?? j.c,
      dayHigh: j.h ?? null,
      dayLow: j.l ?? null,
    };
  } catch {
    return null;
  }
}

export async function fetchFinnhubMetrics(symbol: string) {
  if (!finnhubEnabled()) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${token()}`,
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { metric?: Record<string, number> };
    const m = j.metric ?? {};
    return {
      pe: m.peNormalizedAnnual ?? m.peExclExtraTTM ?? null,
      pb: m.pbAnnual ?? null,
      roe: m.roeTTM != null ? m.roeTTM / 100 : null,
      eps: m.epsNormalizedAnnual ?? null,
      beta: m.beta ?? null,
      dividendYield: m.dividendYieldIndicatedAnnual != null ? m.dividendYieldIndicatedAnnual / 100 : null,
    };
  } catch {
    return null;
  }
}

export async function fetchFinnhubNews(symbol: string) {
  if (!finnhubEnabled()) return [] as Array<{ title: string; link: string; published: string; source: string }>;
  const to = new Date();
  const from = new Date(Date.now() - 7 * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${fmt(from)}&to=${fmt(to)}&token=${token()}`,
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ headline?: string; url?: string; datetime?: number; source?: string }>;
    return (Array.isArray(rows) ? rows : []).slice(0, 8).map((r) => ({
      title: String(r.headline ?? ""),
      link: String(r.url ?? ""),
      published: r.datetime ? new Date(r.datetime * 1000).toUTCString() : "",
      source: `Finnhub/${r.source ?? "news"}`,
    }));
  } catch {
    return [];
  }
}
