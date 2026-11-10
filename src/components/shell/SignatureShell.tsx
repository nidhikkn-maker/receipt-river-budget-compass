import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Bell, CalendarDays, Check, Columns2, Columns4, Eye, EyeOff, House, Plus, Rows3, Search, Settings } from "lucide-react";
import { DeviceLock } from "@/components/DeviceLock";
import { StepUpHost } from "@/components/StepUpHost";
import { StoreLoadNotice } from "@/components/StoreLoadNotice";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PageSkeleton } from "@/components/PageSkeleton";
import { NavProgress } from "@/components/NavProgress";
import { DemoBanner } from "@/components/DemoBanner";
import { DraftsReminder } from "@/components/DraftsReminder";
import { IntelligentCanvas } from "@/components/smart-add/IntelligentCanvas";
import { ThapalTMark, ThapalWordmark } from "@/components/ThapalLogo";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useStore } from "@/lib/store";
import { SMART_ADD_EVENT } from "@/lib/smart-add-event";
import { useAppLocked } from "@/lib/app-lock-state";
import { activeDestination, BOTTOM_BAR, ownsHeader, emptyTrail, RAIL, stepTrail, trailFrom, type SectionId, type Trail, type TrailAction } from "./navigation";
import { Breadcrumbs, RecordsSubnav } from "./PageHeader";
import { SearchPalette } from "./SearchPalette";
import { ShellContext } from "./shell-context";
import { SyncStatus } from "./SyncStatus";
import { setUixOverride, useUixOverride } from "./use-shell-mode";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

const ICON: Record<SectionId, typeof House> = {
  home: House, money: Columns2, tasks: Check, records: Rows3, reports: Columns4, add: Plus,
  calendar: CalendarDays, notifications: Bell, settings: Settings, search: Search,
};

/** Avatar letters: a short single-word name ("KK") is shown whole; otherwise the first two initials. */
export function avatarLetters(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "T";
  if (parts.length === 1) return (parts[0]!.length <= 3 ? parts[0]! : parts[0]![0]!).toUpperCase();
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

/**
 * While this shell is showing, let the page reach the screen edges (viewport-fit=cover) so the header and the
 * bottom bar can pad themselves with the real safe-area insets; the original viewport is restored on switch-off.
 */
export function useViewportCover() {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const before = meta.content;
    if (!/viewport-fit\s*=\s*cover/.test(before)) meta.content = `${before}${before ? ", " : ""}viewport-fit=cover`;
    return () => { meta.content = before; };
  }, []);
}

// One trail per tab, so a reload keeps the real origin for Back and breadcrumbs.
let trail: Trail | null = null;

/** Hide/show amounts, shared with the current shell through the same device setting. */
function usePrivacy(): [boolean, (v: boolean) => void] {
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem("ll-privacy") === "1"); } catch { /* private mode */ } }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("privacy", hidden);
    try { localStorage.setItem("ll-privacy", hidden ? "1" : "0"); } catch { /* private mode */ }
  }, [hidden]);
  return [hidden, setHidden];
}

