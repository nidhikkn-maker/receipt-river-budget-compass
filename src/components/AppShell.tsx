import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BarChart3, CalendarClock, Gem, Home, Landmark, ListFilter, PiggyBank, Plus, Settings, Sparkles, Users } from "lucide-react";
import { useStore } from "@/lib/store";

const LINKS = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/expenses", label: "Activity", icon: ListFilter },
  { to: "/new", label: "Add", icon: Plus, primary: true },
  { to: "/assistant", label: "AI", icon: Sparkles },
  { to: "/reports", label: "Insights", icon: BarChart3 },
  { to: "/wealth", label: "Wealth", icon: Gem },
  { to: "/plan", label: "Plan", icon: CalendarClock },
  { to: "/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/reconcile", label: "Bank", icon: Landmark },
  { to: "/family", label: "Family", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;
// Mobile bar: the five primary sections
const MOBILE = ["/dashboard", "/expenses", "/new", "/assistant", "/reports", "/wealth"];

export function AppShell({ children }: { children: ReactNode }) {
  const { loading } = useStore();
  return (
    <div className="min-h-screen bg-background lg:pl-24">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-24 flex-col items-center gap-1 bg-ink py-6 text-ink-foreground lg:flex">
        <Link to="/dashboard" className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-hero font-display text-xl font-extrabold text-primary-foreground shadow-float">L</Link>
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="flex w-20 flex-col items-center gap-1 rounded-2xl py-2.5 text-[11px] text-ink-muted transition hover:text-ink-foreground"
            activeProps={{ className: "!text-ink-foreground bg-sidebar-accent" }}>
            <span className={"flex h-9 w-9 items-center justify-center rounded-xl " + ("primary" in l ? "bg-primary text-primary-foreground" : "")}><l.icon className="h-5 w-5" /></span>
            {l.label}
          </Link>
        ))}
      </aside>

      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-8">
          <span className="font-display text-xl font-extrabold tracking-tight text-primary">Ledgerline</span>
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground sm:inline">personal · family · business</span>
          <div className="ml-auto flex gap-1 lg:hidden">
            <Link to="/plan" aria-label="Plan" className="rounded-xl p-2 text-muted-foreground" activeProps={{ className: "!text-primary bg-secondary" }}><CalendarClock className="h-5 w-5" /></Link>
            <Link to="/budgets" aria-label="Budgets" className="rounded-xl p-2 text-muted-foreground" activeProps={{ className: "!text-primary bg-secondary" }}><PiggyBank className="h-5 w-5" /></Link>
            <Link to="/reconcile" aria-label="Bank reconciliation" className="rounded-xl p-2 text-muted-foreground" activeProps={{ className: "!text-primary bg-secondary" }}><Landmark className="h-5 w-5" /></Link>
            <Link to="/family" aria-label="Family" className="rounded-xl p-2 text-muted-foreground" activeProps={{ className: "!text-primary bg-secondary" }}><Users className="h-5 w-5" /></Link>
            <Link to="/settings" aria-label="Settings" className="rounded-xl p-2 text-muted-foreground" activeProps={{ className: "!text-primary bg-secondary" }}><Settings className="h-5 w-5" /></Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-8 lg:pb-12">
        {loading ? <p className="text-muted-foreground">Loading…</p> : children}
      </main>

      <nav className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-around rounded-3xl bg-ink px-2 py-2 text-ink-muted shadow-float lg:hidden">
        {LINKS.filter((l) => MOBILE.includes(l.to)).map((l) => (
          <Link key={l.to} to={l.to} className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px]" activeProps={{ className: "!text-ink-foreground" }}>
            {"primary" in l ? (
              <span className="-mt-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-hero text-primary-foreground shadow-float"><l.icon className="h-6 w-6" /></span>
            ) : <l.icon className="h-5 w-5" />}
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageTitle({ title, sub, eyebrow }: { title: string; sub?: string; eyebrow?: string }) {
  return (
    <div className="mb-6">
      {eyebrow && <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-primary">{eyebrow}</div>}
      <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
      {sub && <p className="mt-1 text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "business" | "personal" }) {
  return (
    <div className={"rounded-2xl border bg-card p-4 " + (tone === "business" ? "border-l-4 border-l-primary" : tone === "personal" ? "border-l-4 border-l-primary-glow" : "")}>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl sm:text-2xl">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
