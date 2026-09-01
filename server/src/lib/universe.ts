export type Market = "IN" | "US";

export interface Instrument {
  symbol: string;
  yahoo: string;
  name: string;
  sector: string;
  market: Market;
  exchange: string;
  currency: "INR" | "USD";
}

export const INDIA_STOCKS: Instrument[] = [
  { symbol: "RELIANCE", yahoo: "RELIANCE.NS", name: "Reliance Industries", sector: "Energy", market: "IN", exchange: "NSE", currency: "INR" },
  { symbol: "TCS", yahoo: "TCS.NS", name: "Tata Consultancy Services", sector: "IT", market: "IN", exchange: "NSE", currency: "INR" },
  { symbol: "INFY", yahoo: "INFY.NS", name: "Infosys", sector: "IT", market: "IN", exchange: "NSE", currency: "INR" },
  { symbol: "HDFCBANK", yahoo: "HDFCBANK.NS", name: "HDFC Bank", sector: "Banking", market: "IN", exchange: "NSE", currency: "INR" },
  { symbol: "ICICIBANK", yahoo: "ICICIBANK.NS", name: "ICICI Bank", sector: "Banking", market: "IN", exchange: "NSE", currency: "INR" },
  { symbol: "SBIN", yahoo: "SBIN.NS", name: "State Bank of India", sector: "Banking", market: "IN", exchange: "NSE", currency: "INR" },
  { symbol: "BHARTIARTL", yahoo: "BHARTIARTL.NS", name: "Bharti Airtel", sector: "Telecom", market: "IN", exchange: "NSE", currency: "INR" },
  { symbol: "ITC", yahoo: "ITC.NS", name: "ITC", sector: "FMCG", market: "IN", exchange: "NSE", currency: "INR" },
  { symbol: "LT", yahoo: "LT.NS", name: "Larsen & Toubro", sector: "Infrastructure", market: "IN", exchange: "NSE", currency: "INR" },
  { symbol: "AXISBANK", yahoo: "AXISBANK.NS", name: "Axis Bank", sector: "Banking", market: "IN", exchange: "NSE", currency: "INR" },
  { symbol: "HINDUNILVR", yahoo: "HINDUNILVR.NS", name: "Hindustan Unilever", sector: "FMCG", market: "IN", exchange: "NSE", currency: "INR" },
  { symbol: "MARUTI", yahoo: "MARUTI.NS", name: "Maruti Suzuki", sector: "Auto", market: "IN", exchange: "NSE", currency: "INR" },
  { symbol: "TATAMOTORS", yahoo: "TATAMOTORS.NS", name: "Tata Motors", sector: "Auto", market: "IN", exchange: "NSE", currency: "INR" },
  { symbol: "SUNPHARMA", yahoo: "SUNPHARMA.NS", name: "Sun Pharma", sector: "Pharma", market: "IN", exchange: "NSE", currency: "INR" },
  { symbol: "WIPRO", yahoo: "WIPRO.NS", name: "Wipro", sector: "IT", market: "IN", exchange: "NSE", currency: "INR" },
  { symbol: "KOTAKBANK", yahoo: "KOTAKBANK.NS", name: "Kotak Mahindra Bank", sector: "Banking", market: "IN", exchange: "NSE", currency: "INR" },
  { symbol: "BAJFINANCE", yahoo: "BAJFINANCE.NS", name: "Bajaj Finance", sector: "NBFC", market: "IN", exchange: "NSE", currency: "INR" },
  { symbol: "ASIANPAINT", yahoo: "ASIANPAINT.NS", name: "Asian Paints", sector: "Materials", market: "IN", exchange: "NSE", currency: "INR" },
  { symbol: "TITAN", yahoo: "TITAN.NS", name: "Titan Company", sector: "Consumer", market: "IN", exchange: "NSE", currency: "INR" },
  { symbol: "ULTRACEMCO", yahoo: "ULTRACEMCO.NS", name: "UltraTech Cement", sector: "Cement", market: "IN", exchange: "NSE", currency: "INR" },
];

