import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TickerSearch from "../components/TickerSearch";
import { Banner, CallChip, EmptyState, Skeleton, Spinner } from "../components/Ui";
import { api, cls, money, pct } from "../lib/api";

interface QuoteRow {
  symbol: string;
  yahoo?: string;
  name?: string;
  sector?: string;
  market?: "IN" | "US";
  currency?: string;
  price: number;
  change: number;
  changePct: number;
  volume: number | null;
}

type MarketTab = "IN" | "US";
type CallState = "idle" | "loading" | "ok" | "error" | "empty";

export default function MarketsPage() {
  const [market, setMarket] = useState<MarketTab>("US");
  const [indices, setIndices] = useState<QuoteRow[]>([]);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [indexState, setIndexState] = useState<CallState>("loading");
  const [quoteState, setQuoteState] = useState<CallState>("loading");
  const [indexError, setIndexError] = useState("");
  const [quoteError, setQuoteError] = useState("");

  useEffect(() => {
    let live = true;
    setIndexState("loading");
    setQuoteState("loading");
    setIndices([]);
    setQuotes([]);

    async function load() {
      const idxP = api<{ quotes: QuoteRow[]; sources?: string[]; yahooPaused?: boolean }>(
        `/api/market/indices?market=${market}`,
      )
        .then((d) => {
          if (!live) return;
          setIndices(d.quotes.filter((q) => q.price != null));
          setIndexState(d.quotes.some((q) => q.price != null) ? "ok" : "empty");
          setIndexError(d.yahooPaused ? "Yahoo is cooling down; using Stooq / NSE / cache." : "");
        })
        .catch((err) => {
          if (!live) return;
          setIndexState("error");
          setIndexError(err instanceof Error ? err.message : "Indices failed");
        });

      const qP = api<{ quotes: QuoteRow[]; yahooPaused?: boolean }>(`/api/market/quotes?market=${market}`)
        .then((d) => {
          if (!live) return;
          setQuotes(d.quotes.filter((q) => q.price != null));
          setQuoteState(d.quotes.some((q) => q.price != null) ? "ok" : "empty");
          setQuoteError(d.yahooPaused ? "Yahoo is cooling down; using Stooq / Finnhub / NSE / cache." : "");
        })
        .catch((err) => {
          if (!live) return;
          setQuoteState("error");
          setQuoteError(err instanceof Error ? err.message : "Quotes failed");
        });

      await Promise.allSettled([idxP, qP]);
    }

    void load();
    const t = setInterval(() => void load(), 90000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [market]);

  const currency = market === "US" ? "USD" : "INR";

  return (
    <>
      <div className="topbar">
        <div>
          <h2>{market === "US" ? "US markets" : "Indian markets"}</h2>
          <p>Quotes, indices, and search. Watchlist data refreshes automatically in the background.</p>
        </div>
        <div className="seg">
          <button className={market === "US" ? "btn primary" : "btn"} onClick={() => setMarket("US")}>
            US
          </button>
          <button className={market === "IN" ? "btn primary" : "btn"} onClick={() => setMarket("IN")}>
            India
          </button>
        </div>
      </div>
      <TickerSearch />
      <div className="row" style={{ margin: "14px 0 4px" }}>
        <CallChip label="Indices" state={indexState} />
        <CallChip label="Universe" state={quoteState} />
      </div>
      {indexError ? <Banner kind="info">{indexError}</Banner> : null}
      {quoteError ? <Banner kind="info">{quoteError}</Banner> : null}

      <div className="index-strip">
        {indexState === "loading" && indices.length === 0
          ? [1, 2, 3, 4].map((i) => (
              <div className="index-tile" key={i}>
                <Skeleton lines={2} />
              </div>
            ))
          : null}
        {indices.map((i) => (
          <div className={cls("index-tile", i.changePct >= 0 ? "up" : "down")} key={i.symbol}>
            <div className="label">{i.symbol}</div>
            <div className="value">{money(i.price, i.currency || currency)}</div>
            <div className={cls("delta", i.changePct >= 0 ? "up" : "down")}>{pct(i.changePct)}</div>
          </div>
        ))}
      </div>
      {indexState === "empty" ? (
        <EmptyState title="No index data" body="Yahoo may be rate-limiting. Wait a minute or open Crawler." />
      ) : null}

      <div className="card sheet">
        <h3>
          {market === "US" ? "Liquid US names" : "NSE names"}
          {quoteState === "loading" ? <Spinner label="Syncing…" /> : null}
        </h3>
        {quoteState === "loading" && quotes.length === 0 ? <Skeleton lines={8} /> : null}
        {quoteState === "empty" || (quoteState === "error" && quotes.length === 0) ? (
          <EmptyState
            title="Quotes not loaded"
            body={quoteError || "The quote batch returned nothing. Search a ticker or wait for the crawler."}
          />
        ) : null}
        {quotes.length > 0 ? (
          <div className="ticker-list">
            {quotes.map((q) => (
              <Link
                key={q.yahoo || q.symbol}
                className="ticker-row"
                to={`/stock/${encodeURIComponent(q.yahoo || q.symbol)}`}
              >
                <span className="sym">{q.symbol}</span>
                <span className="name">
                  {q.name}
                  {q.sector ? ` · ${q.sector}` : ""}
                </span>
                <span className="px">{money(q.price, q.currency || currency)}</span>
                <span className={cls("chg", q.changePct >= 0 ? "up" : "down")}>{pct(q.changePct)}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
