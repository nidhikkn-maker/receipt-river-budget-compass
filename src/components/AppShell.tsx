import { FilePen } from "lucide-react";
import { DraftsReminder } from "@/components/DraftsReminder";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, Bell, CalendarClock, Gem, Home, Landmark, ListFilter, PiggyBank, Plus, Settings, Sparkles, Users, Eye, EyeOff, FileText, UserRound, TrendingUp, Inbox, HeartPulse, Search, SlidersHorizontal, Split, Network, Plane, Wallet, Bot, Menu, X, MessageCircleQuestion } from "lucide-react";
import { DeviceLock } from "./DeviceLock";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { useStore } from "@/lib/store";
import { applyTheme } from "@/lib/themes";
import { SCOPES, SCOPE_LABEL, type Scope } from "@/lib/expenses";

const LINKS = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/expenses", label: "Activity", icon: ListFilter },
  { to: "/new", label: "Add", icon: Plus, primary: true },
  { to: "/assistant", label: "AI", icon: Sparkles },
  { to: "/reports", label: "Insights", icon: BarChart3 },
  { to: "/wealth", label: "Wealth", icon: Gem },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/review", label: "Review", icon: HeartPulse },
  { to: "/plan", label: "Plan", icon: CalendarClock },
  { to: "/forecast", label: "Predict", icon: TrendingUp },
  { to: "/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/reconcile", label: "Bank", icon: Landmark },
  { to: "/search", label: "Search", icon: Search },
  { to: "/rules", label: "Rules", icon: SlidersHorizontal },
  { to: "/allocation", label: "Allocate", icon: Split },
  { to: "/connections", label: "Links", icon: Network },
  { to: "/family", label: "Family", icon: Users },
  { to: "/trips", label: "Trips", icon: Plane },
  { to: "/vault", label: "Vault", icon: FileText },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

/** "More" sheet groups: every module stays reachable, organised by purpose. */
const MORE_GROUPS: { title: string; items: { to: string; label: string; icon: typeof Home }[] }[] = [
  { title: "Money", items: [
    { to: "/plan", label: "Plan & calendar", icon: CalendarClock },
    { to: "/budgets", label: "Budgets", icon: PiggyBank },
    { to: "/forecast", label: "Forecast", icon: TrendingUp },
    { to: "/allocation", label: "Money allocation", icon: Split },
    { to: "/rules", label: "Financial rules", icon: SlidersHorizontal },
  ] },
  { title: "Activity", items: [
    { to: "/drafts", label: "Drafts", icon: FilePen },
    { to: "/inbox", label: "Financial inbox", icon: Inbox },
    { to: "/review", label: "Monthly review", icon: HeartPulse },
    { to: "/reconcile", label: "Import & reconcile", icon: Landmark },
    { to: "/search", label: "Search everything", icon: Search },
    { to: "/vault", label: "Document vault", icon: FileText },
  ] },
  { title: "Insights", items: [
    { to: "/report-centre", label: "Reports Centre (PDF)", icon: FileText },
    { to: "/reports", label: "Reports", icon: BarChart3 },
    { to: "/brief", label: "Weekly brief", icon: Sparkles },
    { to: "/strategy", label: "What if…", icon: MessageCircleQuestion },
    { to: "/connections", label: "Money map", icon: Network },
  ] },
  { title: "Workspaces & travel", items: [
    { to: "/trips", label: "Travel Manager", icon: Plane },
    { to: "/family", label: "Family", icon: Users },
    { to: "/wealth", label: "Wealth & accounts", icon: Gem },
  ] },
  { title: "Account", items: [
    { to: "/settings", label: "Settings & backup", icon: Settings },
    { to: "/payment-methods", label: "Payment methods", icon: Wallet },
    { to: "/assistants", label: "Connected assistants", icon: Bot },
  ] },
];

