import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BarChart3, CheckCheck, FileDown, Home, Landmark, LogOut, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABEL } from "@/lib/expenses";
import { useStore } from "@/lib/store";

function useLinks() {
  const { user } = useStore();
  const reviewer = user.role !== "employee";
  return [
    { to: "/dashboard", label: "Home", icon: Home },
    ...(reviewer ? [{ to: "/approvals", label: "Approvals", icon: CheckCheck }] : []),
    { to: "/new", label: "New", icon: Plus, primary: true },
    ...(reviewer ? [{ to: "/analytics", label: "Budgets", icon: BarChart3 }] : []),
    ...(user.role === "finance" ? [{ to: "/reconcile", label: "Reconcile", icon: Landmark }] : []),
    { to: "/reports", label: "Reports", icon: FileDown },
  ] as const;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useStore();
  const links = useLinks();
  const nav = useNavigate();
  const qc = useQueryClient();
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  };
  const initials = user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background lg:pl-24">
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-24 flex-col items-center gap-2 bg-ink py-6 text-ink-foreground lg:flex">
        <Link to="/dashboard" className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-hero font-display text-xl font-extrabold text-primary-foreground shadow-float">L</Link>
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="group flex w-20 flex-col items-center gap-1 rounded-2xl py-2.5 text-[11px] text-ink-muted transition hover:text-ink-foreground"
            activeProps={{ className: "!text-ink-foreground bg-sidebar-accent" }}>
            <span className={"flex h-9 w-9 items-center justify-center rounded-xl " + ("primary" in l ? "bg-primary text-primary-foreground" : "")}>
              <l.icon className="h-5 w-5" />
            </span>
            {l.label}
          </Link>
        ))}
        <button onClick={signOut} className="mt-auto flex flex-col items-center gap-1 text-[11px] text-ink-muted hover:text-ink-foreground">
          <LogOut className="h-5 w-5" /> Sign out
        </button>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-8">
          <span className="font-display text-xl font-extrabold tracking-tight text-primary lg:hidden">Ledgerline</span>
          <div className="ml-auto flex items-center gap-3">
            {!loading && (
              <div className="text-right leading-tight">
                <div className="text-sm font-semibold">{user.name}</div>
                <div className="text-xs text-muted-foreground">{ROLE_LABEL[user.role]} · {user.department}</div>
              </div>
            )}
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-hero text-xs font-bold text-primary-foreground">{initials}</div>
            <button onClick={signOut} aria-label="Sign out" className="text-muted-foreground lg:hidden"><LogOut className="h-5 w-5" /></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-8 lg:pb-12">
        {loading ? <p className="text-muted-foreground">Loading…</p> : children}
      </main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-around rounded-3xl bg-ink px-2 py-2 text-ink-muted shadow-float lg:hidden">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px]" activeProps={{ className: "!text-ink-foreground" }}>
            {"primary" in l ? (
              <span className="-mt-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-hero text-primary-foreground shadow-float"><l.icon className="h-6 w-6" /></span>
            ) : (
              <l.icon className="h-5 w-5" />
            )}
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

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl sm:text-2xl">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
