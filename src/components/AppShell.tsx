import { OfflineBanner } from "@/components/OfflineBanner";
import { PageSkeleton } from "@/components/PageSkeleton";
import { NavProgress } from "@/components/NavProgress";
import { DemoBanner } from "@/components/DemoBanner";
import { DraftsReminder } from "@/components/DraftsReminder";
import { Link, useRouter, useRouterState , useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { backStep, showBackButton } from "@/lib/back-nav";
import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, Bell, Gem, Home, ListFilter, Plus, Settings, Users, Eye, EyeOff, FileText, UserRound, Inbox, Search, Plane, Menu, X, RefreshCw, CloudOff, Check, TriangleAlert } from "lucide-react";
import { DeviceLock } from "./DeviceLock";
import { LedgerlineBrand } from "./LedgerlineLogo";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { useStore } from "@/lib/store";
import { applyTheme } from "@/lib/themes";
import { ACTIVE_SCOPES, SCOPE_LABEL, type Scope } from "@/lib/expenses";
import { SmartAdd } from './SmartAdd';
import { ModuleDirectory } from './ModuleDirectory';

const PRIMARY_LINKS = [
  { to: '/dashboard', label: 'Today', icon: Home },
  { to: '/inbox', label: 'Review', icon: Inbox },
  { to: '/expenses', label: 'Activity', icon: ListFilter },
  { to: '/wealth', label: 'Wealth & Plan', icon: Gem },
  { to: '/statements', label: 'Statements', icon: FileText },
  { to: '/vault', label: 'Documents', icon: FileText },
  { to: '/trips', label: 'Travel', icon: Plane },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
] as const;

