import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { money } from "@/lib/expenses";
import { accountBalance, isLiability } from "@/lib/ledger";
import { todayISO } from "@/lib/use-position";
import { suggestAllocation, validateAllocation, plannedVsActual, type AllocationLine, type AllocationPlan, type Bucket } from "@/lib/allocation";
import { Trash2 } from "lucide-react";
import { archiveInList, restoreInList } from "@/lib/archive";
import { recordIsArchived, type Archivable } from "@/lib/records-archive";
import { ArchivedRecords, useArchiveFlow } from "@/components/ArchivedRecords";

export const Route = createFileRoute("/_authenticated/allocation")({
  head: () => ({
    meta: [
      { title: "Plan where income goes — Thapal" },
      { name: "description", content: "Plan how to distribute incoming money across commitments, cards, loans, reserves and goals. Plans never move money." },
      { property: "og:title", content: "Plan where income goes — Thapal" },
      { property: "og:description", content: "Plan how to distribute incoming money across commitments, cards, loans, reserves and goals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AllocationPage,
});

function AllocationPage() {
  const { transactions, accounts, commitments, loans, goals, budgets, preferences, savePreferences } = useStore();
  const today = todayISO();
  // No delete (P0-016): a saved plan is archived with who/when/why and can be restored. Plans never move money.
  const activePlans = preferences.allocationPlans.filter((p) => !recordIsArchived(p));
  const archivedPlans: Archivable<AllocationPlan>[] = preferences.allocationPlans.filter((p) => recordIsArchived(p));
  const planFlow = useArchiveFlow(async (req, who) => {
    await savePreferences({ ...preferences, allocationPlans: req.mode === "archive" ? archiveInList(preferences.allocationPlans, req.id, who) : restoreInList(preferences.allocationPlans, req.id, who) });
  });
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("Salary");
  const [horizon, setHorizon] = useState(30);
  const [lines, setLines] = useState<AllocationLine[] | null>(null);
  const [shortfall, setShortfall] = useState(0);

  const live = accounts.filter((a) => !a.archived);
  const cards = live.filter((a) => a.kind === "credit_card");
  const cardDues = cards.map((a) => ({ name: a.name, amount: Math.max(0, accountBalance(a, transactions)) })).filter((c) => c.amount > 0);
  const loanEmis = loans.filter((l) => l.status !== "closed" && l.loanType !== "credit_card_emi").map((l) => ({ name: l.name, amount: l.emi }));
  const reserves = goals.filter((g) => g.reserve);
  const emergency = { target: reserves.reduce((s, g) => s + g.target, 0), saved: reserves.reduce((s, g) => s + g.saved, 0) };
  const householdMonthly = Object.values(budgets as Record<string, number>).reduce((s, b) => s + b, 0);

  const suggest = () => {
    const amt = Number(amount);
    if (!(amt > 0)) { toast.error("Enter the income amount"); return; }
    const r = suggestAllocation({
      amount: amt, today, horizonDays: horizon, commitments, cardDues, loanEmis, householdMonthly, emergency,
      goals: goals.filter((g) => !g.reserve).map((g) => ({ name: g.name, monthly: g.monthly })),
    });
    setLines(r.lines);
    setShortfall(r.shortfall);
  };

  const savePlan = async () => {
    const amt = Number(amount);
    if (!lines) return;
    try {
      validateAllocation(lines, amt);
      const plan: AllocationPlan = { id: crypto.randomUUID(), title: title.trim() || "Income", incomeDate: today, amount: amt, lines, carryForward: true, createdAt: new Date().toISOString() };
      await savePreferences({ ...preferences, allocationPlans: [plan, ...preferences.allocationPlans] }); // never capped: saved plans are kept (retention.ts)
      setLines(null); setAmount("");
      toast.success("Plan saved — no money was moved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save the plan"); }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle eyebrow="Wealth" title="Plan where income goes" sub="When income comes in, plan where it goes — commitments, cards, loans, reserves and goals. This is a plan only; it never moves money between accounts." />

      <section className="mb-6 rounded-3xl border bg-card p-5">
        <h2 className="mb-3 font-display text-lg font-bold">New plan for my income</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Income name (e.g. October salary)" aria-label="Income name" />
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Amount received (₹)" aria-label="Amount received" />
          <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Period to cover">
            <option value={30}>Cover 1 month</option><option value={15}>Cover 2 weeks</option><option value={60}>Cover 2 months</option><option value={90}>Cover 3 months</option>
          </select>
        </div>
        <Button className="mt-3" variant="gold" onClick={suggest}>Suggest a plan</Button>

        {lines && (
          <div className="mt-4">
            {shortfall > 0 && <p className="mb-2 rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">Fixed obligations exceed this income by {money(shortfall)} — flexible lines were set to zero.</p>}
            <ul className="divide-y">
              {lines.map((l, i) => (
                <li key={l.bucket} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1"><span className="font-semibold">{l.label}</span>{l.note && <span className="block text-xs text-muted-foreground">{l.note}</span>}</span>
                  <Input className="w-28 text-right font-mono" value={String(l.amount)} inputMode="decimal" aria-label={`Amount for ${l.label}`}
                    onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, amount: Number(e.target.value) || 0 } : x)))} />
                  <Button size="icon" variant="ghost" aria-label={`Remove ${l.label}`} onClick={() => setLines(lines.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between border-t pt-3 text-sm font-semibold">
              <span>Total planned</span>
              <span className="font-mono">{money(lines.reduce((s, l) => s + l.amount, 0))} / {money(Number(amount) || 0)}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="gold" onClick={() => void savePlan()}>Save plan</Button>
              <Button variant="outline" onClick={() => setLines(null)}>Discard</Button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-3xl border bg-card p-5">
        <h2 className="mb-3 font-display text-lg font-bold">Saved plans</h2>
        {!activePlans.length && <p className="text-sm text-muted-foreground">{preferences.allocationPlans.length ? "No active plans. Archived ones are listed below." : "No plans yet. Enter an income amount above and tap “Suggest a plan”."}</p>}
        <ul className="divide-y">
          {activePlans.map((p) => <PlanRow key={p.id} plan={p} onArchive={() => planFlow.ask({ mode: "archive", id: p.id, name: p.title, noun: "allocation plan" })} />)}
        </ul>
        <div className="mt-3"><ArchivedRecords id="archived-plans" title={`Archived plans (${archivedPlans.length})`} noun="allocation plan" userId={planFlow.userId}
          items={archivedPlans.map((p) => ({ id: p.id, name: p.title, detail: `${p.incomeDate} · ${money(p.amount)} received`, state: p }))} onRestore={(it) => planFlow.ask({ mode: "restore", id: it.id, name: it.name, noun: "allocation plan" })} /></div>
        {planFlow.dialog}
      </section>
    </div>
  );
}

function PlanRow({ plan, onArchive }: { plan: AllocationPlan; onArchive: () => void }) {
  const { transactions, accounts, budgets, commitments } = useStore();
  const [open, setOpen] = useState(false);
  const actual = useMemo(() => {
    // Derive what actually happened since the income date: card/loan/investment movements from
    // transfers, mandatory/household/annual from matching categories, the rest is discretionary.
    const since = transactions.filter((t) => t.date >= plan.incomeDate);
    const cardIds = new Set(accounts.filter((a) => a.kind === "credit_card").map((a) => a.id));
    const loanIds = new Set(accounts.filter((a) => isLiability(a.kind) && a.kind !== "credit_card").map((a) => a.id));
    const investIds = new Set(accounts.filter((a) => a.kind === "investment" || a.kind === "fixed_deposit").map((a) => a.id));
    const essentialCats = new Set(commitments.filter((c) => c.essential && c.direction === "out").map((c) => c.category));
    const annualCats = new Set(commitments.filter((c) => ["yearly", "half_yearly", "quarterly"].includes(c.frequency)).map((c) => c.category));
    const householdCats = new Set(Object.keys(budgets as Record<string, number>));
    const out = { mandatory: 0, card: 0, loan: 0, household: 0, emergency: 0, annual: 0, goals: 0, investments: 0, discretionary: 0 };
    for (const t of since) {
      const k = t.txnType ?? "expense";
      if (["transfer", "card_payment", "loan_repayment", "investment"].includes(k)) {
        if (t.toAccountId && cardIds.has(t.toAccountId)) out.card += t.amount;
        else if (t.toAccountId && loanIds.has(t.toAccountId)) out.loan += t.amount;
        else if (t.toAccountId && investIds.has(t.toAccountId)) out.investments += t.amount;
      } else if (k === "expense") {
        if (essentialCats.has(t.category)) out.mandatory += t.amount;
        else if (annualCats.has(t.category)) out.annual += t.amount;
        else if (householdCats.has(t.category)) out.household += t.amount;
        else out.discretionary += t.amount;
      }
    }
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Math.round(v * 100) / 100])) as Record<Bucket, number>;
  }, [transactions, accounts, budgets, commitments, plan.incomeDate]);
  const rows = plannedVsActual(plan, actual);
  const plannedTotal = plan.lines.reduce((s, l) => s + l.amount, 0);

  return (
    <li className="py-3">
      <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="min-w-0"><span className="font-semibold">{plan.title}</span><span className="block text-xs text-muted-foreground">{plan.incomeDate} · {money(plan.amount)} received · {money(plannedTotal)} planned{plan.carryForward ? " · unused rolls forward" : ""}</span></span>
        <span className="text-sm text-primary">{open ? "Hide" : "Compare"}</span>
      </button>
      {open && (
        <div className="mt-2 rounded-2xl bg-secondary/50 p-3">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Bucket</th><th className="py-1 text-right">Planned</th><th className="py-1 text-right">Actual</th><th className="py-1 text-right">Difference</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.bucket} className="border-t">
                  <td className="py-1.5">{r.label}</td>
                  <td className="py-1.5 text-right font-mono">{money(r.planned)}</td>
                  <td className="py-1.5 text-right font-mono">{money(r.actual)}</td>
                  <td className={"py-1.5 text-right font-mono " + (r.difference > 0 ? "text-destructive" : "text-primary")}>{r.difference > 0 ? "+" : ""}{money(r.difference)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button size="sm" variant="outline" className="mt-2" onClick={onArchive}>Archive plan</Button>
        </div>
      )}
    </li>
  );
}
