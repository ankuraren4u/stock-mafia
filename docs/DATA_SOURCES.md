# StockMafia — Exhaustive Data Source Catalog

Complete list of 135+ data sources for informed stock trading decisions.

## 1. Real-Time Price Feeds (30 sources)

### Free Tier
| # | Source | API | Rate Limit | Coverage | Auth |
|---|--------|-----|-----------|----------|------|
| 1 | Yahoo Finance | query2.finance.yahoo.com | 2000 req/day | IN + US | No |
| 2 | Finnhub | finnhub.io/api/v1 | 60 req/min | IN + US | API key |
| 3 | Twelve Data | api.twelvedata.com | 800 req/day | IN + US | API key |
| 4 | Financial Modeling Prep | fmpcloud.io/api | 250 req/day | US | API key |
| 5 | IEX Cloud | cloud.iexapis.com | 100 req/sec | US | API key |
| 6 | Tiingo | api.tiingo.com | 1000 req/hr | US | API key |
| 7 | Alpha Vantage | alphavantage.co/api | 25 req/day (free) | IN + US | API key |
| 8 | Polygon.io | api.polygon.io | 5 req/min | US | API key |
| 9 | World Trading Web | api.worldtradingdata.com | 100 req/day | US | API key |
| 10 | MarketStack | api.marketstack.com | 100 req/month | US | API key |

### Indian Market Specific
| # | Source | Type | Coverage | Auth |
|---|--------|------|----------|------|
| 11 | NSE India | nseindia.com API | IN | Cookie |
| 12 | BSE India | bseindia.com API | IN | No |
| 13 | Moneycontrol | moneycontrol.com | IN | No |
| 14 | Economic Times | economictimes.com | IN | No |
| 15 | Trendlyne | trendlyne.com | IN | API key |
| 16 | Tickertape | tickertape.in | IN | No |
| 17 | Screener.in | screener.in | IN | No |
| 18 | Groww | groww.in API | IN | API key |
| 19 | Zerodha Kite | kite.zerodha.com | IN | OAuth |
| 20 | Upstox | upstox.com API | IN | API key |
| 21 | Angel Broking | angelbroking.com | IN | API key |
| 22 | ICICI Direct | icicidirect.com | IN | Session |
| 23 | HDFC Securities | hdfcsec.com | IN | Session |
| 24 | Sharekhan | sharekhan.com | IN | Session |
| 25 | Kotak Securities | kotaksecurities.com | IN | Session |
| 26 | Motilal Oswal | motilaloswal.com | IN | API key |
| 27 | IIFL | iifl.com | IN | API key |
| 28 | SAMCO | samco.in | IN | API key |
| 29 | 5Paisa | 5paisa.com | IN | API key |
| 30 | TradeSmart | tradesmart.in | IN | API key |

## 2. Historical Data (25 sources)

| # | Source | URL | Coverage | Data |
|---|--------|-----|----------|------|
| 31 | Stooq | stooq.com | IN + US | OHLCV CSV |
| 32 | Yahoo Finance | finance.yahoo.com | IN + US | OHLCV + Fundamentals |
| 33 | Google Finance | google.com/finance | IN + US | OHLCV |
| 34 | Investing.com | investing.com | IN + US | OHLCV + News |
| 35 | TradingView | tradingview.com | IN + US | OHLCV + Indicators |
| 36 | Netdania | netdania.com | IN + US | OHLCV |
| 37 | FXStreet | fxstreet.com | US | OHLCV |
| 38 | DailyFX | dailyfx.com | US | OHLCV + Analysis |
| 39 | StockCharts | stockcharts.com | US | OHLCV + Technicals |
| 40 | BigCharts | bigcharts.com | US | OHLCV |
| 41 | MarketWatch | marketwatch.com | US | OHLCV + News |
| 42 | WSJ | wsj.com | US | OHLCV + Analysis |
| 43 | Bloomberg | bloomberg.com | US | OHLCV + News |
| 44 | Reuters | reuters.com | US | OHLCV + News |
| 45 | FT | ft.com | US | OHLCV + Analysis |
| 46 | CNBC | cnbc.com | US | OHLCV + News |
| 47 | Seeking Alpha | seekingalpha.com | US | Analysis + Ratings |
| 48 | Motley Fool | fool.com | US | Analysis + Picks |
| 49 | Kiplinger | kiplinger.com | US | Analysis + Picks |
| 50 | Barron's | barrons.com | US | Analysis + Picks |
| 51 | The Economist | economist.com | US | Analysis |
| 52 | Forbes | forbes.com | US | Analysis |
| 53 | Fortune | fortune.com | US | Analysis |
| 54 | Business Insider | businessinsider.com | US | Analysis + News |
| 55 | TechCrunch | techcrunch.com | US | Tech News |

