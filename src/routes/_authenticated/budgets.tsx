import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, budgetUsage, money, totalsBy, type Category } from "@/lib/expenses";
import { ScopedBudgets } from "@/components/ScopedBudgets";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/budgets")({
  head: () => ({
    meta: [
      { title: "Budgets — Ledgerline" },
      { name: "description", content: "Set monthly budgets per category and see where the money goes." },
      { property: "og:title", content: "Budgets — Ledgerline" },
      { property: "og:description", content: "Set monthly budgets per category and see where the money goes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Budgets,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function Budgets() {
  const { expenses, budgets, setBudget, preferences } = useStore();
  const month = new Date().toISOString().slice(0, 7);
  const rows = budgetUsage(expenses, budgets, month);
  const [cat, setCat] = useState<Category>("Groceries");
  const [amt, setAmt] = useState("");
  const byCat = Object.entries(totalsBy(expenses.filter((e) => e.date.startsWith(month)), (e) => e.category)).map(([name, value]) => ({ name, value }));

  const save = async (c: Category, v: string) => {
    try { await setBudget(c, Number(v)); toast.success(`${c} budget saved`); setAmt(""); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <>
      <PageTitle eyebrow="Budgets" title="Monthly limits" sub="Set a monthly budget per category — business and personal combined." />
      <ScopedBudgets />
      <div className="mb-6 grid gap-3 rounded-3xl border bg-card p-5 sm:grid-cols-[1fr_1fr_auto]">
        <Select value={cat} onValueChange={(v) => { setCat(v as Category); setAmt(String(budgets[v as Category] ?? "")); }}>
          <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
          <SelectContent>{preferences.categories.filter(c=>!c.archived).map(c=>c.name).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Input aria-label="Monthly budget" type="number" min="0" step="100" placeholder="Monthly amount (₹)" className="font-mono" value={amt} onChange={(e) => setAmt(e.target.value)} />
        <Button onClick={() => save(cat, amt)} disabled={amt === ""}>Save budget</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          {rows.length === 0 && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No budgets or spending yet this month.</p>}
          {rows.map((r) => {
            const pct = r.budget ? (r.spent / r.budget) * 100 : 0;
            const over = r.budget > 0 && r.spent > r.budget;
            return (
              <div key={r.category} className="rounded-2xl border bg-card p-4">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <button className="font-semibold hover:text-primary" onClick={() => { setCat(r.category); setAmt(String(r.budget || "")); }}>{r.category}</button>
                  <span className={cn("font-mono text-sm", over && "text-destructive")}>{money(r.spent)} <span className="text-muted-foreground">/ {r.budget ? money(r.budget) : "no budget"}</span></span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-gold")} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                {r.budget > 0 && <div className="mt-1 text-xs text-muted-foreground">{over ? `${money(r.spent - r.budget)} over` : `${money(r.budget - r.spent)} left`}</div>}
              </div>
            );
          })}
        </div>
        <div className="rounded-3xl border bg-card p-5">
          <h3 className="mb-2 font-display text-lg font-bold">This month by category</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={byCat} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                {byCat.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => money(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
