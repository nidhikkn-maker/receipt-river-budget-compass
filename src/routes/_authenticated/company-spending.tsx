import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { companySummary, PERSONAL } from "@/lib/company-summary";
import { fyOf, fyRange } from "@/lib/entities";
import { money } from "@/lib/expenses";

export const Route = createFileRoute("/_authenticated/company-spending")({
  head: () => ({ meta: [
    { title: "Spending by company — Ledgerline" },
    { name: "description", content: "Compare spending across your companies and personal accounts, with top categories and monthly trend." },
    { property: "og:title", content: "Spending by company — Ledgerline" },
    { property: "og:description", content: "Compare spending across your companies and personal accounts." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: CompanySpending,
});

function CompanySpending() {
  const { transactions, preferences } = useStore();
  const fy = fyRange(fyOf(new Date().toISOString().slice(0, 10)));
  const [from, setFrom] = useState(fy.start);
  const [to, setTo] = useState(fy.end);
  const ents = preferences.entities ?? [];
  const [show, setShow] = useState<string[]>([]);
  const rows = useMemo(() => companySummary(transactions, preferences.books?.entityAccounts ?? {}, from, to), [transactions, preferences.books, from, to]);
  const visible = rows.filter((r) => !show.length || show.includes(r.key));
  const name = (k: string) => (k === PERSONAL ? "Personal" : ents.find((e) => e.id === k)?.name ?? "Removed company");
  const max = Math.max(1, ...visible.map((r) => r.spent));
  const months = [...new Set(visible.flatMap((r) => Object.keys(r.months)))].sort();
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <PageTitle title="Spending by company" sub="Each company and your personal spending side by side. Money moved between your own accounts is shown separately, never as spending." />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs">To<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter companies">
        {[PERSONAL, ...ents.map((e) => e.id)].map((k) => (
          <button key={k} type="button" aria-pressed={show.includes(k)} onClick={() => setShow(show.includes(k) ? show.filter((x) => x !== k) : [...show, k])} className={`rounded-full border px-3 py-1 text-xs ${show.includes(k) ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{name(k)}</button>
        ))}
        {show.length > 0 && <button type="button" className="text-xs text-primary underline" onClick={() => setShow([])}>Show all</button>}
      </div>
      {!visible.length && <p className="text-sm text-muted-foreground">No spending in this period.</p>}
      {visible.map((r) => (
        <div key={r.key} className="space-y-2 rounded-2xl border bg-card p-4">
          <div className="flex items-baseline justify-between gap-2"><p className="font-semibold">{name(r.key)}</p><Link to="/expenses" className="text-lg font-semibold tabular-nums text-primary">{money(r.spent)}</Link></div>
          <div className="h-2 rounded-full bg-secondary"><div className="h-2 rounded-full bg-primary" style={{ width: `${(r.spent / max) * 100}%` }} /></div>
          <p className="text-xs text-muted-foreground">{r.count} entries{r.interCompany ? ` · ${money(r.interCompany)} moved to your other accounts (not spending)` : ""}</p>
          {r.categories.map((c) => <p key={c.name} className="flex justify-between text-xs"><span>{c.name || "Uncategorised"}</span><span className="tabular-nums">{money(c.amount)}</span></p>)}
        </div>
      ))}
      {months.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border bg-card p-3">
          <table className="w-full text-xs"><thead><tr><th className="text-left">Month</th>{visible.map((r) => <th key={r.key} className="text-right">{name(r.key)}</th>)}</tr></thead>
            <tbody>{months.map((m) => <tr key={m}><td>{m}</td>{visible.map((r) => <td key={r.key} className="text-right tabular-nums">{r.months[m] ? money(r.months[m]!) : "—"}</td>)}</tr>)}</tbody></table>
        </div>
      )}
    </div>
  );
}
