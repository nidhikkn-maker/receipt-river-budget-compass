import { createFileRoute, Link } from "@tanstack/react-router";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Stat } from "@/components/AppShell";
import { ExpenseTable } from "@/components/ExpenseTable";
import { money, totalsByMember, totalsByScope } from "@/lib/expenses";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Home — Ledgerline" },
      { name: "description", content: "Your personal, family and business spending at a glance." },
      { property: "og:title", content: "Home — Ledgerline" },
      { property: "og:description", content: "Your personal, family and business spending at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { expenses, members, memberName } = useStore();
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = expenses.filter((e) => e.date.startsWith(month));
  const t = totalsByScope(thisMonth);
  const byMember = totalsByMember(thisMonth);
  const memberRows = [{ id: "me", name: "Me" }, ...members].map((m) => ({ name: m.id === "me" ? "Me" : memberName(m.id), value: byMember[m.id] ?? 0 })).filter((r) => r.value > 0);
  const unmatched = expenses.filter((e) => !e.reconciledAt && ["upi", "credit_card", "debit_card", "forex_card", "bank_transfer"].includes(e.paymentMethod)).length;
  const pct = t.total ? Math.round((t.business / t.total) * 100) : 0;

  return (
    <>
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-hero p-6 text-primary-foreground shadow-float sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border-[28px] border-primary-foreground/10" />
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] opacity-80">{new Date().toLocaleString("en", { month: "long", year: "numeric" })}</div>
        <div className="mt-1 font-display text-4xl font-extrabold tracking-tight sm:text-6xl">{money(t.total)}</div>
        <div className="text-sm opacity-80">spent this month</div>
        <div className="mt-6 sm:max-w-md">
          <div className="flex h-3 overflow-hidden rounded-full bg-primary-foreground/20">
            <div className="bg-primary-foreground" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span><b className="font-mono">{money(t.business)}</b> business</span>
            <span><b className="font-mono">{money(t.personal)}</b> personal</span>
          </div>
        </div>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="business" label="Business (all time)" value={money(totalsByScope(expenses).business)} />
        <Stat tone="personal" label="Personal (all time)" value={money(totalsByScope(expenses).personal)} />
        <Stat label="Expenses this month" value={String(thisMonth.length)} />
        <Link to="/reconcile"><Stat label="Not yet matched to bank" value={String(unmatched)} hint="Tap to reconcile" /></Link>
      </div>

      {memberRows.length > 0 && (
        <div className="mb-8 rounded-3xl border bg-card p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Who spent this month</h2>
            <Link to="/family" className="text-sm text-primary">Manage family</Link>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={memberRows}>
              <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: "var(--secondary)" }} formatter={(v: number) => money(v)} />
              <Bar dataKey="value" fill="var(--chart-1)" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">Recent</h2>
        <Link to="/expenses" className="text-sm text-primary">See all</Link>
      </div>
      <ExpenseTable items={expenses.slice(0, 6)} empty="No expenses yet — tap Add to scan your first bill." />
    </>
  );
}