export const US_STOCKS: Instrument[] = [
  { symbol: "AAPL", yahoo: "AAPL", name: "Apple", sector: "Technology", market: "US", exchange: "NASDAQ", currency: "USD" },
  { symbol: "MSFT", yahoo: "MSFT", name: "Microsoft", sector: "Technology", market: "US", exchange: "NASDAQ", currency: "USD" },
  { symbol: "NVDA", yahoo: "NVDA", name: "NVIDIA", sector: "Technology", market: "US", exchange: "NASDAQ", currency: "USD" },
  { symbol: "GOOGL", yahoo: "GOOGL", name: "Alphabet", sector: "Technology", market: "US", exchange: "NASDAQ", currency: "USD" },
  { symbol: "AMZN", yahoo: "AMZN", name: "Amazon", sector: "Consumer", market: "US", exchange: "NASDAQ", currency: "USD" },
  { symbol: "META", yahoo: "META", name: "Meta Platforms", sector: "Technology", market: "US", exchange: "NASDAQ", currency: "USD" },
  { symbol: "TSLA", yahoo: "TSLA", name: "Tesla", sector: "Auto", market: "US", exchange: "NASDAQ", currency: "USD" },
  { symbol: "AVGO", yahoo: "AVGO", name: "Broadcom", sector: "Technology", market: "US", exchange: "NASDAQ", currency: "USD" },
  { symbol: "JPM", yahoo: "JPM", name: "JPMorgan Chase", sector: "Banking", market: "US", exchange: "NYSE", currency: "USD" },
  { symbol: "V", yahoo: "V", name: "Visa", sector: "Financials", market: "US", exchange: "NYSE", currency: "USD" },
  { symbol: "UNH", yahoo: "UNH", name: "UnitedHealth", sector: "Healthcare", market: "US", exchange: "NYSE", currency: "USD" },
  { symbol: "XOM", yahoo: "XOM", name: "Exxon Mobil", sector: "Energy", market: "US", exchange: "NYSE", currency: "USD" },
  { symbol: "JNJ", yahoo: "JNJ", name: "Johnson & Johnson", sector: "Healthcare", market: "US", exchange: "NYSE", currency: "USD" },
  { symbol: "WMT", yahoo: "WMT", name: "Walmart", sector: "Consumer", market: "US", exchange: "NYSE", currency: "USD" },
  { symbol: "MA", yahoo: "MA", name: "Mastercard", sector: "Financials", market: "US", exchange: "NYSE", currency: "USD" },
  { symbol: "PG", yahoo: "PG", name: "Procter & Gamble", sector: "Consumer", market: "US", exchange: "NYSE", currency: "USD" },
  { symbol: "HD", yahoo: "HD", name: "Home Depot", sector: "Consumer", market: "US", exchange: "NYSE", currency: "USD" },
  { symbol: "COST", yahoo: "COST", name: "Costco", sector: "Consumer", market: "US", exchange: "NASDAQ", currency: "USD" },
  { symbol: "NFLX", yahoo: "NFLX", name: "Netflix", sector: "Communication", market: "US", exchange: "NASDAQ", currency: "USD" },
  { symbol: "AMD", yahoo: "AMD", name: "AMD", sector: "Technology", market: "US", exchange: "NASDAQ", currency: "USD" },
];

export const UNIVERSE: Instrument[] = [...INDIA_STOCKS, ...US_STOCKS];

export const INDICES = {
  IN: [
    { symbol: "NIFTY 50", yahoo: "^NSEI", name: "Nifty 50", market: "IN" as const },
    { symbol: "SENSEX", yahoo: "^BSESN", name: "BSE Sensex", market: "IN" as const },
    { symbol: "BANKNIFTY", yahoo: "^NSEBANK", name: "Nifty Bank", market: "IN" as const },
  ],
  US: [
    { symbol: "S&P 500", yahoo: "^GSPC", name: "S&P 500", market: "US" as const },
    { symbol: "DOW", yahoo: "^DJI", name: "Dow Jones", market: "US" as const },
    { symbol: "NASDAQ", yahoo: "^IXIC", name: "Nasdaq Composite", market: "US" as const },
    { symbol: "VIX", yahoo: "^VIX", name: "CBOE VIX", market: "US" as const },
  ],
};

export function catalog(): Instrument[] {
  return UNIVERSE;
}

export function findInCatalog(query: string): Instrument | null {
  const q = decodeURIComponent(query).trim().toUpperCase();
  return (
    UNIVERSE.find((s) => s.yahoo.toUpperCase() === q) ??
    UNIVERSE.find((s) => s.symbol.toUpperCase() === q) ??
    null
  );
}

export function classifyMarket(yahoo: string, exchange = ""): Market {
  const y = yahoo.toUpperCase();
  const ex = exchange.toUpperCase();
  if (y.endsWith(".NS") || y.endsWith(".BO") || ex.includes("NSE") || ex.includes("BSE") || ex.includes("NATIONAL STOCK")) {
    return "IN";
  }
  return "US";
}