function AccountMenu({ hidden, setHidden }: { hidden: boolean; setHidden: (v: boolean) => void }) {
  const { name } = useStore();
  const override = useUixOverride();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="sf-avatar" data-initials={avatarLetters(name)} aria-label={name ? `Account: ${name}` : "Account"}>{avatarLetters(name)}</PopoverTrigger>
      <PopoverContent align="end" className="sf-popover">
        <p className="sf-overline">{name || "Your account"}</p>
        <Link to="/settings" className="sf-menu-row" onClick={() => setOpen(false)}><Settings aria-hidden />Settings & appearance</Link>
        <button type="button" className="sf-menu-row" aria-pressed={hidden} onClick={() => setHidden(!hidden)}>{hidden ? <EyeOff aria-hidden /> : <Eye aria-hidden />}{hidden ? "Show amounts" : "Hide amounts"}</button>
        <Link to="/auth" className="sf-menu-row" onClick={() => setOpen(false)}>Sign-in & account</Link>
        {override === "signature-flow" && <button type="button" className="sf-menu-row" onClick={() => { setOpen(false); setUixOverride(null); }}>Leave the Signature Flow preview on this device</button>}
        <p className="sf-state-hint mt-2">Signature Flow is proposed and awaiting visual approval. Change the look in Settings → Appearance; your records are not affected.</p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Proposed Signature Flow shell (UIX master §4, §5, §17): slim rail with the placeholder T mark on iPad and
 * computer, header with wordmark and universal tools, and an iPhone bottom bar with a central Add.
 * Everything inside <main> is today's pages and their existing behaviour.
 */
export function SignatureShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { loading, preferences } = useStore();
  const href = useRouterState({ select: (s) => s.location.href });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const focused = pathname === "/new";
  // Locked (or still deciding at start-up): no navigation, workspace, avatar, reminders or sheets (UIX §16.4).
  const locked = useAppLocked() || loading;
  const active = activeDestination(pathname);
  const [hidden, setHidden] = usePrivacy();
  const [smartOpen, setSmartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [from, setFrom] = useState<string | null>(() => (trail ? trailFrom(trail) : null));
  useViewportCover();

  useEffect(() => { if (!trail) trail = emptyTrail(router.history.location.href); }, [router]);
  useEffect(() => router.history.subscribe(({ location, action }) => {
    trail = stepTrail(trail ?? emptyTrail(location.href), action.type as TrailAction, location.href);
    setFrom(trailFrom(trail));
  }), [router]);
  useEffect(() => { const open = () => setSmartOpen(true); window.addEventListener(SMART_ADD_EVENT, open); return () => window.removeEventListener(SMART_ADD_EVENT, open); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ctx = useMemo(() => ({ from, openSearch: () => setSearchOpen(true), openSmartAdd: () => setSmartOpen(true) }), [from]);
  const item = (d: (typeof RAIL)[number], cls: string) => {
    const Icon = ICON[d.id];
    const current = active === d.id;
    if (d.id === "add") return <button key={d.id} type="button" className={`${cls} ${cls}-add`} aria-label="Add (Smart Add)" onClick={() => setSmartOpen(true)}><span className="sf-nav-icon"><Icon aria-hidden /></span><span>{d.label}</span></button>;
    return <Link key={d.id} to={d.to} className={cls} aria-current={current ? "page" : undefined} data-active={current || undefined}><span className="sf-nav-icon"><Icon aria-hidden /></span><span>{d.label}</span></Link>;
  };

  return (
    <ShellContext.Provider value={ctx}>
      <div className={"sf-shell uix-shell" + (focused ? " sf-focused" : "")} data-shell="signature-flow">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:bg-card focus:p-3">Skip to content</a>
        {!focused && !locked && <aside className="sf-rail" aria-label="Sidebar">
          <Link to="/home" className="sf-rail-mark" aria-label="Thapal home"><ThapalTMark /></Link>
          <nav aria-label="Main" className="sf-rail-nav">{RAIL.map((d) => item(d, "sf-rail-item"))}</nav>
          <Link to="/settings" className="sf-rail-settings" aria-label="Settings" aria-current={pathname === "/settings" ? "page" : undefined}><Settings aria-hidden /></Link>
        </aside>}

        <div className="sf-frame">
          {!focused && !locked && <header className="sf-header">
            <Link to="/home" aria-label="Thapal home" className="sf-header-brand"><ThapalWordmark /></Link>
            <div className="sf-header-tools">
              <span className="sf-sync"><SyncStatus compact /></span>
              <WorkspaceSwitcher />
              <button type="button" className="sf-icon-btn sf-header-search" aria-label="Find anything (Ctrl+K)" onClick={() => setSearchOpen(true)}><Search aria-hidden /></button>
              <Link to="/calendar" className="sf-icon-btn" aria-label="Calendar" aria-current={pathname === "/calendar" ? "page" : undefined}><CalendarDays aria-hidden /></Link>
              <Link to="/notifications" className="sf-icon-btn" aria-label="Notifications" aria-current={pathname === "/notifications" ? "page" : undefined}><Bell aria-hidden /></Link>
              <AccountMenu hidden={hidden} setHidden={setHidden} />
            </div>
          </header>}
          {!locked && <NavProgress />}
          {!locked && <DemoBanner />}
          <main id="main-content" className="sf-main uix-content" tabIndex={-1}>
            {!locked && <OfflineBanner />}
            {!locked && <StoreLoadNotice />}
            {!focused && !locked && <DraftsReminder />}
            {!focused && !locked && !ownsHeader(pathname) && <div className="sf-page sf-legacy-crumbs"><Breadcrumbs /><RecordsSubnav /></div>}
            {loading ? <PageSkeleton /> : <DeviceLock>{children}<StepUpHost /></DeviceLock>}
          </main>
        </div>

        {!focused && !locked && <nav className="sf-tabbar" aria-label="Tab bar">{BOTTOM_BAR.map((d) => item(d, "sf-tab"))}</nav>}

        <IntelligentCanvas open={smartOpen && !locked} onOpenChange={setSmartOpen} scope={preferences.homeScope === "all" ? undefined : preferences.homeScope} />
        <SearchPalette open={searchOpen && !locked} onOpenChange={setSearchOpen} />
      </div>
    </ShellContext.Provider>
  );
}
