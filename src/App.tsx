import { useEffect, useRef, useState } from "react";
import { HashRouter, Navigate, NavLink, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import SetsPage from "./pages/SetsPage";
import SetDetailPage from "./pages/SetDetailPage";
import CardDetailPage from "./pages/CardDetailPage";
import GradedCoveragePage from "./pages/GradedCoveragePage";
import TrackedPage from "./pages/TrackedPage";
import BrowsePage from "./pages/BrowsePage";
import RiftboundPage from "./pages/RiftboundPage";
import RiftboundSetPage from "./pages/RiftboundSetPage";
import RiftboundAnalyticsPage from "./pages/RiftboundAnalyticsPage";
import RiftboundWatchlistPage from "./pages/RiftboundWatchlistPage";
import RiftboundDealsPage from "./pages/RiftboundDealsPage";
import RiftboundTimingPage from "./pages/RiftboundTimingPage";
import PcgPage from "./pages/PcgPage";
import SellerPage from "./pages/SellerPage";
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

// The nav: a game switch (Pokémon / Riftbound), then a few groups, each a
// dropdown of pages (Sets and Developer stand alone). A group shows as
// active when one of its pages is open. Each game has its own Sets, Buying
// and Analytics pages; Settings are shared.
type NavEntry = { label: string; to?: string; items?: { to: string; label: string; hint: string }[] };
type Game = "pokemon" | "riftbound";

const SHARED: NavEntry[] = [
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

const NAV_RIFTBOUND: NavEntry[] = [
  { label: "Sets", to: "/rb" },
  {
    label: "Buying",
    items: [
      { to: "/rb/watchlist", label: "Watchlist", hint: "Your Riftbound cards and their live copies" },
      { to: "/rb/deals", label: "Deals", hint: "Raw copies to grade (EV at the listing price), slabs under market" },
    ],
  },
  {
    label: "Analytics",
    items: [
      { to: "/rb/timing", label: "Timing", hint: "When signatures, overnumbered, alt arts and promos bottom after release" },
      { to: "/rb/analytics", label: "Prices & movers", hint: "Price by card type across sets, biggest moves" },
      { to: "/rb/pcg", label: "PCG grading", hint: "PCG grade odds and PCG vs PSA prices for Riftbound" },
    ],
  },
  ...SHARED,
];

// Pages that exist in both games, for the switch to land on the same page.
const TWIN: [string, string][] = [["/watchlist", "/rb/watchlist"], ["/deals", "/rb/deals"], ["/timing", "/rb/timing"], ["/pcg", "/rb/pcg"]];
const POKEMON_ANALYTICS = ["/rankings", "/channels", "/promos", "/windows"];
const SHARED_PATHS = ["/settings", "/automation", "/developer", "/roadmap", "/cards/"];

function gameOf(path: string, last: Game): Game {
  if (path === "/rb" || path.startsWith("/rb/")) return "riftbound";
  if (path.startsWith("/cards/riftbound-")) return "riftbound";
  if (path.startsWith("/cards/")) return "pokemon";
  return SHARED_PATHS.some((p) => path.startsWith(p)) ? last : "pokemon";
}

function switchTo(path: string, to: Game): string | null {
  if (SHARED_PATHS.some((p) => path.startsWith(p)) && !path.startsWith("/cards/")) return null; // stay; the menus change
  if (to === "riftbound") {
    if (POKEMON_ANALYTICS.some((p) => path.startsWith(p))) return "/rb/analytics";
    return TWIN.find(([a]) => path.startsWith(a))?.[1] ?? "/rb";
  }
  return TWIN.find(([, b]) => path.startsWith(b))?.[0] ?? "/";
}

const LAST_GAME = "nav.game";
function readLast(): Game {
  try { return localStorage.getItem(LAST_GAME) === "riftbound" ? "riftbound" : "pokemon"; } catch { return "pokemon"; }
}

function GameSwitch({ game, onPick }: { game: Game; onPick: (g: Game) => void }) {
  return (
    <div className="flex rounded-md border border-gray-800 overflow-hidden text-xs shrink-0" role="tablist" aria-label="Game">
      {(["pokemon", "riftbound"] as const).map((g) => (
        <button key={g} role="tab" aria-selected={game === g} onClick={() => onPick(g)}
          className={`px-2 py-1 ${game === g ? (g === "pokemon" ? "bg-yellow-900/60 text-yellow-200" : "bg-sky-900/60 text-sky-200") : "text-gray-400 hover:text-gray-200"}`}>
          {g === "pokemon" ? "Pokémon" : "Riftbound"}
        </button>
      ))}
    </div>
  );
}

const NAV: NavEntry[] = [
  { label: "Sets", to: "/" },
  {
    label: "Buying",
    items: [
      { to: "/watchlist", label: "Watchlist", hint: "Your cards, their targets and hits; by consigner; hunt list; consigner board" },
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
      { to: "/pcg", label: "PCG grading", hint: "PCG grade odds and PCG vs PSA prices: when PCG pays" },
    ],
  },
  ...SHARED,
];

function NavGroup({ g }: { g: NavEntry }) {
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
  const loc = useLocation();
  const navigate = useNavigate();
  const [last, setLast] = useState<Game>(readLast);
  const game = gameOf(loc.pathname, last);
  useEffect(() => {
    if (game === last) return;
    setLast(game);
    try { localStorage.setItem(LAST_GAME, game); } catch { /* ignore */ }
  }, [game, last]);
  const pick = (g: Game) => {
    setLast(g);
    try { localStorage.setItem(LAST_GAME, g); } catch { /* ignore */ }
    const to = switchTo(loc.pathname, g);
    if (to) navigate(to);
  };
  const nav = game === "riftbound" ? NAV_RIFTBOUND : NAV;
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? "text-white text-sm"
      : "text-gray-400 hover:text-gray-200 text-sm transition-colors";

  return (
    <nav className="h-12 border-b border-gray-800 px-3 sm:px-6 flex items-center gap-3 sm:gap-6 sticky top-0 bg-gray-950 z-30 print:hidden">
      <NavLink to={game === "riftbound" ? "/rb" : "/"} className="flex items-center gap-2 shrink-0" title={`${PRODUCT_NAME} · ${COMPANY_NAME}`}>
        <Mark height={32} />
        <span className="hidden sm:flex flex-col leading-none">
          <span className="font-bold text-white tracking-tight text-sm">{PRODUCT_NAME}</span>
          <span className="mt-0.5 text-[8px] font-semibold tracking-[0.2em] text-gray-400 uppercase">{COMPANY_NAME}</span>
        </span>
      </NavLink>
      <GameSwitch game={game} onPick={pick} />
      {nav.map((g) => g.to
        ? <NavLink key={g.label} to={g.to} end={g.to === "/" || g.to === "/rb"} className={(a) => `${linkCls(a)} ${g.to === "/developer" ? "hidden sm:inline" : ""}`}>{g.label}</NavLink>
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
            <Route path="/rb" element={<RiftboundPage />} />
            <Route path="/rb/set/:code" element={<RiftboundSetPage />} />
            <Route path="/rb/analytics" element={<RiftboundAnalyticsPage />} />
            <Route path="/rb/timing" element={<RiftboundTimingPage />} />
            <Route path="/rb/pcg" element={<PcgPage game="riftbound" />} />
            <Route path="/pcg" element={<PcgPage game="pokemon" />} />
            <Route path="/rb/watchlist" element={<RiftboundWatchlistPage />} />
            <Route path="/rb/deals" element={<RiftboundDealsPage />} />
            <Route path="/riftbound" element={<Navigate to="/rb" replace />} />
            <Route path="/deals" element={<DealsPage />} />
            <Route path="/deals/seller/:username" element={<SellerPage />} />
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
