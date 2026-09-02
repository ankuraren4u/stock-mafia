#!/usr/bin/env python3
"""
Cron job: fetch candle data for all watched stocks every 30 minutes.
Reads watchlist from /opt/stockmafia/server/data/store.json.

Crontab entry (every 30 min):
    */30 * * * * /usr/bin/python3 /path/to/scripts/fetch_cron.py >> /var/log/stockmafia-cron.log 2>&1
"""

import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import yfinance as yf
except ImportError:
    print("yfinance not installed. Run: pip3 install yfinance", file=sys.stderr)
    sys.exit(1)

DATA_DIR = Path("/opt/stockmafia/server/data")
STORE_FILE = DATA_DIR / "store.json"
CRAWL_DIR = DATA_DIR / "crawl"
LOG_FILE = Path("/var/log/stockmafia-cron.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("fetch_cron")


def load_watchlist() -> list[str]:
    if not STORE_FILE.exists():
        log.error("store.json not found at %s", STORE_FILE)
        return []
    try:
        with open(STORE_FILE) as f:
            data = json.load(f)
        return data.get("watchlist", [])
    except (json.JSONDecodeError, OSError) as e:
        log.error("Failed to read store.json: %s", e)
        return []


def load_existing_candles(symbol: str) -> list[dict]:
    path = CRAWL_DIR / f"{symbol}.json"
    if not path.exists():
        return []
    try:
        with open(path) as f:
            data = json.load(f)
        return data.get("candles", [])
    except (json.JSONDecodeError, OSError):
        return []


def merge_candles(existing: list[dict], new: list[dict]) -> list[dict]:
    by_time: dict[int, dict] = {}
    for c in existing:
        t = c.get("time", 0)
        if t:
            by_time[t] = c
    for c in new:
        t = c.get("time", 0)
        if t:
            by_time[t] = c
    return sorted(by_time.values(), key=lambda c: c.get("time", 0))


def fetch_and_save(symbol: str):
    """Fetch 3 months of candles, merge with existing, save."""
    market = "IN" if symbol.endswith(".NS") or symbol.endswith(".BO") else "US"
    existing = load_existing_candles(symbol)

    ticker = yf.Ticker(symbol)
    end = datetime.now()
    start = end - __import__("datetime").timedelta(days=95)

    df = ticker.history(start=start.strftime("%Y-%m-%d"), end=end.strftime("%Y-%m-%d"), auto_adjust=True)
    if df.empty:
        log.warning("No data for %s", symbol)
        return

    new_candles = []
    for idx, row in df.iterrows():
        ts = int(idx.timestamp() * 1000)
        new_candles.append({
            "time": ts,
            "open": round(float(row["Open"]), 4),
            "high": round(float(row["High"]), 4),
            "low": round(float(row["Low"]), 4),
            "close": round(float(row["Close"]), 4),
            "volume": int(row["Volume"]),
        })

    merged = merge_candles(existing, new_candles)

    info = ticker.info or {}
    price = info.get("currentPrice") or info.get("regularMarketPrice") or (merged[-1]["close"] if merged else 0)
    prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose") or price
    change = round(price - prev_close, 4) if price and prev_close else 0
    change_pct = round((change / prev_close) * 100, 4) if prev_close else 0

    # Load existing file to preserve metadata
    path = CRAWL_DIR / f"{symbol}.json"
    existing_data = {}
    if path.exists():
        try:
            with open(path) as f:
                existing_data = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    existing_data["yahoo"] = symbol
    existing_data["symbol"] = symbol.replace(".NS", "").replace(".BO", "")
    existing_data["market"] = market
    existing_data["crawledAt"] = int(time.time() * 1000)
    existing_data["candles"] = merged
    existing_data["quote"] = {
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

    if "sources" not in existing_data:
        existing_data["sources"] = {}
    if "prices" not in existing_data["sources"]:
        existing_data["sources"]["prices"] = []
    if "Yahoo Finance" not in existing_data["sources"]["prices"]:
        existing_data["sources"]["prices"].append("Yahoo Finance")

    CRAWL_DIR.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(existing_data, f, indent=2)

    added = len(merged) - len(existing)
    log.info("  %s: %d candles (+%d new)", symbol, len(merged), added)


def main():
    watchlist = load_watchlist()
    if not watchlist:
        log.error("Watchlist empty or missing")
        sys.exit(1)

    log.info("Starting cron run for %d symbols", len(watchlist))
    start_time = time.time()

    success = 0
    failed = 0
    for sym in watchlist:
        try:
            fetch_and_save(sym)
            success += 1
            time.sleep(0.5)
        except Exception as e:
            log.error("Error fetching %s: %s", sym, e)
            failed += 1

    elapsed = round(time.time() - start_time, 1)
    log.info("Cron run complete: %d/%d succeeded in %ds", success, len(watchlist), elapsed)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
