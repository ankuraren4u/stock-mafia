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

export function scoreText(text: string) {
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
          [googleRss(`${q} site:thehindubusinessline.com`, "IN"), "Hindu BusinessLine"],
          [googleRss(`${q} site:capitalmarket.com`, "IN"), "CapitalMarket"],
          [googleRss(`${q} site:trendlyne.com`, "IN"), "Trendlyne"],
          [googleRss(`${q} site:screener.in`, "IN"), "Screener.in"],
          [googleRss(`${q} site:tickertape.in`, "IN"), "Tickertape"],
          [googleRss(`${q} site:valueresearchonline.com`, "IN"), "Value Research"],
          [googleRss(`${q} site:forbesindia.com`, "IN"), "Forbes India"],
          [googleRss(`${q} site:business_today.in`, "IN"), "Business Today"],
          [googleRss(`${q} site:outlookmoney.com`, "IN"), "Outlook Money"],
          [googleRss(`${q} site:djai.com OR site:dalalstreet.in`, "IN"), "Dalal Street"],
          [googleRss(`${q} site:moneylife.in`, "IN"), "MoneyLife"],
          [googleRss(`${q} site:bseindia.com`, "IN"), "BSE India"],
          [googleRss(`${q} site:nseindia.com`, "IN"), "NSE India"],
          [googleRss(`${q} site:sebi.gov.in`, "IN"), "SEBI"],
          [googleRss(`${q} site:rbi.org.in`, "IN"), "RBI"],
          [googleRss(`${q} site:iifl.com`, "IN"), "IIFL Markets"],
          [googleRss(`${q} site:angelbroking.com`, "IN"), "Angel Broking"],
          [googleRss(`${q} site:sharekhan.com`, "IN"), "Sharekhan"],
          [googleRss(`${q} site:motilaloswal.com`, "IN"), "Motilal Oswal"],
          [googleRss(`${q} site:kotaksecurities.com`, "IN"), "Kotak Securities"],
          [googleRss(`${q} site:icicidirect.com`, "IN"), "ICICI Direct"],
          [googleRss(`${q} site:hdfcsec.com`, "IN"), "HDFC Securities"],
          [googleRss(`${q} site:axisdirect.in`, "IN"), "Axis Direct"],
          [googleRss(`${q} site:sbigeneral.com OR site:sbi.co.in/investments`, "IN"), "SBI Securities"],
          [googleRss(`${q} site:forbes.com`, "IN"), "Forbes"],
          [googleRss(`${q} site:fortune.com`, "IN"), "Fortune India"],
          [googleRss(`${q} site:inc42.com`, "IN"), "Inc42"],
          [googleRss(`${q} site:yourstory.com`, "IN"), "YourStory"],
          [googleRss(`${q} site:techcrunch.com India`, "IN"), "TechCrunch India"],
          [googleRss(`${q} site:factordaily.com`, "IN"), "FactorDaily"],
          [googleRss(`${q} site:medianama.com`, "IN"), "Medianama"],
          ["https://www.moneycontrol.com/rss/latestnews.xml", "Moneycontrol Wire"],
          ["https://www.livemint.com/rss/markets", "Livemint Markets"],
          ["https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms", "ET Markets"],
          ["https://feeds.feedburner.com/ndtvnews-latest", "NDTV News"],
          ["https://news.google.com/rss/search?q=indian+stock+market+today&hl=en-IN&gl=IN&ceid=IN:en", "IN Market Today"],
          ["https://news.google.com/rss/search?q=nifty+sensex+trading&hl=en-IN&gl=IN&ceid=IN:en", "Nifty Sensex"],
        ]
      : [
          [googleRss(`${q} ${input.yahoo} stock`, "US"), "Google News US"],
          [`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(input.yahoo)}&region=US&lang=en-US`, "Yahoo Finance"],
          [googleRss(`${q} ${input.yahoo} site:cnbc.com`, "US"), "CNBC"],
          [googleRss(`${q} ${input.yahoo} site:reuters.com`, "US"), "Reuters"],
          [googleRss(`${q} ${input.yahoo} site:marketwatch.com`, "US"), "MarketWatch"],
          [googleRss(`${q} ${input.yahoo} site:bloomberg.com`, "US"), "Bloomberg"],
          [googleRss(`${q} ${input.yahoo} site:wsj.com`, "US"), "WSJ"],
          [googleRss(`${q} ${input.yahoo} site:seekingalpha.com`, "US"), "Seeking Alpha"],
          [googleRss(`${q} ${input.yahoo} site:fool.com`, "US"), "Motley Fool"],
          [googleRss(`${q} ${input.yahoo} site:investorplace.com`, "US"), "InvestorPlace"],
          [googleRss(`${q} ${input.yahoo} site:benzinga.com`, "US"), "Benzinga"],
          [googleRss(`${q} ${input.yahoo} site:thestreet.com`, "US"), "The Street"],
          [googleRss(`${q} ${input.yahoo} site:barrons.com`, "US"), "Barron's"],
          [googleRss(`${q} ${input.yahoo} site:kiplinger.com`, "US"), "Kiplinger"],
          [googleRss(`${q} ${input.yahoo} site:finance.yahoo.com`, "US"), "Yahoo Finance Detail"],
          [googleRss(`${q} ${input.yahoo} site:businessinsider.com`, "US"), "Business Insider"],
          [googleRss(`${q} ${input.yahoo} site:fortune.com`, "US"), "Fortune"],
          [googleRss(`${q} ${input.yahoo} site:forbes.com`, "US"), "Forbes"],
          [googleRss(`${q} ${input.yahoo} site:fastcompany.com`, "US"), "Fast Company"],
          [googleRss(`${q} ${input.yahoo} site:techcrunch.com`, "US"), "TechCrunch"],
          [googleRss(`${q} ${input.yahoo} site:wired.com`, "US"), "Wired"],
          [googleRss(`${q} ${input.yahoo} site:theverge.com`, "US"), "The Verge"],
          [googleRss(`${q} ${input.yahoo} site:arstechnica.com`, "US"), "Ars Technica"],
          [googleRss(`${q} ${input.yahoo} site:venturebeat.com`, "US"), "VentureBeat"],
          [googleRss(`${q} ${input.yahoo} site:investopedia.com`, "US"), "Investopedia"],
          [googleRss(`${q} ${input.yahoo} site:fool.com/investing`, "US"), "Motley Fool Investing"],
          [googleRss(`${q} ${input.yahoo} site:zerohedge.com`, "US"), "ZeroHedge"],
          [googleRss(`${q} ${input.yahoo} site:247wallst.com`, "US"), "24/7 Wall St"],
          [googleRss(`${q} ${input.yahoo} site:thestreet.com/markets`, "US"), "The Street Markets"],
          [googleRss(`${q} ${input.yahoo} site:marketbeat.com`, "US"), "MarketBeat"],
          [googleRss(`${q} ${input.yahoo} site:tipranks.com`, "US"), "TipRanks"],
          [googleRss(`${q} ${input.yahoo} site:simplywall.st`, "US"), "Simply Wall St"],
          [googleRss(`${q} ${input.yahoo} site:macroaxis.com`, "US"), "Macroaxis"],
          [googleRss(`${q} ${input.yahoo} site:wisesheets.io`, "US"), "Wisesheets"],
          [googleRss(`${q} ${input.yahoo} site:alphaquery.com`, "US"), "AlphaQuery"],
          [googleRss(`${q} ${input.yahoo} site:stockanalysis.com`, "US"), "Stock Analysis"],
          [googleRss(`${q} ${input.yahoo} site:gurufocus.com`, "US"), "GuruFocus"],
          [googleRss(`${q} ${input.yahoo} site:finviz.com`, "US"), "Finviz"],
          [googleRss(`${q} ${input.yahoo} site:tradingview.com`, "US"), "TradingView"],
          [googleRss(`${q} ${input.yahoo} site:pyinvesting.com`, "US"), "PyInvesting"],
          ["https://feeds.marketwatch.com/marketwatch/topstories/", "MarketWatch Top"],
          ["https://feeds.marketwatch.com/marketwatch/marketpulse/", "MarketWatch Pulse"],
          ["https://www.cnbc.com/id/100003114/device/rss/rss.html", "CNBC Markets"],
          ["https://www.cnbc.com/id/10001147/device/rss/rss.html", "CNBC Finance"],
          ["https://feeds.bloomberg.com/markets/news.rss", "Bloomberg Markets"],
          ["https://feeds.reuters.com/reuters/businessNews", "Reuters Business"],
          ["https://feeds.reuters.com/reuters/topNews", "Reuters Top"],
          ["https://news.google.com/rss/search?q=stock+market+today&hl=en-US&gl=US&ceid=US:en", "US Market Today"],
          ["https://news.google.com/rss/search?q=S%26P+500+Nasdaq+trading&hl=en-US&gl=US&ceid=US:en", "S&P Nasdaq"],
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
  return { items: merged.slice(0, 24), sources: used };
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