function WorkspaceSelector() {
  const { preferences, savePreferences } = useStore();
  const options: ("all" | Scope)[] = ["all", ...SCOPES];
  return (
    <div className="flex min-w-0 max-w-full gap-1 overflow-x-auto pb-0.5" role="group" aria-label="Workspace">
      {options.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => void savePreferences({ ...preferences, homeScope: s })}
          aria-pressed={preferences.homeScope === s}
          className={"shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition " + (preferences.homeScope === s ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent")}
        >
          {s === "all" ? "All workspaces" : SCOPE_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { loading, preferences, name } = useStore();
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
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => { setHidden(localStorage.getItem("ll-privacy") === "1"); }, []);
  useEffect(() => { document.documentElement.classList.toggle("privacy", hidden); localStorage.setItem("ll-privacy", hidden ? "1" : "0"); }, [hidden]);
  return (
    <div className="min-h-screen bg-background lg:pl-24">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-24 flex-col items-center gap-1 overflow-y-auto bg-ink py-6 text-ink-foreground lg:flex">
        <Link to="/dashboard" className="mb-6 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-hero font-display text-xl font-extrabold text-ink-foreground shadow-float">L</Link>
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="flex w-20 flex-col items-center gap-1 rounded-2xl py-2.5 text-[11px] font-semibold text-ink-muted transition hover:text-ink-foreground"
            activeProps={{ className: "!text-gold bg-sidebar-accent ring-1 ring-gold" }}>
            <span className={"flex h-9 w-9 items-center justify-center rounded-xl " + ("primary" in l ? "bg-gold text-gold-foreground shadow-gold" : "")}><l.icon className="h-5 w-5" /></span>
            {l.label}
          </Link>
        ))}
      </aside>

      <header hidden={focused} className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2.5 sm:px-8">
          <Link to="/dashboard" className="font-brand text-xl font-bold tracking-tight text-primary">Ledgerline<span className="text-gold">.</span></Link>
          <div className="ml-auto flex items-center">
            <Link to="/search" aria-label="Search" className="rounded-xl p-2 text-muted-foreground transition hover:text-foreground"><Search className="h-5 w-5" /></Link>
            <Link to="/inbox" aria-label="Notifications" className="rounded-xl p-2 text-muted-foreground transition hover:text-foreground"><Bell className="h-5 w-5" /></Link>
            <Button size="icon" variant="ghost" onClick={() => setHidden((h) => !h)} aria-label={hidden ? "Show amounts" : "Hide amounts"} className="rounded-xl text-muted-foreground">{hidden ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</Button>
            <Link to="/auth" aria-label={name ? `Account: ${name}` : "Account"} title={name || "Account"} className="rounded-xl p-2 text-muted-foreground transition hover:text-foreground"><UserRound className="h-5 w-5" /></Link>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-2 sm:px-8">
          <WorkspaceSelector />
        </div>
      </header>

      <main className={focused ? "mx-auto max-w-3xl px-4 pb-6 pt-2 sm:px-8" : "mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-8 lg:pb-12"}>
        {!focused && !loading && <DraftsReminder />}
        {loading ? <p className="text-muted-foreground">Loading…</p> : <DeviceLock>{children}</DeviceLock>}
      </main>

      <nav hidden={focused} aria-label="Primary" className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-around rounded-3xl bg-ink px-2 py-2 text-ink-muted shadow-float backdrop-blur-xl lg:hidden">
        <Link to="/dashboard" className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-semibold" activeProps={{ className: "!text-gold" }}>
          <Home className="h-5 w-5" />Home
        </Link>
        <Link to="/expenses" className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-semibold" activeProps={{ className: "!text-gold" }}>
          <ListFilter className="h-5 w-5" />Activity
        </Link>
        <Link to="/new" aria-label="Add entry" className="flex flex-1 flex-col items-center">
          <span className="-mt-8 flex h-14 w-14 items-center justify-center rounded-full bg-gold-hero text-gold-foreground shadow-gold transition active:scale-95"><Plus className="h-7 w-7" /></span>
        </Link>
        <Link to="/assistant" className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-semibold" activeProps={{ className: "!text-gold" }}>
          <Sparkles className="h-5 w-5" />AI
        </Link>
        <button type="button" onClick={() => setMoreOpen(true)} aria-label="More modules" aria-expanded={moreOpen} className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-semibold">
          <Menu className="h-5 w-5" />More
        </button>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg" aria-label="All modules">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">All modules
              <Button size="icon" variant="ghost" aria-label="Close" onClick={() => setMoreOpen(false)}><X className="h-5 w-5" /></Button>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pb-2">
            {MORE_GROUPS.map((g) => (
              <div key={g.title}>
                <div className="mb-1.5 font-mono text-[11px] font-semibold text-muted-foreground">{g.title}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {g.items.map((item) => (
                    <Link key={item.to} to={item.to} onClick={() => setMoreOpen(false)} className="flex items-center gap-2.5 rounded-2xl border bg-card px-3 py-2.5 text-sm font-semibold transition hover:bg-accent" activeProps={{ className: "ring-1 ring-gold" }}>
                      <item.icon className="h-4 w-4 shrink-0 text-primary" />{item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PageTitle({ title, sub, eyebrow }: { title: string; sub?: string; eyebrow?: string }) {
  return (
    <div className="mb-6">
      {eyebrow && <div className="mb-1 font-mono text-[11px] font-semibold text-primary">{eyebrow}</div>}
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      <span className="mt-2 block h-[3px] w-20 rounded-full bg-gold-hero" aria-hidden="true" />
      {sub && <p className="mt-2 font-medium text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "business" | "personal" }) {
  return (
    <div className={"min-w-0 rounded-2xl border border-l-4 bg-card p-4 " + (tone === "business" ? "border-l-primary" : tone === "personal" ? "border-l-primary-glow" : "border-l-gold")}>
      <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 break-all font-mono text-xl font-semibold text-gold-strong sm:text-2xl">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
