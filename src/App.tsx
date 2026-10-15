import { HashRouter, NavLink, Routes, Route } from "react-router-dom";
import SetsPage from "./pages/SetsPage";
import SetDetailPage from "./pages/SetDetailPage";
import CardDetailPage from "./pages/CardDetailPage";
import GradedCoveragePage from "./pages/GradedCoveragePage";
import TrackedPage from "./pages/TrackedPage";
import BrowsePage from "./pages/BrowsePage";
import DealsPage from "./pages/DealsPage";
import BuyWindowsPage from "./pages/BuyWindowsPage";
import BuyingPrepPage from "./pages/BuyingPrepPage";
import TimingPage from "./pages/TimingPage";
import SettingsPage from "./pages/SettingsPage";
import RoadmapPage from "./pages/RoadmapPage";
import WatchlistPage from "./pages/WatchlistPage";
import AutomationPage from "./pages/AutomationPage";
import { SignIn } from "./components/SignIn";

function Nav() {
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? "text-white text-sm"
      : "text-gray-400 hover:text-gray-200 text-sm transition-colors";

  return (
    <nav className="border-b border-gray-800 px-6 py-3 flex items-center gap-6 sticky top-0 bg-gray-950 z-10 print:hidden">
      <NavLink to="/" className="font-bold text-white tracking-tight text-sm shrink-0">
        Market Tracker
      </NavLink>
      <NavLink to="/" end className={linkCls}>
        Sets
      </NavLink>
      <NavLink to="/windows" className={linkCls}>
        Buy windows
      </NavLink>
      <NavLink to="/deals" className={linkCls}>
        Deals
      </NavLink>
      <NavLink to="/timing" className={linkCls}>
        Timing
      </NavLink>
      <NavLink to="/prep" className={linkCls}>
        Buying prep
      </NavLink>
      <NavLink to="/watchlist" className={linkCls}>
        Watchlist
      </NavLink>
      <NavLink to="/settings" className={linkCls}>
        Settings
      </NavLink>
      <NavLink to="/automation" className={linkCls}>
        Automation
      </NavLink>
      <NavLink to="/developer" className={linkCls}>
        Developer
      </NavLink>
      <SignIn />
    </nav>
  );
}

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-screen flex flex-col bg-gray-950 print:bg-white">
        <Nav />
        <main className="flex-1 p-4 lg:p-6 w-full min-w-0">
          <Routes>
            <Route path="/" element={<BrowsePage />} />
            <Route path="/browse/:code" element={<TrackedPage />} />
            <Route path="/deals" element={<DealsPage />} />
            <Route path="/windows" element={<BuyWindowsPage />} />
            <Route path="/timing" element={<TimingPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/developer" element={<RoadmapPage />} />
            <Route path="/roadmap" element={<RoadmapPage />} />
            <Route path="/watchlist" element={<WatchlistPage />} />
            <Route path="/prep" element={<BuyingPrepPage />} />
            <Route path="/automation" element={<AutomationPage />} />
            {/* Old catalog list; the home page's "Show untracked sets" replaces it. */}
            <Route path="/sets" element={<SetsPage />} />
            <Route path="/sets/:game/:code" element={<SetDetailPage />} />
            <Route path="/cards/:displayKey" element={<CardDetailPage />} />
            {/* Not in the nav: admin view of scrape links and refresh buttons. */}
            <Route path="/graded" element={<GradedCoveragePage />} />
            <Route path="/tracked" element={<TrackedPage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
