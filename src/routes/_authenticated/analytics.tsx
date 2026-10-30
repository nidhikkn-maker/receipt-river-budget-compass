import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend, XAxis, YAxis } from "recharts";
import { PageTitle, Stat } from "@/components/AppShell";
import { CATEGORIES, DEPARTMENTS, departmentSpend, money } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Department budgets — Ledgerline" },
      { name: "description", content: "Budget usage and spend analytics by department and category." },
      { property: "og:title", content: "Department budgets — Ledgerline" },
      { property: "og:description", content: "Budget usage and spend analytics by department and category." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Analytics,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)", "var(--accent)"];

function Analytics() {
  const { user, expenses } = useStore();
  if (user.role === "employee") return <PageTitle title="Budgets" sub="Switch to a manager or finance role to view analytics." />;
  const depts = user.role === "manager" ? [user.department] : DEPARTMENTS;
  const scoped = expenses.filter((e) => depts.includes(e.department) && e.status !== "rejected");
  const rows = depts.map((d) => ({ dept: d, ...departmentSpend(expenses, d) }));
  const byCat = CATEGORIES.map((c) => ({ name: c, value: scoped.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0) })).filter((x) => x.value > 0);
  const totals = rows.reduce((a, r) => ({ c: a.c + r.committed, p: a.p + r.pending, b: a.b + r.budget }), { c: 0, p: 0, b: 0 });
  const outstanding = scoped.filter((e) => e.status === "approved").reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <PageTitle title="Department budgets" sub={user.role === "manager" ? `${user.department} this period` : "All departments this period"} />
      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <Stat label="Budget" value={money(totals.b)} />
        <Stat label="Committed" value={money(totals.c)} hint={`${Math.round((totals.c / totals.b) * 100)}% used`} />
        <Stat label="In pipeline" value={money(totals.p)} />
        <Stat label="Owed to employees" value={money(outstanding)} />
      </div>

      <div className="mb-8 space-y-4 rounded-md border bg-card p-6">
        {rows.map((r) => {
          const cp = (r.committed / r.budget) * 100;
          const pp = (r.pending / r.budget) * 100;
          const over = cp + pp > 100;
          return (
            <div key={r.dept}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium">{r.dept}</span>
                <span className={cn("font-mono", over && "text-destructive")}>
                  {money(r.committed)} <span className="text-muted-foreground">+ {money(r.pending)} pending / {money(r.budget)}</span>
                </span>
              </div>
              <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                <div className="bg-primary" style={{ width: `${Math.min(cp, 100)}%` }} />
                <div className="bg-warning" style={{ width: `${Math.min(pp, 100 - Math.min(cp, 100))}%` }} />
              </div>
            </div>
          );
        })}
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded bg-primary" /> Approved / paid</span>
          <span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded bg-warning" /> Pending</span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-md border bg-card p-6">
          <h3 className="mb-4 font-display text-lg">Spend vs budget</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="dept" fontSize={12} />
              <YAxis fontSize={12} tickFormatter={(v) => `$${v / 1000}k`} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Bar dataKey="budget" name="Budget" fill="var(--secondary)" stroke="var(--border)" />
              <Bar dataKey="committed" name="Committed" fill="var(--chart-1)" />
              <Bar dataKey="pending" name="Pending" fill="var(--chart-2)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-md border bg-card p-6">
          <h3 className="mb-4 font-display text-lg">By category</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={byCat} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95}>
                {byCat.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => money(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
