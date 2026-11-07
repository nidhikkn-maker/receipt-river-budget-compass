import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageTitle } from "@/components/AppShell";
import { ExpenseDialog } from "@/components/ExpenseDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { askAssistant } from "@/lib/assistant.functions";
import { categoryParts, money, type Expense } from "@/lib/expenses";
import { healthHistory, healthScore } from "@/lib/health";
import { freshnessSummary } from "@/lib/inbox";
import { monthlyReview, prevMonth, reviewHash, type MonthlyReview } from "@/lib/monthly-review";
import { downloadBlob, toPdf } from "@/lib/reports";
import { useStore, type SavedReview } from "@/lib/store";
import { todayISO } from "@/lib/use-position";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/review")({
  head: () => ({
    meta: [
      { title: "Monthly review & health score — Ledgerline" },
      { name: "description", content: "Your verified monthly money review with AI explanations, and a transparent financial health score." },
      { property: "og:title", content: "Monthly review & health score — Ledgerline" },
      { property: "og:description", content: "Verified monthly figures, AI explanations and a transparent health score." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  return (
    <div>
      <PageTitle eyebrow="Review" title="Monthly review & health" sub="Figures are calculated by the app. AI only explains them." />
      <Tabs defaultValue="review">
        <TabsList className="mb-4"><TabsTrigger value="review">Monthly review</TabsTrigger><TabsTrigger value="health">Health score</TabsTrigger></TabsList>
        <TabsContent value="review"><Monthly /></TabsContent>
        <TabsContent value="health"><Health /></TabsContent>
      </Tabs>
    </div>
  );
}

function useReviewInputs() {
  const { transactions, accounts, commitments, budgets, goals, loans } = useStore();
  return { transactions, accounts, commitments, budgets: budgets as Record<string, number>, goals, loans: loans.filter((l) => l.status !== "closed") };
}

function Monthly() {
  const { listReviews, saveReview, preferences, accounts, transactions } = useStore();
  const inputs = useReviewInputs();
  const today = todayISO();
  const months = Array.from({ length: 12 }, (_, k) => { let m = today.slice(0, 7); for (let i = 0; i < k; i++) m = prevMonth(m); return m; });
  const [month, setMonth] = useState(today.slice(8) < "05" ? prevMonth(today.slice(0, 7)) : today.slice(0, 7));
  const r = useMemo(() => monthlyReview({ ...inputs, month, today }), [inputs, month, today]);
  const hash = reviewHash(r);
  const [archive, setArchive] = useState<SavedReview[]>([]);
  const [viewing, setViewing] = useState<SavedReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [drill, setDrill] = useState<string | null>(null);
  const [open, setOpen] = useState<Expense | null>(null);
  const ask = useServerFn(askAssistant);
  const load = () => listReviews().then(setArchive).catch(() => {});
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const saved = archive.filter((a) => a.month === month);
  const latest = viewing ?? saved[0] ?? null;
  const stale = latest && latest.month === month && latest.dataHash !== hash;
  const fresh = freshnessSummary(accounts, transactions, preferences, today);
  const shown: MonthlyReview = (viewing?.figures as MonthlyReview | undefined) ?? r;
  const ended = `${month}-31` < today || month < today.slice(0, 7);

  const generate = async () => {
    setBusy(true);
    try {
      const facts = { monthlyReview_VERIFIED: r, dataFreshness: { label: fresh.label, outdatedAccounts: fresh.outdatedCritical } };
      const res = preferences.aiEnabled
        ? await ask({ data: { facts, messages: [{ role: "user", content: "Write my monthly financial review explanation using only the verified figures: where spending rose and fell, which budgets were exceeded, whether each change looks recurring or exceptional, and 3 practical adjustments. Mention if any account data is outdated. Use short headed sections." }] } })
        : { ok: true as const, text: "" };
      const narrative = res.ok ? res.text : "";
      if (!res.ok) toast.error(res.error);
      await saveReview({ month, figures: r, dataHash: hash, narrative, dataCutoff: new Date().toISOString() });
      setViewing(null); await load(); toast.success("Review saved to your archive");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const pdf = async () => {
    const rows: (string | number)[][] = [
      ["Summary", "Total income", money(shown.income)], ["Summary", "Total expenditure", money(shown.expenditure)], ["Summary", "Net cash flow", money(shown.netCashFlow)],
      ["Summary", `Previous month (${shown.previous.month}) spending`, money(shown.previous.expenditure)],
      ...shown.byCategory.map((c) => ["Category", c.category, money(c.amount)]),
      ...shown.changes.map((c) => ["Change", `${c.category} (${c.nature})`, money(c.change)]),
      ...shown.budgets.map((b) => ["Budget", `${b.category}${b.over ? " — over" : ""}`, `${money(b.spent)} of ${money(b.budget)}`]),
      ...shown.creditCards.map((c) => ["Credit card", c.name, money(c.owed)]),
      ...shown.loans.map((l) => ["Loan", l.name, money(l.outstanding)]),
      ["Reimbursements", "Outstanding", money(shown.reimbursements.outstanding)],
      ...shown.recommendations.map((x) => ["Recommendation", x, ""]),
      ...(latest?.narrative ? [["AI explanation (not a calculation)", latest.narrative.replace(/[#*]/g, "").slice(0, 1500), ""]] : []),
    ];
    try { downloadBlob(await toPdf({ title: `Monthly review ${month}`, headers: ["Section", "Item", "Amount"], rows }, `Generated ${new Date().toLocaleString()} · verified figures from Ledgerline`), `ledgerline-review-${month}.pdf`); }
    catch { toast.error("Couldn't create the PDF"); }
  };
  const share = async () => {
    const text = `Ledgerline review ${month}: income ${money(shown.income)}, spending ${money(shown.expenditure)}, net ${money(shown.netCashFlow)}.`;
    try { if (navigator.share) await navigator.share({ title: `Review ${month}`, text }); else { await navigator.clipboard.writeText(text); toast.success("Summary copied"); } } catch { /* cancelled */ }
  };
  const drillRows = drill ? inputs.transactions.filter((t) => (t.txnType ?? "expense") === "expense" && t.date.startsWith(month) && categoryParts(t).some((p) => p.category === drill)) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Month" className="h-9 rounded-md border bg-background px-2 text-sm font-semibold" value={month} onChange={(e) => { setMonth(e.target.value); setViewing(null); setDrill(null); }}>{months.map((m) => <option key={m}>{m}</option>)}</select>
        <Button size="sm" variant="gold" disabled={busy} onClick={generate}>{busy ? "Generating…" : saved.length ? "Regenerate" : "Generate review"}</Button>
        <Button size="sm" variant="outline" onClick={pdf}>Download PDF</Button>
        <Button size="sm" variant="outline" onClick={share}>Share</Button>
      </div>
      {!ended && <p className="text-xs text-muted-foreground">This month isn't over yet — figures are month-to-date.</p>}
      {fresh.lowConfidence && <p className="rounded-xl bg-destructive/10 p-2 text-sm text-destructive">Some account data is outdated ({fresh.outdatedCritical.join(", ")}), so this review may be incomplete.</p>}
      {stale && <p className="rounded-xl bg-gold-soft p-2 text-sm font-medium text-gold-strong">Records changed after this review was generated — it may be outdated. Regenerate to refresh.</p>}
      {viewing && <p className="text-sm">Viewing archived report from {new Date(viewing.generatedAt).toLocaleString()} <Button size="sm" variant="ghost" onClick={() => setViewing(null)}>Back to live figures</Button></p>}

      <section className="grid grid-cols-1 gap-2 sm:grid-cols-3">{[["Income", shown.income, shown.previous.income], ["Spending", shown.expenditure, shown.previous.expenditure], ["Net cash flow", shown.netCashFlow, shown.previous.netCashFlow]].map(([l, v, p]) => <div key={l as string} className="rounded-2xl border p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="font-mono text-lg font-bold">{money(v as number)}</div><div className="text-xs text-muted-foreground">last month {money(p as number)}</div></div>)}</section>

      <section className="rounded-2xl border p-3"><h3 className="font-display font-bold">Spending by category <span className="text-xs font-normal text-muted-foreground">(tap to see transactions)</span></h3>
        <ul className="mt-1 divide-y text-sm">{shown.byCategory.map((c) => <li key={c.category}><button className={cn("flex w-full justify-between py-1.5", drill === c.category && "font-bold")} onClick={() => setDrill(drill === c.category ? null : c.category)}><span>{c.category}</span><span className="font-mono">{money(c.amount)}</span></button>
          {drill === c.category && <ul className="mb-2 rounded-xl bg-muted/50 p-2 text-xs">{drillRows.map((t) => <li key={t.id}><button className="flex w-full justify-between py-0.5" onClick={() => setOpen(t)}><span className="truncate">{t.date} · {t.title}</span><span className="font-mono">{money(categoryParts(t).filter((p) => p.category === drill).reduce((s, p) => s + p.amount, 0))}</span></button></li>)}</ul>}</li>)}
          {!shown.byCategory.length && <li className="py-2 text-muted-foreground">No spending recorded.</li>}</ul></section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Box title="Biggest changes vs last month">{shown.changes.map((c) => <Row key={c.category} l={`${c.category} · ${c.nature}`} v={`${c.change > 0 ? "+" : ""}${money(c.change)}`} />)}</Box>
        <Box title="Budget performance">{shown.budgets.map((b) => <Row key={b.category} l={b.category} v={`${money(b.spent)} / ${money(b.budget)}`} bad={b.over} />)}</Box>
        <Box title="Unusual transactions">{shown.unusual.map((u, k) => <Row key={k} l={`${u.date} · ${u.title}`} v={money(u.amount)} />)}</Box>
        <Box title="Recurring expenses">{shown.recurring.map((u) => <Row key={u.name} l={u.name} v={`${money(u.monthly)}/mo`} />)}</Box>
        <Box title="Credit card liabilities">{shown.creditCards.map((c) => <Row key={c.name} l={c.name} v={money(c.owed)} />)}</Box>
        <Box title="Upcoming commitments (30 days)">{shown.upcoming.map((u, k) => <Row key={k} l={`${u.date} · ${u.name}`} v={money(u.amount)} />)}</Box>
        <Box title="Savings goals">{shown.savings.map((g) => <Row key={g.name} l={g.name} v={`${money(g.saved)}${g.pct != null ? ` · ${g.pct}%` : ""}`} />)}</Box>
        <Box title="Loan repayment">{shown.loans.map((l) => <Row key={l.name} l={`${l.name}${l.repaidPct != null ? ` · ${l.repaidPct}% repaid` : ""}`} v={money(l.outstanding)} />)}</Box>
        <Box title="Pending reimbursements"><Row l="Outstanding" v={money(shown.reimbursements.outstanding)} />{Object.entries(shown.reimbursements.byPayer).map(([k, v]) => <Row key={k} l={k} v={money(v)} />)}</Box>
        <Box title="Recommendations (rule-based)">{shown.recommendations.map((x, k) => <li key={k} className="py-1">{x}</li>)}</Box>
      </div>

      {latest?.narrative && <section className="rounded-2xl border border-gold/60 p-3"><h3 className="font-display font-bold">AI explanation</h3><p className="text-xs text-muted-foreground">AI-written commentary on the verified figures above — not a calculation. Generated {new Date(latest.generatedAt).toLocaleString()}.</p><p className="mt-2 whitespace-pre-wrap text-sm">{latest.narrative}</p></section>}

      <section className="rounded-2xl border p-3"><h3 className="font-display font-bold">Report archive</h3>
        <ul className="divide-y text-sm">{archive.map((a) => <li key={a.id}><button className="flex w-full justify-between py-1.5" onClick={() => { setMonth(a.month); setViewing(a); }}><span>{a.month}</span><span className="text-xs text-muted-foreground">generated {new Date(a.generatedAt).toLocaleDateString()} · data to {new Date(a.dataCutoff).toLocaleDateString()}</span></button></li>)}{!archive.length && <li className="py-2 text-muted-foreground">No saved reviews yet.</li>}</ul></section>
      <ExpenseDialog expense={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  const empty = !children || (Array.isArray(children) && !children.length);
  return <section className="rounded-2xl border p-3"><h3 className="font-display text-sm font-bold">{title}</h3><ul className="mt-1 divide-y text-sm">{empty ? <li className="py-1 text-muted-foreground">Nothing to show.</li> : children}</ul></section>;
}
function Row({ l, v, bad }: { l: string; v: string; bad?: boolean }) {
  return <li className="flex justify-between gap-2 py-1"><span className="truncate">{l}</span><span className={cn("shrink-0 font-mono", bad && "font-bold text-destructive")}>{v}</span></li>;
}

function Health() {
  const inputs = useReviewInputs();
  const today = todayISO();
  const emis = inputs.loans.reduce((s, l) => s + l.emi, 0);
  const base = { accounts: inputs.accounts, transactions: inputs.transactions, commitments: inputs.commitments, emis, budgets: inputs.budgets };
  const h = useMemo(() => healthScore({ ...base, asOf: today }), [inputs, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const hist = useMemo(() => healthHistory(base, today), [inputs, today]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-hero p-5 text-ink-foreground ring-1 ring-gold">
        <div className="text-xs font-semibold tracking-wide opacity-80">Financial health score</div>
        <div className="font-mono text-5xl font-bold text-gold">{h.score ?? "—"}<span className="text-xl opacity-70">/100</span></div>
        <p className="mt-1 text-sm opacity-90">{h.score == null ? "Incomplete assessment — not enough data to score honestly." : h.complete ? "Based on all five components." : "Based on the components that can be measured; others are missing."}</p>
        <p className="mt-2 text-xs opacity-75">An internal money-management indicator only. It is not a CIBIL or credit-bureau score.</p>
      </section>
      <section className="space-y-2">{h.components.map((c) => <div key={c.key} className="rounded-2xl border p-3">
        <div className="flex items-center justify-between gap-2"><b className="text-sm">{c.label} <span className="text-xs font-normal text-muted-foreground">· weight {c.weight}%</span></b><span className="font-mono font-bold">{c.score ?? "n/a"}</span></div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-gold" style={{ width: `${c.score ?? 0}%` }} /></div>
        <p className="mt-1 text-sm">{c.detail}</p><p className="text-xs text-muted-foreground">How it's calculated: {c.method}</p></div>)}</section>
      {hist.some((x) => x.score != null) && <section className="rounded-2xl border p-3"><h3 className="font-display text-sm font-bold">Score trend</h3><div className="h-40"><ResponsiveContainer><LineChart data={hist}><XAxis dataKey="month" fontSize={11} /><YAxis domain={[0, 100]} fontSize={11} width={28} /><Tooltip /><Line dataKey="score" stroke="var(--gold)" strokeWidth={3} connectNulls /></LineChart></ResponsiveContainer></div></section>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Box title="Helping your score">{h.improving.map((x, k) => <li key={k} className="py-1">{x}</li>)}</Box>
        <Box title="Holding it back">{h.reducing.map((x, k) => <li key={k} className="py-1">{x}</li>)}</Box>
      </div>
      <Box title="How to improve">{h.recommendations.map((x, k) => <li key={k} className="py-1">{x}</li>)}</Box>
      <p className="text-xs text-muted-foreground">Overall score = weighted average of measurable components (needs at least 3 covering 60% of the weight). The AI never calculates this score.</p>
    </div>
  );
}