## 3. Fundamentals (20 sources)

| # | Source | Data | Coverage |
|---|--------|------|----------|
| 56 | Yahoo Finance | P/E, P/B, EPS, Revenue, Margins | IN + US |
| 57 | Finnhub | Financials, Metrics | IN + US |
| 58 | Alpha Vantage | Fundamentals | IN + US |
| 59 | Financial Modeling Prep | Full Financials | US |
| 60 | IEX Cloud | Fundamentals | US |
| 61 | Morningstar | Ratings, Fundamentals | US |
| 62 | S&P Global | Ratings, Fundamentals | US |
| 63 | Moody's | Ratings | US |
| 64 | Fitch | Ratings | US |
| 65 | CB Insights | Startup Metrics | US |
| 66 | PitchBook | PE/VC Data | US |
| 67 | Crunchbase | Startup Data | US |
| 68 | DealRoom | M&A Data | US |
| 69 | Carta | Cap Table Data | US |
| 70 | AngelList | Startup Data | US |
| 71 | Screener.in | Indian Fundamentals | IN |
| 72 | Trendlyne | Indian Fundamentals | IN |
| 73 | Tickertape | Indian Fundamentals | IN |
| 74 | Moneycontrol | Indian Fundamentals | IN |
| 75 | Capitaline | Indian Fundamentals | IN |

## 4. News & Sentiment (22 sources)

| # | Source | Type | Coverage |
|---|--------|------|----------|
| 76 | Google News | RSS | Global |
| 77 | Yahoo Finance News | RSS | IN + US |
| 78 | Reuters | RSS + API | Global |
| 79 | Bloomberg | RSS | Global |
| 80 | CNBC | RSS | US |
| 81 | MarketWatch | RSS | US |
| 82 | WSJ | RSS | US |
| 83 | Seeking Alpha | RSS | US |
| 84 | Motley Fool | RSS | US |
| 85 | InvestorPlace | RSS | US |
| 86 | Benzinga | RSS | US |
| 87 | The Street | RSS | US |
| 88 | ZeroHedge | RSS | US |
| 89 | 24/7 Wall St | RSS | US |
| 90 | StockTwits | Social | US |
| 91 | Twitter/X | Social | Global |
| 92 | Reddit | Social | Global |
| 93 | Discord | Social | Global |
| 94 | Telegram | Social | Global |
| 95 | NewsAPI | API | Global |
| 96 | GDELT | API | Global |
| 97 | Event Registry | API | Global |

## 5. Insider Trading (15 sources)

| # | Source | Data | Coverage |
|---|--------|------|----------|
| 98 | SEC EDGAR | Form 4, 13F, 10-K | US |
| 99 | FINRA | Insider Transactions | US |
| 100 | OpenInsider | Insider Trades | US |
| 101 | InsiderMonkey | Insider Sentiment | US |
| 102 | MarketBeat | Insider Trades | US |
| 103 | InsiderTrading.com | Insider Trades | US |
| 104 | Nasdaq Insider | Insider Trades | US |
| 105 | SEC Form 4 | Direct Filings | US |
| 106 | EdgarKit | SEC Data | US |
| 107 | SEC XBRL | Financial Data | US |
| 108 | BSE Insider | Indian Insider | IN |
| 109 | NSE Insider | Indian Insider | IN |
| 110 | Moneycontrol Insider | Indian Insider | IN |
| 111 | Trendlyne Insider | Indian Insider | IN |
| 112 | Screener.in Insider | Indian Insider | IN |

## 6. Options Data (15 sources)

| # | Source | Data | Coverage |
|---|--------|------|----------|
| 113 | CBOE | Options Data | US |
| 114 | OCC | Options Data | US |
| 115 | Yahoo Finance Options | Options Chain | IN + US |
| 116 | Finnhub Options | Options Chain | US |
| 117 | Alpha Vantage Options | Options Chain | US |
| 118 | Barchart Options | Options Data | US |
| 119 | OptionsChain.com | Options Chain | US |
| 120 | MarketChameleon | Options Data | US |
| 121 | OptionsProfitCalculator | Options Analysis | US |
| 122 | Optionslam | Options Analysis | US |
| 123 | NSE Options | Indian Options | IN |
| 124 | BSE Options | Indian Options | IN |
| 125 | Moneycontrol Options | Indian Options | IN |
| 126 | Trendlyne Options | Indian Options | IN |
| 127 | Kite Options | Indian Options | IN |

