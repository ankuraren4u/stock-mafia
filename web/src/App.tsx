import { NavLink, Route, Routes } from "react-router-dom";
import { MarketProvider, useMarket } from "./hooks/useMarket";
import MarketsPage from "./pages/MarketsPage";
import StockPage from "./pages/StockPage";
import ResearchPage from "./pages/ResearchPage";
import PaperPage from "./pages/PaperPage";
import CrawlerPage from "./pages/CrawlerPage";
import DeskPage from "./pages/DeskPage";
import StatusPage from "./pages/StatusPage";
import ServiceHelpPage from "./pages/ServiceHelpPage";
import ServiceLinksPage from "./pages/ServiceLinksPage";
import AppStatus from "./components/AppStatus";

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? "active" : undefined;
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MarketToggle() {
  const { market, setMarket } = useMarket();
  return (
    <div style={{ position: "fixed", top: 12, right: 16, zIndex: 1000 }}>
      <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", background: "var(--panel)" }}>
        {(["IN", "US"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMarket(m)}
            style={{
              padding: "6px 16px", fontSize: 13, fontWeight: market === m ? 700 : 400,
              background: market === m ? "var(--accent)" : "transparent",
              color: market === m ? "#fff" : "var(--text)",
              border: "none", cursor: "pointer",
            }}
          >
            {m === "IN" ? "🇮🇳 India" : "🇺🇸 US"}
          </button>
        ))}
      </div>
    </div>
  );
}

function AppLayout() {
  const { market } = useMarket();
  const isIndian = market === "IN";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo" aria-hidden>SM</div>
          <div>
            <h1>StockMafia</h1>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end className={navClass}>
            <Icon d="M4 19V9l6-5 6 5v10M4 19h16M10 19v-6h4v6" />
            Markets
          </NavLink>
          <NavLink to="/research" className={navClass}>
            <Icon d="M4 13l4-4 4 5 4-7 4 6" />
            Research
          </NavLink>
          {isIndian && (
            <NavLink to="/desk" className={navClass}>
              <Icon d="M4 19h16M7 16V8m5 8V5m5 11v-6" />
              Trade Desk
            </NavLink>
          )}
          <NavLink to="/paper" className={navClass}>
            <Icon d="M6 4h9l5 5v11H6zM15 4v5h5" />
            Paper Book
          </NavLink>
          <NavLink to="/crawler" className={navClass}>
            <Icon d="M12 3v4M12 17v4M4.9 6.5l2.8 2.8M16.3 14.7l2.8 2.8M3 12h4M17 12h4M4.9 17.5l2.8-2.8M16.3 9.3l2.8-2.8" />
            Data Crawler
          </NavLink>
          <NavLink to="/status" className={navClass}>
            <Icon d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            System Status
          </NavLink>
          <NavLink to="/service-help" className={navClass}>
            <Icon d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            Service Help
          </NavLink>
          <NavLink to="/service-links" className={navClass}>
            <Icon d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            Service Links
          </NavLink>
        </nav>
        <div className="sidebar-foot">13 strategies · WebSocket · 80+ sources</div>
      </aside>
      <main className="main">
        <AppStatus />
        <MarketToggle />
        <Routes>
          <Route path="/" element={<MarketsPage />} />
          <Route path="/research" element={<ResearchPage />} />
          <Route path="/desk" element={<DeskPage />} />
          <Route path="/paper" element={<PaperPage />} />
          <Route path="/crawler" element={<CrawlerPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/service-help" element={<ServiceHelpPage />} />
          <Route path="/service-links" element={<ServiceLinksPage />} />
          <Route path="/stock/:symbol" element={<StockPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <MarketProvider>
      <AppLayout />
    </MarketProvider>
  );
}
