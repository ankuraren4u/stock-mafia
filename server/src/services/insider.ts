export interface InsiderTrade {
  symbol: string;
  insiderName: string;
  title: string;
  tradeDate: string;
  filingDate: string;
  transactionType: "purchase" | "sale" | "other";
  shares: number;
  pricePerShare: number;
  totalValue: number;
  sharesOwned: number;
  isCluster: boolean;
  clusterDirection: "buying" | "selling" | "none";
  daysAgo: number;
}

export interface InsiderAnalysis {
  symbol: string;
  trades: InsiderTrade[];
  clusterSignal: "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";
  netInsiderActivity: number;
  buyVolume: number;
  sellVolume: number;
  clusterCount: number;
  recentBuys: number;
  recentSells: number;
  conviction: number;
  summary: string;
}

const SEC_HEADERS = {
  "User-Agent": "StockMafia/2.0 (contact: stockmafia@example.com)",
  Accept: "application/json",
};

async function fetchEdgarCompanyFacts(cik: string): Promise<any> {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik.padStart(10, "0")}.json`;
  const res = await fetch(url, { headers: SEC_HEADERS });
  if (!res.ok) return null;
  return res.json();
}

async function fetchEdgarFilings(cik: string, formType = "4", limit = 20): Promise<any[]> {
  const url = `https://data.sec.gov/submissions/CIK${cik.padStart(10, "0")}.json`;
  try {
    const res = await fetch(url, { headers: SEC_HEADERS });
    if (!res.ok) return [];
    const data = await res.json();
    const recent = data.filings?.recent;
    if (!recent) return [];
    const forms: any[] = [];
    for (let i = 0; i < Math.min(recent.form?.length ?? 0, limit * 3); i++) {
      if (recent.form[i] === formType) {
        forms.push({
          form: recent.form[i],
          filingDate: recent.filingDate?.[i] ?? "",
          accessionNumber: recent.accessionNumber?.[i] ?? "",
          primaryDocument: recent.primaryDocument?.[i] ?? "",
        });
      }
      if (forms.length >= limit) break;
    }
    return forms;
  } catch {
    return [];
  }
}

