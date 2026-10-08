import { HashRouter, NavLink, Routes, Route } from "react-router-dom";
import SetsPage from "./pages/SetsPage";
import SetDetailPage from "./pages/SetDetailPage";
import CardDetailPage from "./pages/CardDetailPage";
import GradedCoveragePage from "./pages/GradedCoveragePage";
import TrackedPage from "./pages/TrackedPage";
import BrowsePage from "./pages/BrowsePage";
import { SignIn } from "./components/SignIn";

function Nav() {
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? "text-white text-sm"
      : "text-gray-400 hover:text-gray-200 text-sm transition-colors";

  return (
    <nav className="border-b border-gray-800 px-6 py-3 flex items-center gap-6 sticky top-0 bg-gray-950 z-10">
      <NavLink to="/" className="font-bold text-white tracking-tight text-sm shrink-0">
        Market Tracker
      </NavLink>
      <NavLink to="/" end className={linkCls}>
        Tracked Sets
      </NavLink>
      <NavLink to="/sets" end className={linkCls}>
        Catalog
      </NavLink>
      <SignIn />
    </nav>
  );
}

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-screen flex flex-col bg-gray-950">
        <Nav />
        <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
          <Routes>
            <Route path="/" element={<BrowsePage />} />
            <Route path="/browse/:code" element={<TrackedPage />} />
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
