import { NavLink, Route, Routes } from "react-router-dom";
import MarketsPage from "./pages/MarketsPage";
import StockPage from "./pages/StockPage";
import SignalsPage from "./pages/SignalsPage";
import PaperPage from "./pages/PaperPage";
import CrawlerPage from "./pages/CrawlerPage";
import AlgoPage from "./pages/AlgoPage";
import DeskPage from "./pages/DeskPage";
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

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo" aria-hidden>
            SM
          </div>
          <div>
            <h1>StockMafia</h1>
            <p>India & US markets</p>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end className={navClass}>
            <Icon d="M4 19V9l6-5 6 5v10M4 19h16M10 19v-6h4v6" />
            Markets
          </NavLink>
          <NavLink to="/desk" className={navClass}>
            <Icon d="M4 19h16M7 16V8m5 8V5m5 11v-6" />
            Trade desk
          </NavLink>
          <NavLink to="/signals" className={navClass}>
            <Icon d="M4 13l4-4 4 5 4-7 4 6" />
            Signals
          </NavLink>
          <NavLink to="/paper" className={navClass}>
            <Icon d="M6 4h9l5 5v11H6zM15 4v5h5" />
            Paper book
          </NavLink>
          <NavLink to="/crawler" className={navClass}>
            <Icon d="M12 3v4M12 17v4M4.9 6.5l2.8 2.8M16.3 14.7l2.8 2.8M3 12h4M17 12h4M4.9 17.5l2.8-2.8M16.3 9.3l2.8-2.8" />
            Data crawler
          </NavLink>
          <NavLink to="/algo" className={navClass}>
            <Icon d="M5 19l5-7 4 4 5-8M5 19h14" />
            Strategies
          </NavLink>
        </nav>
        <div className="sidebar-foot">Watchlist crawls run in the background. Live Kite stays off until you enable it.</div>
      </aside>
      <main className="main">
        <AppStatus />
        <Routes>
          <Route path="/" element={<MarketsPage />} />
          <Route path="/desk" element={<DeskPage />} />
          <Route path="/signals" element={<SignalsPage />} />
          <Route path="/paper" element={<PaperPage />} />
          <Route path="/crawler" element={<CrawlerPage />} />
          <Route path="/algo" element={<AlgoPage />} />
          <Route path="/stock/:symbol" element={<StockPage />} />
        </Routes>
      </main>
    </div>
  );
}