function WorkspaceSelector() {
  const { preferences, savePreferences } = useStore();
  const options: ("all" | Scope)[] = ["all", ...ACTIVE_SCOPES];
  return (
    <div className="flex min-w-0 max-w-full gap-1 overflow-x-auto pb-0.5" role="group" aria-label="Workspace">
      {options.map((s) => (
        <Button
          variant="ghost"
          key={s}
          type="button"
          onClick={() => void savePreferences({ ...preferences, homeScope: s })}
          aria-pressed={preferences.homeScope === s}
          className={"shrink-0 workspace-chip rounded-full px-3 text-sm font-medium transition " + (preferences.homeScope === s ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent")}
        >
          {s === "all" ? "All workspaces" : SCOPE_LABEL[s]}
        </Button>
      ))}
    </div>
  );
}

/** Small header pill showing whether saved figures are refreshing, current, offline or failed. Tap to refresh. */
function SyncStatus() {
  const { syncState, lastSyncedAt, pendingCount, refresh } = useStore();
  const navigate = useNavigate();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  const mins = lastSyncedAt ? Math.max(0, Math.round((Date.now() - new Date(lastSyncedAt).getTime()) / 60000)) : null;
  const label =
    syncState === "syncing" ? "Updating…" :
    syncState === "offline" ? (pendingCount > 0 ? `Offline · ${pendingCount} waiting` : "Offline · saved copy") :
    syncState === "error" ? "Couldn't update — tap to retry" :
    pendingCount > 0 ? `${pendingCount} waiting to sync` :
    mins == null || mins < 1 ? "Up to date" : `Updated ${mins} min ago`;
  const Icon = syncState === "syncing" ? RefreshCw : syncState === "offline" ? CloudOff : syncState === "error" ? TriangleAlert : Check;
  return (
    <Button
      variant="ghost"
      type="button"
      onClick={() => (pendingCount > 0 ? void navigate({ to: "/sync-queue" }) : void refresh())}
      aria-live="polite"
      title={label}
      className={"flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition " +
        (syncState === "error" ? "bg-destructive/10 text-destructive" : syncState === "offline" ? "bg-secondary text-secondary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}
    >
      <Icon className={"h-3.5 w-3.5" + (syncState === "syncing" ? " animate-spin" : "")} />
      <span className={(syncState === "error" || syncState === "offline" || pendingCount > 0 ? "max-w-24" : "sr-only sm:not-sr-only") + " truncate sm:max-w-none"}>{label}</span>
    </Button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { loading, preferences, name, savePreferences } = useStore();
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyTheme(preferences.themeName, preferences.theme, media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preferences.theme, preferences.themeName]);
  const [hidden, setHidden] = useState(false);
  // Version 4.4: the universal entry opens as a focused screen without the global header or bottom bar.
  const focused = useRouterState({ select: (st) => st.location.pathname === "/new" });
  const wideClaim = useRouterState({ select: (st) => st.location.pathname === '/claim-submission' });
  const [moreOpen, setMoreOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
  const [spacesOpen, setSpacesOpen] = useState(false);
  const useSpace = async (scope: Scope) => { await savePreferences({ ...preferences, homeScope: scope }); setSpacesOpen(false); };
  useEffect(() => { setHidden(localStorage.getItem("ll-privacy") === "1"); }, []);
  useEffect(() => { document.documentElement.classList.toggle("privacy", hidden); localStorage.setItem("ll-privacy", hidden ? "1" : "0"); }, [hidden]);
  return (
    <div className={"journal-shell uix-shell min-h-screen bg-background " + (focused ? '' : 'md:pl-52 xl:pl-64')}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-card focus:p-3">Skip to content</a>
      <aside className={"journal-rail fixed inset-y-0 left-0 z-30 hidden w-52 flex-col gap-2 overflow-y-auto bg-sidebar px-4 py-6 text-sidebar-foreground xl:w-64 " + (focused ? '' : 'md:flex')}>
        <Link to="/dashboard" aria-label="Ledgerline home" className="mb-6 shrink-0"><img src="/app-icon.png" alt="Ledgerline" width={48} height={48} className="h-12 w-12 rounded-2xl shadow-float" /></Link>
        <Button variant="ghost" className="h-11 justify-start gap-3 text-ink-muted hover:bg-sidebar-accent hover:text-ink-foreground" onClick={() => setSpacesOpen(true)}><Users className="size-[18px]" />Spaces</Button>
        <Button aria-label="Smart Add" onClick={() => setSmartOpen(true)} variant="gold" className="rail-add"><Plus className="size-5" />Add to Ledgerline</Button>
        <nav aria-label="Sidebar" className="rail-links">{PRIMARY_LINKS.map(l => <Link key={l.to} to={l.to} className="rail-link" activeProps={{ className: 'rail-link-selected', 'aria-current': 'page' }}><l.icon className="size-5" />{l.label}</Link>)}</nav>
        <Button variant="ghost" className="rail-more" aria-label="More modules" onClick={() => setMoreOpen(true)}><Menu className="size-5" />More</Button>
        <Link to="/settings" className="rail-link mt-auto"><Settings className="size-5" />Settings</Link>
      </aside>

      <header hidden={focused} className="uix-header sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center gap-1 px-4 py-2.5 sm:px-8">
          <Link to="/dashboard" aria-label="Ledgerline home" className="flex items-center"><LedgerlineBrand /></Link>
          <div className="ml-auto flex items-center">
            <SyncStatus />
            <Button size="icon" variant="ghost" aria-label="Smart Add" title="Smart Add" className="hidden sm:inline-flex lg:hidden" onClick={() => setSmartOpen(true)}><Plus className="size-5" /></Button>
            <Link to="/search" aria-label="Search" className="header-search rounded-xl p-3 text-muted-foreground transition hover:text-foreground"><span className="hidden xl:inline">Search Ledgerline</span><Search className="h-5 w-5" /></Link>
            <Link to="/inbox" aria-label="Notifications" className="rounded-xl p-3 text-muted-foreground transition hover:text-foreground"><Bell className="h-5 w-5" /></Link>
            <Button size="icon" variant="ghost" onClick={() => setHidden((h) => !h)} aria-label={hidden ? "Show amounts" : "Hide amounts"} className="rounded-xl text-muted-foreground">{hidden ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</Button>
            <Link to="/auth" aria-label={name ? `Account: ${name}` : "Account"} title={name || "Account"} className="rounded-xl p-3 text-muted-foreground transition hover:text-foreground"><UserRound className="h-5 w-5" /></Link>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-2 sm:px-8">
          <WorkspaceSelector />
        </div>
      </header>

      <NavProgress />
      <DemoBanner />
      <main id="main-content" className={focused ? "uix-content uix-entry mx-auto max-w-5xl px-4 pb-6 pt-2 sm:px-8" : wideClaim ? 'uix-content mx-auto max-w-[1800px] px-4 pb-[calc(8.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-8 md:pb-12' : "uix-content mx-auto max-w-[1440px] px-4 pb-[calc(8.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-8 md:pb-12"}>
        {!focused && <BackButton />}
        {!loading && <OfflineBanner />}
        {!focused && !loading && <DraftsReminder />}
        {loading ? <PageSkeleton /> : <DeviceLock>{children}</DeviceLock>}
      </main>

      <nav hidden={focused} aria-label="Primary" className="journal-bottom fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 text-muted-foreground md:hidden">
        <Link to="/dashboard" className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-semibold" activeProps={{ className: "!text-primary bg-secondary" }}>
          <Home className="h-5 w-5" />Today
        </Link>
        <Button variant="ghost" onClick={() => setSpacesOpen(true)} aria-label="Spaces" aria-expanded={spacesOpen} className="h-12 flex-1 flex-col gap-0.5 text-[10px] text-ink-muted hover:bg-sidebar-accent hover:text-ink-foreground"><Users className="h-5 w-5" />Spaces</Button>
        <Button variant="ghost" aria-label="Smart Add" title="Smart Add" onClick={() => setSmartOpen(true)} className="-mt-5 h-14 w-14 shrink-0 rounded-full bg-gold text-gold-foreground shadow-gold hover:bg-gold hover:text-gold-foreground"><Plus className="h-7 w-7" /></Button>
        <Link to="/inbox" className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-semibold" activeProps={{ className: "!text-primary bg-secondary" }}>
          <Inbox className="h-5 w-5" />Review
        </Link>
        <Button variant="ghost" onClick={() => setMoreOpen(true)} aria-label="More modules" aria-expanded={moreOpen} className="h-12 flex-1 flex-col gap-0.5 text-[10px] text-ink-muted hover:bg-sidebar-accent hover:text-ink-foreground">
          <Menu className="h-5 w-5" />More
        </Button>
      </nav>

      <SmartAdd open={smartOpen} onOpenChange={setSmartOpen} scope={preferences.homeScope === 'all' ? undefined : preferences.homeScope} />
      <Dialog open={spacesOpen} onOpenChange={setSpacesOpen}>
        <DialogContent className="journal-spaces native-sheet sm:max-w-md"><DialogHeader><DialogTitle>Spaces</DialogTitle></DialogHeader>
          <WorkspaceSelector />
          <div className="divide-y">
          {ACTIVE_SCOPES.map(s => <Button key={s} variant="ghost" aria-pressed={preferences.homeScope === s} className="h-16 w-full justify-between rounded-none px-1" onClick={async () => { await useSpace(s); }}><span className="flex items-center gap-3"><Users className="size-5 text-gold-strong" /><span>{SCOPE_LABEL[s]}</span></span><ArrowRight className="size-4" /></Button>)}
          <Link to="/trips" onClick={() => setSpacesOpen(false)} className="flex min-h-16 items-center justify-between text-sm"><span className="flex items-center gap-3"><Plane className="size-5 text-gold-strong" />Travel</span><ArrowRight className="size-4" /></Link>
          <Link to="/wealth" onClick={() => setSpacesOpen(false)} className="flex min-h-16 items-center justify-between text-sm"><span className="flex items-center gap-3"><Gem className="size-5 text-gold-strong" />Investments</span><ArrowRight className="size-4" /></Link>
          </div>
          <Link to="/expenses" onClick={() => setSpacesOpen(false)} className="flex min-h-12 items-center gap-3 border-b text-sm"><ListFilter className="size-5 text-primary" />Journal</Link>
          <Link to="/entities" onClick={() => setSpacesOpen(false)} className="flex min-h-12 items-center gap-3 text-sm"><Users className="size-5 text-primary" />Companies & years</Link>
          <Button onClick={() => { setSpacesOpen(false); setSmartOpen(true); }}><Plus className="size-4" />Add to this space</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="native-sheet max-h-[85dvh] overflow-y-auto sm:max-w-2xl" aria-label="All modules">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">All modules
              <Button size="icon" variant="ghost" aria-label="Close" onClick={() => setMoreOpen(false)}><X className="h-5 w-5" /></Button>
            </DialogTitle>
          </DialogHeader>
          <ModuleDirectory onNavigate={() => setMoreOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PageTitle({ title, sub, eyebrow }: { title: string; sub?: string; eyebrow?: string }) {
  return (
    <div className="uix-page-title mb-6 sm:mb-8">
      {eyebrow && <div className="mb-0.5 text-xs font-medium text-primary">{eyebrow}</div>}
      <h1 className="font-display text-3xl font-semibold sm:text-4xl">{title}</h1>
      {sub && <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "business" | "personal" }) {
  return (
    <div className={"uix-stat @container h-full min-w-0 overflow-hidden border-b bg-transparent py-4 " + (tone === "business" ? "border-l-primary" : tone === "personal" ? "border-l-primary-glow" : "border-l-gold")}>
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 whitespace-nowrap font-mono text-[min(1.5rem,9.5cqw)] font-semibold tracking-tight text-foreground" title={value}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

// Forward steps available after going back; any fresh navigation clears them, like a browser.
let forwardSteps = 0;

function BackButton() {
  const router = useRouter();
  const path = useRouterState({ select: (st) => st.location.pathname });
  const [canForward, setCanForward] = useState(forwardSteps > 0);
  useEffect(() => router.history.subscribe(({ action }) => {
    if (action.type === "BACK") forwardSteps++;
    else if (action.type === "FORWARD") forwardSteps = Math.max(0, forwardSteps - 1);
    else if (action.type === "PUSH") forwardSteps = 0;
    setCanForward(forwardSteps > 0);
  }), [router]);
  const back = () => {
    const step = backStep(router.history.canGoBack(), window.history.length);
    if (step === "router") router.history.back();
    else if (step === "browser") window.history.back();
    else void router.navigate({ to: "/dashboard" });
  };
  // Swipe right from the left edge goes back on phones and tablets.
  useEffect(() => {
    let x = -1, y = 0;
    const start = (e: TouchEvent) => { const t = e.touches[0]; x = t && t.clientX < 24 ? t.clientX : -1; y = t?.clientY ?? 0; };
    const end = (e: TouchEvent) => { const t = e.changedTouches[0]; if (x >= 0 && t && t.clientX - x > 80 && Math.abs(t.clientY - y) < 60 && showBackButton(window.location.pathname)) back(); x = -1; };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchend", end, { passive: true });
    return () => { window.removeEventListener("touchstart", start); window.removeEventListener("touchend", end); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!showBackButton(path)) return null;
  const btn = "inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-95";
  return (
    <nav aria-label="Page history" className="-ml-2.5 mb-2 flex items-center gap-1">
      <Button variant="ghost" type="button" aria-label="Back" onClick={back} className={btn}><ArrowLeft className="size-[18px]" /> Back</Button>
      {canForward && <Button variant="ghost" type="button" aria-label="Forward" onClick={() => router.history.forward()} className={btn}>Forward <ArrowRight className="size-[18px]" /></Button>}
    </nav>
  );
}
