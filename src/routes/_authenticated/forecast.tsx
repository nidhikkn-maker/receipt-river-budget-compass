import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Lightbulb } from "lucide-react";
import { PageTitle, Stat } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { todayISO, usePosition } from "@/lib/use-position";
import { monthlySeries } from "@/lib/insights";
import { advice, categoryBaseline, inflationFor, project, realValue } from "@/lib/projection";

export const Route = createFileRoute("/_authenticated/forecast")({
  head: () => ({ meta: [
    { title: "10-year prediction — Ledgerline" },
    { name: "description", content: "Project inflation, category spending and savings for the next 10 years with suggestions." },
    { property: "og:title", content: "10-year prediction — Ledgerline" },
    { property: "og:description", content: "Where your expenses and savings could be in 10 years, and what to do now." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Forecast,
});

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--gold)"];
const short = (n: number) => n >= 1e7 ? `₹${(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)}L` : `₹${Math.round(n / 1000)}k`;

function Forecast() {
  const { expenses, transactions } = useStore();
  const pos = usePosition();
  const today = todayISO();
  const series = monthlySeries(transactions, today, 6);
  const withData = series.filter(m => m.income > 0 || m.spent > 0);
  const avgIncome = withData.length ? withData.reduce((s, m) => s + m.income, 0) / withData.length : 0;
  const from = `${series[0]?.month ?? today.slice(0, 7)}-01`;
  const baseline = useMemo(() => categoryBaseline(expenses.map(e => ({ category: e.category, amount: e.amount, date: e.date })), from, today), [expenses, from, today]);
  const [a, setA] = useState({ years: 10, generalInflation: 6, incomeGrowth: 7, savingsReturn: 8, income: "" as string, savings: "" as string });
  const [over, setOver] = useState<Record<string, number>>({});
  const input = { categories: baseline, monthlyIncome: a.income === "" ? Math.round(avgIncome) : Number(a.income), currentSavings: a.savings === "" ? Math.max(0, pos.netWorth.net) : Number(a.savings), years: a.years, generalInflation: a.generalInflation, incomeGrowth: a.incomeGrowth, savingsReturn: a.savingsReturn, overrides: over };
  const rows = project(input);
  const last = rows[rows.length - 1];
  const tips = advice(input, rows);
  const top = baseline.slice(0, 6).map(c => c.category);
  const num = (k: keyof typeof a) => (e: React.ChangeEvent<HTMLInputElement>) => setA({ ...a, [k]: k === "income" || k === "savings" ? e.target.value : Math.max(k === "years" ? 1 : 0, Math.min(k === "years" ? 30 : 30, Number(e.target.value) || 0)) });

  return <>
    <PageTitle eyebrow="Prediction" title={`Your next ${a.years} years`} />
    <p className="mb-4 text-sm text-muted-foreground">Based on your average spending per category over the last 6 months, compounded at typical Indian inflation rates. Change any assumption below. This is an estimate, not financial advice.</p>
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {([["years", "Years"], ["generalInflation", "Inflation %/yr"], ["incomeGrowth", "Income growth %"], ["savingsReturn", "Savings return %"]] as const).map(([k, l]) => <div key={k} className="grid gap-1"><Label htmlFor={`f-${k}`}>{l}</Label><Input id={`f-${k}`} type="number" step="0.5" value={a[k]} onChange={num(k)} /></div>)}
      <div className="grid gap-1"><Label htmlFor="f-income">Monthly income</Label><Input id="f-income" type="number" placeholder={String(Math.round(avgIncome))} value={a.income} onChange={num("income")} /></div>
      <div className="grid gap-1"><Label htmlFor="f-sav">Savings today</Label><Input id="f-sav" type="number" placeholder={String(Math.max(0, Math.round(pos.netWorth.net)))} value={a.savings} onChange={num("savings")} /></div>
    </div>
    {!baseline.length ? <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">Add a few months of expenses to see predictions.</p> : last && <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Yearly spend today" value={money(rows[0]!.spend)} />
        <Stat label={`Yearly spend in year ${a.years}`} value={money(last.spend)} hint={`${(last.spend / Math.max(1, rows[0]!.spend)).toFixed(1)}× today`} />
        <Stat label={`Savings in year ${a.years}`} value={money(last.savings)} hint={`Worth ${money(realValue(last.savings, a.generalInflation, a.years))} in today's money`} />
        <Stat label="₹1 lakh today buys" value={money(realValue(100000, a.generalInflation, a.years))} hint={`of goods in year ${a.years}`} />
      </div>
      <section className="mb-6 rounded-3xl border bg-card p-4"><h2 className="mb-2 font-display text-lg font-bold">Spending vs income vs savings</h2>
        <div className="h-64"><ResponsiveContainer><AreaChart data={rows.map(r => ({ ...r, label: `Y${r.year}` }))}><XAxis dataKey="label" fontSize={11} /><YAxis tickFormatter={short} fontSize={11} width={56} /><Tooltip formatter={(v: number) => money(v)} /><Legend /><Area dataKey="income" name="Income" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.15} /><Area dataKey="spend" name="Spending" stroke="var(--destructive)" fill="var(--destructive)" fillOpacity={0.15} /><Area dataKey="savings" name="Savings (with returns)" stroke="var(--gold)" fill="var(--gold)" fillOpacity={0.2} /></AreaChart></ResponsiveContainer></div>
      </section>
      <section className="mb-6 rounded-3xl border bg-card p-4"><h2 className="mb-2 font-display text-lg font-bold">Category costs per year</h2>
        <div className="h-64"><ResponsiveContainer><BarChart data={rows.map(r => ({ label: `Y${r.year}`, ...r.byCategory }))}><XAxis dataKey="label" fontSize={11} /><YAxis tickFormatter={short} fontSize={11} width={56} /><Tooltip formatter={(v: number) => money(v)} /><Legend />{top.map((c, i) => <Bar key={c} dataKey={c} stackId="a" fill={PALETTE[i]} />)}</BarChart></ResponsiveContainer></div>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Category</th><th>Inflation %</th><th className="text-right">Now / yr</th><th className="text-right">Year {a.years}</th></tr></thead><tbody>
          {baseline.map(c => <tr key={c.category} className="border-t"><td className="py-1.5">{c.category}</td><td><Input aria-label={`${c.category} inflation`} className="h-8 w-20" type="number" step="0.5" value={inflationFor(c.category, a.generalInflation, over)} onChange={e => setOver({ ...over, [c.category]: Number(e.target.value) || 0 })} /></td><td className="text-right font-mono">{money(c.monthly * 12)}</td><td className="text-right font-mono">{money(last.byCategory[c.category] ?? 0)}</td></tr>)}
        </tbody></table></div>
      </section>
      <section className="mb-6"><h2 className="mb-2 font-display text-lg font-bold">What you should do</h2>
        <ul className="grid gap-3 sm:grid-cols-2">{tips.map(t => <li key={t.title} className="flex gap-3 rounded-2xl border border-gold/40 bg-card p-4"><Lightbulb className="h-5 w-5 shrink-0 text-gold" /><div><p className="font-semibold">{t.title}</p><p className="text-sm text-muted-foreground">{t.why}</p></div></li>)}</ul>
      </section>
    </>}
  </>;
}
