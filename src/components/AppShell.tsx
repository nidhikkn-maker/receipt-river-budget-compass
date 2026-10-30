import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { USERS } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";

const ROLE_LABEL = { employee: "Employee", manager: "Dept. manager", finance: "Finance" };

export function AppShell({ children }: { children: ReactNode }) {
  const { user, setUserId, reset } = useStore();
  const links = [
    { to: "/", label: "Overview" },
    { to: "/new", label: "Submit expense" },
    ...(user.role !== "employee" ? [{ to: "/approvals", label: "Approvals" }] : []),
    ...(user.role !== "employee" ? [{ to: "/analytics", label: "Budgets" }] : []),
  ] as const;
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-6 px-6 py-4">
          <Link to="/" className="font-display text-2xl font-semibold tracking-tight text-primary">Ledgerline</Link>
          <nav className="flex flex-wrap gap-1 text-sm">
            {links.map((l) => (
              <Link key={l.to} to={l.to} activeOptions={{ exact: true }} className="rounded px-3 py-1.5 text-muted-foreground hover:text-foreground" activeProps={{ className: "bg-secondary !text-foreground font-medium" }}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Viewing as</span>
            <Select value={user.id} onValueChange={setUserId}>
              <SelectTrigger className="w-64" aria-label="Switch role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["employee", "manager", "finance"] as const).map((r) => (
                  <SelectGroup key={r}>
                    <SelectLabel>{ROLE_LABEL[r]}</SelectLabel>
                    {USERS.filter((u) => u.role === r).map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name} · {u.department}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={reset} title="Restore sample data">Reset</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
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