## 7. Alternative Data (22 sources)

| # | Source | Data Type | Coverage |
|---|--------|-----------|----------|
| 128 | FRED | Economic Indicators | US |
| 129 | BEA | Economic Data | US |
| 130 | BLS | Employment Data | US |
| 131 | Census Bureau | Economic Data | US |
| 132 | Federal Reserve | Interest Rates | US |
| 133 | IMF | Global Economic Data | Global |
| 134 | World Bank | Development Data | Global |
| 135 | Orbital Insight | Satellite Imagery | Global |
| 136 | Descartes Labs | Satellite Data | Global |
| 137 | Sensor Tower | App Downloads | Global |
| 138 | App Annie | App Data | Global |
| 139 | SimilarWeb | Web Traffic | Global |
| 140 | Alexa | Web Traffic | Global |
| 141 | Second Measure | Credit Card Data | US |
| 142 | ImportGenius | Supply Chain | Global |
| 143 | DTN | Weather Data | Global |
| 144 | NOAA | Weather Data | US |
| 145 | OpenWeatherMap | Weather API | Global |
| 146 | CoinGecko | Crypto Data | Global |
| 147 | CoinMarketCap | Crypto Data | Global |
| 148 | Glassnode | On-Chain Data | Global |
| 149 | Santiment | Crypto Sentiment | Global |

---

## Data Source Selection Strategy

### Tier 1: Primary Sources (Always Use)
- **Stooq** — Historical candles (works from datacenter IPs)
- **Yahoo Finance** — Fundamentals + fallback candles
- **Finnhub** — US stocks (60 req/min free tier)
- **NSE India** — Indian stock quotes
- **Moneycontrol** — Indian stock quotes

### Tier 2: Supplementary Sources (Use When Available)
- **Twelve Data** — Additional price data
- **Financial Modeling Prep** — US fundamentals
- **Alpha Vantage** — Backup for all data
- **SEC EDGAR** — Insider trading filings
- **Google News** — Sentiment analysis

### Tier 3: Optional Enhancement Sources
- **Polygon.io** — Real-time US data
- **IEX Cloud** — US market data
- **Barchart** — Options data
- **CBOE** — Options data

### Tier 4: Alternative Data (For Alpha)
- **FRED** — Economic indicators
- **Sensor Tower** — App downloads
- **SimilarWeb** — Web traffic
- **SEC EDGAR** — Insider filings

---

## Rate Limiting Strategy

| Source | Free Tier | Paid Tier | Strategy |
|--------|-----------|-----------|----------|
| Yahoo Finance | 2000/day | Unlimited | Cache aggressively, use Stooq primary |
| Finnhub | 60/min | 300/min | Token bucket, 1 req/sec |
| Twelve Data | 800/day | 1200/min | Daily budget tracking |
| Alpha Vantage | 25/day | 75/min | Last resort only |
| NSE India | No limit | No limit | Cookie rotation, 3 req/sec |
| Moneycontrol | No limit | No limit | 4 req/sec |
| Stooq | No limit | No limit | 1 req/sec per domain |
| SEC EDGAR | 10 req/sec | 10 req/sec | Respect robots.txt |

---

## Data Collection Schedule

### Priority 1: Watchlist Stocks (Immediate)
- Crawl every 15 minutes
- All Tier 1 sources
- Full candle history accumulation

### Priority 2: Top 500 Indian Stocks (Within 24 hours)
- NSE Nifty 500 components
- Crawl in batches of 50
- 5 minute delay between batches

### Priority 3: Top 500 US Stocks (Within 24 hours)
- S&P 500 components
- Crawl in batches of 50
- 5 minute delay between batches

### Priority 4: Extended Universe (Within 7 days)
- All remaining stocks in universe
- Crawl in batches of 100
- 10 minute delay between batches

### Priority 5: Historical Data (Within 30 days)
- Fetch 5 years of daily candles
- Accumulate in batches of 200
- Background processing during off-hours