async function resolveCIK(symbol: string): Promise<string | null> {
  try {
    const searchRes = await fetch(
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(symbol)}&type=&dateb=&owner=include&count=1`,
      { headers: SEC_HEADERS, redirect: "follow" },
    ).catch(() => null);

    if (searchRes?.ok) {
      const html = await searchRes.text();
      const match = html.match(/CIK=(\d+)/);
      if (match) return match[1];
    }

    const tickerRes = await fetch(
      `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(symbol)}%22&forms=4`,
      { headers: SEC_HEADERS },
    ).catch(() => null);

    if (tickerRes?.ok) {
      const data = await tickerRes.json().catch(() => null);
      const hits = data?.hits?.hits;
      if (hits?.length) {
        const cik = hits[0]?._source?.entity_id;
        if (cik) return String(cik);
      }
    }

    return null;
  } catch {
    return null;
  }
}

function parseForm4Trades(filing: any, symbol: string): InsiderTrade[] {
  const trades: InsiderTrade[] = [];
  try {
    const reportingOwner = filing.reportingOwner?.reportingOwnerId?.rptOwnerName ?? "Unknown";
    const reportingTitle = filing.reportingOwner?.reportingOwnerRelationship?.reporterTitle ?? "";
    const transactions = filing.nonDerivativeTransaction ?? [];

    for (const tx of Array.isArray(transactions) ? transactions : [transactions]) {
      if (!tx) continue;
      const code = tx.transactionCoding?.transactionCode ?? "";
      const shares = tx.transactionAmounts?.transactionShares?.value ?? 0;
      const price = tx.transactionAmounts?.transactionPricePerShare?.value ?? 0;
      const date = tx.transactionDate?.value ?? "";

      let type: "purchase" | "sale" | "other" = "other";
      if (code === "P" || code === "M") type = "purchase";
      else if (code === "S" || code === "A" || code === "G") type = "sale";

      const sharesOwned = tx.postTransactionAmounts?.sharesOwnedFollowingTransaction?.value ?? 0;
      const daysAgo = date ? Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24)) : 999;

      trades.push({
        symbol,
        insiderName: reportingOwner,
        title: reportingTitle,
        tradeDate: date,
        filingDate: filing.header?.filingDate ?? "",
        transactionType: type,
        shares: Number(shares),
        pricePerShare: Number(price),
        totalValue: Number(shares) * Number(price),
        sharesOwned: Number(sharesOwned),
        isCluster: false,
        clusterDirection: "none",
        daysAgo,
      });
    }
  } catch {}
  return trades;
}

function detectClusters(trades: InsiderTrade[]): InsiderTrade[] {
  const recent = trades.filter((t) => t.daysAgo <= 60);
  const byInsider = new Map<string, InsiderTrade[]>();

  for (const t of recent) {
    const key = t.insiderName;
    if (!byInsider.has(key)) byInsider.set(key, []);
    byInsider.get(key)!.push(t);
  }

  for (const [, insiderTrades] of byInsider) {
    if (insiderTrades.length < 2) continue;
    const purchases = insiderTrades.filter((t) => t.transactionType === "purchase");
    const sales = insiderTrades.filter((t) => t.transactionType === "sale");

    if (purchases.length >= 2) {
      for (const t of purchases) {
        t.isCluster = true;
        t.clusterDirection = "buying";
      }
    } else if (sales.length >= 2) {
      for (const t of sales) {
        t.isCluster = true;
        t.clusterDirection = "selling";
      }
    }
  }

  return trades;
}

export async function fetchInsiderActivity(symbol: string): Promise<InsiderAnalysis> {
  const trades: InsiderTrade[] = [];

  try {
    const cik = await resolveCIK(symbol);
    if (!cik) {
      return {
        symbol,
        trades: [],
        clusterSignal: "neutral",
        netInsiderActivity: 0,
        buyVolume: 0,
        sellVolume: 0,
        clusterCount: 0,
        recentBuys: 0,
        recentSells: 0,
        conviction: 50,
        summary: `No SEC filings found for ${symbol} — CIK lookup returned no results`,
      };
    }

    const forms = await fetchEdgarFilings(cik, "4", 30);
    for (const form of forms.slice(0, 15)) {
      try {
        const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${form.accessionNumber.replace(/-/g, "")}/${form.primaryDocument}`;
        const res = await fetch(filingUrl, { headers: SEC_HEADERS });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data) trades.push(...parseForm4Trades(data, symbol));
        }
      } catch {}
    }
  } catch {}

  const enriched = detectClusters(trades);
  const buyVolume = enriched.filter((t) => t.transactionType === "purchase").reduce((a, t) => a + t.totalValue, 0);
  const sellVolume = enriched.filter((t) => t.transactionType === "sale").reduce((a, t) => a + t.totalValue, 0);
  const recentBuys = enriched.filter((t) => t.transactionType === "purchase" && t.daysAgo <= 30).length;
  const recentSells = enriched.filter((t) => t.transactionType === "sale" && t.daysAgo <= 30).length;
  const clusterBuys = enriched.filter((t) => t.isCluster && t.clusterDirection === "buying").length;
  const clusterSells = enriched.filter((t) => t.isCluster && t.clusterDirection === "selling").length;
  const netInsiderActivity = buyVolume - sellVolume;

  let signal: InsiderAnalysis["clusterSignal"] = "neutral";
  let conviction = 50;
  if (clusterBuys >= 3 && recentBuys >= 3) { signal = "strong_buy"; conviction = 85; }
  else if (clusterBuys >= 2 || recentBuys >= 4) { signal = "buy"; conviction = 70; }
  else if (clusterSells >= 3 && recentSells >= 3) { signal = "strong_sell"; conviction = 85; }
  else if (clusterSells >= 2 || recentSells >= 4) { signal = "sell"; conviction = 70; }

  const summary = signal === "strong_buy"
    ? `Cluster insider buying detected — ${clusterBuys} clusters, ${recentBuys} recent purchases`
    : signal === "buy"
    ? `Net insider buying — ${recentBuys} purchases vs ${recentSells} sales in last 30 days`
    : signal === "strong_sell"
    ? `Cluster insider selling — ${clusterSells} clusters, ${recentSells} recent sales`
    : signal === "sell"
    ? `Net insider selling — ${recentSells} sales vs ${recentBuys} purchases in last 30 days`
    : "No significant insider activity patterns detected";

  return {
    symbol,
    trades: enriched.slice(0, 30),
    clusterSignal: signal,
    netInsiderActivity,
    buyVolume,
    sellVolume,
    clusterCount: clusterBuys + clusterSells,
    recentBuys,
    recentSells,
    conviction,
    summary,
  };
}
