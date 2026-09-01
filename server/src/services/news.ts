import { XMLParser } from "fast-xml-parser";
import type { Market } from "../lib/universe.js";

const parser = new XMLParser({ ignoreAttributes: false, ignoreDeclaration: true });

const POSITIVE = [
  "surge", "rally", "profit", "beat", "upgrade", "growth", "record", "bullish",
  "buy", "strong", "outperform", "expansion", "raises", "all-time high", "wins",
];
const NEGATIVE = [
  "fall", "drop", "loss", "miss", "downgrade", "weak", "bearish", "sell", "fraud",
  "probe", "decline", "crash", "warning", "layoff", "lawsuit", "cut",
];

export interface NewsItem {
  title: string;
  link: string;
  published: string;
  source: string;
  sentiment: number;
  label: "positive" | "negative" | "neutral";
}

function scoreText(text: string) {
  const t = text.toLowerCase();
  let score = 0;
  for (const w of POSITIVE) if (t.includes(w)) score += 1;
  for (const w of NEGATIVE) if (t.includes(w)) score -= 1;
  const clamped = Math.max(-1, Math.min(1, score / 3));
  const label: NewsItem["label"] =
    clamped > 0.15 ? "positive" : clamped < -0.15 ? "negative" : "neutral";
  return { sentiment: Number(clamped.toFixed(3)), label };
}

function itemsFromParsed(parsed: Record<string, unknown>, fallbackSource: string): NewsItem[] {
  const rss = parsed.rss as { channel?: { item?: unknown } } | undefined;
  const feed = parsed.feed as { entry?: unknown } | undefined;
  const raw = rss?.channel?.item ?? feed?.entry ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.slice(0, 10).map((item: Record<string, unknown>) => {
    const title = String(item.title ?? (item as { title?: { "#text"?: string } }).title?.["#text"] ?? "");
    const linkVal = item.link;
    const link =
      typeof linkVal === "string"
        ? linkVal
        : String((linkVal as { "@_href"?: string; "#text"?: string } | undefined)?.["@_href"]
          ?? (linkVal as { "#text"?: string } | undefined)?.["#text"]
          ?? "");
    const published = String(item.pubDate ?? item.published ?? item.updated ?? "");
    const sourceNode = item.source as { "#text"?: string } | string | undefined;
    const source =
      typeof sourceNode === "string" ? sourceNode : sourceNode?.["#text"] ?? fallbackSource;
    return { title, link, published, source, ...scoreText(title) };
  }).filter((n) => n.title);
}

async function fetchRss(url: string, source: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "StockMafia-Crawler/1.0 (+self-hosted)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) return [];
    return itemsFromParsed(parser.parse(await res.text()) as Record<string, unknown>, source);
  } catch {
    return [];
  }
}

function googleRss(q: string, market: Market) {
  if (market === "IN") {
    return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
  }
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}

export async function crawlNews(input: {
  query: string;
  yahoo: string;
  symbol: string;
  market: Market;
}): Promise<{ items: NewsItem[]; sources: string[] }> {
  const q = input.query;
  const feeds =
    input.market === "IN"
      ? [
          [googleRss(`${q} ${input.symbol} NSE stock`, "IN"), "Google News IN"],
          [`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(input.yahoo)}&region=IN&lang=en-US`, "Yahoo Finance"],
          [googleRss(`${q} site:economictimes.indiatimes.com`, "IN"), "Economic Times"],
          [googleRss(`${q} site:moneycontrol.com`, "IN"), "Moneycontrol"],
          [googleRss(`${q} site:livemint.com`, "IN"), "Livemint"],
          [googleRss(`${q} site:business-standard.com`, "IN"), "Business Standard"],
          ["https://www.moneycontrol.com/rss/latestnews.xml", "Moneycontrol Wire"],
          ["https://www.livemint.com/rss/markets", "Livemint Markets"],
        ]
      : [
          [googleRss(`${q} ${input.yahoo} stock`, "US"), "Google News US"],
          [`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(input.yahoo)}&region=US&lang=en-US`, "Yahoo Finance"],
          [googleRss(`${q} ${input.yahoo} site:cnbc.com`, "US"), "CNBC"],
          [googleRss(`${q} ${input.yahoo} site:reuters.com`, "US"), "Reuters"],
          [googleRss(`${q} ${input.yahoo} site:marketwatch.com`, "US"), "MarketWatch"],
          [googleRss(`${q} ${input.yahoo} site:bloomberg.com`, "US"), "Bloomberg"],
          ["https://feeds.marketwatch.com/marketwatch/topstories/", "MarketWatch Top"],
        ];

  const batches = await Promise.all(
    feeds.map(async ([url, source]) => ({ source, items: await fetchRss(url, source) })),
  );
  const used: string[] = [];
  const seen = new Set<string>();
  const merged: NewsItem[] = [];
  for (const batch of batches) {
    let hit = false;
    for (const item of batch.items) {
      const key = item.title.toLowerCase().slice(0, 90);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...item, source: item.source || batch.source });
      hit = true;
    }
    if (hit) used.push(batch.source);
  }
  return { items: merged.slice(0, 18), sources: used };
}

export async function fetchNews(input: {
  query: string;
  yahoo: string;
  market: Market;
}): Promise<NewsItem[]> {
  const { items } = await crawlNews({ ...input, symbol: input.yahoo });
  return items;
}

export function averageSentiment(items: NewsItem[]) {
  if (!items.length) return 0;
  return items.reduce((a, b) => a + b.sentiment, 0) / items.length;
}
