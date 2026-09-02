import { createContext, useContext, useState } from "react";

type Market = "IN" | "US";

interface MarketCtx {
  market: Market;
  setMarket: (m: Market) => void;
}

function getValidMarket(): Market {
  try {
    const stored = localStorage.getItem("stockmafia-market");
    if (stored === "IN" || stored === "US") return stored;
  } catch {}
  return "IN";
}

const Ctx = createContext<MarketCtx>({ market: "IN", setMarket: () => {} });

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [market, setMarket] = useState<Market>(getValidMarket);
  const set = (m: Market) => { setMarket(m); try { localStorage.setItem("stockmafia-market", m); } catch {} };
  return <Ctx.Provider value={{ market, setMarket: set }}>{children}</Ctx.Provider>;
}

export function useMarket() { return useContext(Ctx); }
