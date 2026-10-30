import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABEL } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useStore();
  const nav = useNavigate();
  const qc = useQueryClient();
  const reviewer = user.role !== "employee";
  const links = [
    { to: "/dashboard", label: "Overview" },
    { to: "/new", label: "Submit expense" },
    ...(reviewer ? [{ to: "/approvals", label: "Approvals" }, { to: "/analytics", label: "Budgets" }] : []),
    { to: "/reports", label: "Reports" },
  ] as const;
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  };
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-6 px-6 py-4">
          <Link to="/dashboard" className="font-display text-2xl font-semibold tracking-tight text-primary">Ledgerline</Link>
          <nav className="flex flex-wrap gap-1 text-sm">
            {links.map((l) => (
              <Link key={l.to} to={l.to} className="rounded px-3 py-1.5 text-muted-foreground hover:text-foreground" activeProps={{ className: "bg-secondary !text-foreground font-medium" }}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {!loading && (
              <div className="text-right leading-tight">
                <div className="font-medium">{user.name}</div>
                <div className="text-xs text-muted-foreground">{ROLE_LABEL[user.role]} · {user.department}</div>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{loading ? <p className="text-muted-foreground">Loading…</p> : children}</main>
    </div>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-4xl font-medium tracking-tight">{title}</h1>
      {sub && <p className="mt-1 text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
