#!/usr/bin/env python3
"""
Fetch daily candle data for stocks using yfinance.
Supports Indian (.NS/.BO) and US stocks.
Merges new data with existing candle history.

Usage:
    python3 scripts/fetch_candles.py RELIANCE.NS TCS.NS AAPL
    python3 scripts/fetch_candles.py --all        # fetch watchlist from store.json
    python3 scripts/fetch_candles.py --months 6 RELIANCE.NS  # custom period
"""

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

try:
    import yfinance as yf
except ImportError:
    print("yfinance not installed. Run: pip3 install yfinance", file=sys.stderr)
    sys.exit(1)

DATA_DIR = Path("/opt/stockmafia/server/data")
STORE_FILE = DATA_DIR / "store.json"
CRAWL_DIR = DATA_DIR / "crawl"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("fetch_candles")


def load_existing_candles(symbol: str) -> list[dict]:
    """Load existing candle data from disk, return list of candle dicts."""
    path = CRAWL_DIR / f"{symbol}.json"
    if not path.exists():
        return []
    try:
        with open(path) as f:
            data = json.load(f)
        return data.get("candles", [])
    except (json.JSONDecodeError, OSError) as e:
        log.warning("Failed to load %s: %s", path, e)
        return []


def save_crawl_json(symbol: str, market: str, quote: dict, candles: list[dict]):
    """Write the full crawl JSON for a symbol, preserving existing metadata."""
    path = CRAWL_DIR / f"{symbol}.json"
    existing = {}
    if path.exists():
        try:
            with open(path) as f:
                existing = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    existing["yahoo"] = symbol
    existing["symbol"] = symbol.replace(".NS", "").replace(".BO", "")
    existing["market"] = market
    existing["crawledAt"] = int(time.time() * 1000)
    existing["candles"] = candles

    if quote:
        existing["quote"] = quote

    if "sources" not in existing:
        existing["sources"] = {}
    if "prices" not in existing["sources"]:
        existing["sources"]["prices"] = []
    if "Yahoo Finance" not in existing["sources"]["prices"]:
        existing["sources"]["prices"].append("Yahoo Finance")

    CRAWL_DIR.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(existing, f, indent=2)


def merge_candles(existing: list[dict], new: list[dict]) -> list[dict]:
    """Merge new candles into existing, deduping by timestamp."""
    by_time: dict[int, dict] = {}
    for c in existing:
        t = c.get("time", 0)
        if t:
            by_time[t] = c
    for c in new:
        t = c.get("time", 0)
        if t:
            by_time[t] = c
    merged = sorted(by_time.values(), key=lambda c: c.get("time", 0))
    return merged


def fetch_candles(symbol: str, months: int = 3) -> tuple[Optional[dict], list[dict]]:
    """Fetch quote + candles from Yahoo Finance. Returns (quote, candles)."""
    log.info("Fetching %s (%d months)...", symbol, months)
    try:
        ticker = yf.Ticker(symbol)
        end = datetime.now()
        start = end - timedelta(days=months * 30 + 5)

        df = ticker.history(start=start.strftime("%Y-%m-%d"), end=end.strftime("%Y-%m-%d"), auto_adjust=True)
        if df.empty:
            log.warning("No candle data for %s", symbol)
            return None, []

        candles = []
        for idx, row in df.iterrows():
            ts = int(idx.timestamp() * 1000)
            candles.append({
                "time": ts,
                "open": round(float(row["Open"]), 4),
                "high": round(float(row["High"]), 4),
                "low": round(float(row["Low"]), 4),
                "close": round(float(row["Close"]), 4),
                "volume": int(row["Volume"]),
            })

        # Fetch quote info
        info = ticker.info or {}
        price = info.get("currentPrice") or info.get("regularMarketPrice") or (candles[-1]["close"] if candles else 0)
        prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose") or price
        change = round(price - prev_close, 4) if price and prev_close else 0
        change_pct = round((change / prev_close) * 100, 4) if prev_close else 0

        quote = {
            "symbol": symbol,
            "yahoo": symbol,
            "price": price,
            "change": change,
            "changePct": change_pct,
            "previousClose": prev_close,
            "dayHigh": info.get("dayHigh") or info.get("regularMarketDayHigh"),
            "dayLow": info.get("dayLow") or info.get("regularMarketDayLow"),
            "volume": info.get("volume") or info.get("regularMarketVolume"),
            "marketCap": info.get("marketCap"),
            "currency": info.get("currency", "USD"),
        }

        log.info("  Got %d candles for %s", len(candles), symbol)
        return quote, candles

    except Exception as e:
        log.error("Failed to fetch %s: %s", symbol, e)
        return None, []


def detect_market(symbol: str) -> str:
    if symbol.endswith(".NS") or symbol.endswith(".BO"):
        return "IN"
    return "US"


def load_watchlist() -> list[str]:
    """Read watchlist from store.json."""
    if not STORE_FILE.exists():
        log.error("store.json not found at %s", STORE_FILE)
        return []
    with open(STORE_FILE) as f:
        data = json.load(f)
    return data.get("watchlist", [])


def process_symbol(symbol: str, months: int):
    """Fetch, merge, and save candle data for one symbol."""
    market = detect_market(symbol)
    existing = load_existing_candles(symbol)
    quote, new_candles = fetch_candles(symbol, months)

    if not new_candles and not existing:
        log.warning("No data available for %s, skipping", symbol)
        return

    merged = merge_candles(existing, new_candles)
    save_crawl_json(symbol, market, quote, merged)
    log.info("  Saved %s: %d candles (was %d, added %d)",
             symbol, len(merged), len(existing), len(merged) - len(existing))


def main():
    parser = argparse.ArgumentParser(description="Fetch candle data via yfinance")
    parser.add_argument("symbols", nargs="*", help="Stock symbols (e.g. RELIANCE.NS AAPL)")
    parser.add_argument("--all", action="store_true", help="Fetch all symbols from watchlist")
    parser.add_argument("--months", type=int, default=3, help="Months of history (default: 3)")
    args = parser.parse_args()

    CRAWL_DIR.mkdir(parents=True, exist_ok=True)

    symbols = []
    if args.all:
        symbols = load_watchlist()
        if not symbols:
            log.error("No symbols in watchlist")
            sys.exit(1)
        log.info("Loaded %d symbols from watchlist", len(symbols))
    elif args.symbols:
        symbols = args.symbols
    else:
        parser.print_help()
        sys.exit(1)

    success = 0
    failed = 0
    for sym in symbols:
        try:
            process_symbol(sym, args.months)
            success += 1
        except Exception as e:
            log.error("Error processing %s: %s", sym, e)
            failed += 1

    log.info("Done: %d succeeded, %d failed", success, failed)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
