import { useEffect, useRef, useState } from "react";
import { HashRouter, NavLink, Routes, Route, useLocation } from "react-router-dom";
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
import RankingsPage from "./pages/RankingsPage";
import GroupPage from "./pages/GroupPage";
import CardClassesPage from "./pages/CardClassesPage";
import RoadmapPage from "./pages/RoadmapPage";
import ChannelsPage from "./pages/ChannelsPage";
import WatchlistPage from "./pages/WatchlistPage";
import AutomationPage from "./pages/AutomationPage";
import SealedTodoPage from "./pages/SealedTodoPage";
import { SignIn } from "./components/SignIn";
import { Mark } from "./brand/Mark";
import { COMPANY_NAME, PRODUCT_NAME } from "./brand/brand";

// The nav: a few groups, each a dropdown of pages (Sets and Developer stand
// alone). A group shows as active when one of its pages is open.
const NAV: { label: string; to?: string; items?: { to: string; label: string; hint: string }[] }[] = [
  { label: "Sets", to: "/" },
  {
    label: "Buying",
    items: [
      { to: "/watchlist", label: "Watchlist", hint: "Your cards, their targets and hits; by consigner; hunt list" },
      { to: "/deals", label: "Deals", hint: "This week's auctions, ending soon, raw sellers" },
      { to: "/windows", label: "Buy windows", hint: "When each tier usually bottoms" },
      { to: "/prep", label: "Buying prep", hint: "Bid plans for the weekly auctions" },
      { to: "/sealed", label: "Sealed TODO", hint: "Sealed products to price or buy" },
    ],
  },
  {
    label: "Analytics",
    items: [
      { to: "/timing", label: "Timing", hint: "Release curves and buy timing" },
      { to: "/rankings", label: "Rankings", hint: "Cards ranked by play" },
      { to: "/channels", label: "Sell channels", hint: "What cards sell for by platform and consigner" },
      { to: "/promos", label: "Promos", hint: "Card classes: promos, exotics" },
    ],
  },
  {
    label: "Settings",
    items: [
      { to: "/settings", label: "Settings", hint: "Grading costs, fees, value source" },
      { to: "/automation", label: "Automation", hint: "Scheduled jobs and card priority" },
      { to: "/developer", label: "Developer", hint: "APIs, architecture, roadmap" },
    ],
  },
  { label: "Developer", to: "/developer" }, // also under Settings: phones hide this one
];

function NavGroup({ g }: { g: (typeof NAV)[number] }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(false), [loc.pathname, loc.search]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const active = g.items?.some((i) => loc.pathname === i.to || loc.pathname.startsWith(i.to + "/")) ?? false;
  return (
    <div ref={ref} className="relative" onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)} onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu"
        className={`text-sm flex items-center gap-1 py-3 ${active ? "text-white" : "text-gray-400 hover:text-gray-200"}`}>
        {g.label}<span className={`text-[9px] transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full -mt-1 w-64 rounded-lg border border-gray-800 bg-gray-900 shadow-xl py-1 z-40">
          {g.items!.map((i) => (
            <NavLink key={i.to} to={i.to} role="menuitem"
              className={({ isActive }) => `block px-3 py-2 ${isActive ? "bg-gray-800/80" : "hover:bg-gray-800/60"}`}>
              {({ isActive }) => (
                <>
                  <div className={`text-sm ${isActive ? "text-white" : "text-gray-200"}`}>{i.label}</div>
                  <div className="text-[11px] text-gray-500">{i.hint}</div>
                </>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function Nav() {
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? "text-white text-sm"
      : "text-gray-400 hover:text-gray-200 text-sm transition-colors";

  return (
    <nav className="h-12 border-b border-gray-800 px-3 sm:px-6 flex items-center gap-3 sm:gap-6 sticky top-0 bg-gray-950 z-30 print:hidden">
      <NavLink to="/" className="flex items-center gap-2 shrink-0" title={`${PRODUCT_NAME} · ${COMPANY_NAME}`}>
        <Mark height={32} />
        <span className="hidden sm:flex flex-col leading-none">
          <span className="font-bold text-white tracking-tight text-sm">{PRODUCT_NAME}</span>
          <span className="mt-0.5 text-[8px] font-semibold tracking-[0.2em] text-gray-400 uppercase">{COMPANY_NAME}</span>
        </span>
      </NavLink>
      {NAV.map((g) => g.to
        ? <NavLink key={g.label} to={g.to} end={g.to === "/"} className={(a) => `${linkCls(a)} ${g.to === "/developer" ? "hidden sm:inline" : ""}`}>{g.label}</NavLink>
        : <NavGroup key={g.label} g={g} />)}
      <div className="ml-auto"><SignIn /></div>
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
            <Route path="/timing/group/:category" element={<GroupPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/rankings" element={<RankingsPage />} />
            <Route path="/promos" element={<CardClassesPage />} />
            <Route path="/developer" element={<RoadmapPage />} />
            <Route path="/sealed" element={<SealedTodoPage />} />
            <Route path="/roadmap" element={<RoadmapPage />} />
            <Route path="/watchlist" element={<WatchlistPage />} />
            <Route path="/channels" element={<ChannelsPage />} />
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
