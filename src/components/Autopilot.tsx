import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { money } from "@/lib/expenses";
import { addDays } from "@/lib/planning";
import { anomalies } from "@/lib/insights";
import { paymentReadiness } from "@/lib/readiness";
import { autopilot, applyAutopilotActions, type AutopilotAction } from "@/lib/autopilot";
import { todayISO, usePosition } from "@/lib/use-position";

/** Home: prioritised recommendations. Nothing here acts on its own. */
export function Autopilot() {
  const store = useStore();
  const p = usePosition(60);
  const today = todayISO();
  const [open, setOpen] = useState<string | null>(null);
  const { commitments, accounts, transactions, preferences } = store;
  const recs = useMemo(() => {
    const readiness = paymentReadiness({ commitments, accounts, transactions, today, horizonDays: 45 });
    const pending = transactions.filter((t) => t.reimbursementStatus === "pending");
    const oldest = pending.reduce((m, t) => Math.max(m, Math.round((Date.parse(today) - Date.parse(t.date)) / 864e5)), 0);
    const subs = p.subscriptions.summary;
    return autopilot({
      today, readiness,
      shortDates: p.forecast.shortDates, lowestProjected: p.forecast.lowest.balance,
      overdue: readiness.filter((r) => r.status === "overdue").map((r) => ({ name: r.name, amount: r.amount, due: r.date })),
      anomalies: anomalies(transactions, today, 7).map((a) => ({ title: a.title, amount: a.amount, reason: a.reason })),
      subscriptions: { monthly: subs.monthly, duplicates: subs.duplicates, increases: subs.increases },
      pendingReimbursements: { count: pending.length, amount: p.reimbursements.pendingAmount, oldestDays: oldest },
      overBudget: [], lateIncome: [], idleCash: 0, unreconciledOld: 0,
    });
  }, [commitments, accounts, transactions, today, p]);
  const { active } = applyAutopilotActions(recs, preferences.autopilotActions, today);
  if (!active.length) return null;

  const act = async (key: string, status: AutopilotAction["status"]) => {
    const a: AutopilotAction = { status, at: today, ...(status === "later" ? { until: addDays(today, 7) } : {}) };
    try { await store.savePreferences({ ...preferences, autopilotActions: { ...preferences.autopilotActions, [key]: a } }); toast.success(status === "later" ? "Hidden for a week" : status === "accepted" ? "Marked as done" : "Dismissed"); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <section className="mb-5 rounded-3xl border bg-card p-5">
      <div className="mb-1 flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /><h2 className="font-display text-lg font-bold">Autopilot suggestions</h2></div>
      <p className="mb-3 text-xs text-muted-foreground">Worked out from your own records. Nothing happens unless you do it.</p>
      <ul className="divide-y">
        {active.slice(0, 6).map((r) => (
          <li key={r.key} className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${r.priority === "high" ? "text-destructive" : ""}`}>{r.title}</p>
                <p className="text-xs text-muted-foreground">{r.detail}</p>
              </div>
              {r.impact != null && <span className="shrink-0 font-mono text-sm">{money(r.impact)}</span>}
            </div>
            {open === r.key && r.steps.length > 0 && (
              <ul className="mt-2 rounded-lg bg-muted/50 p-2 text-xs">{r.steps.map((s, k) => <li key={k} className="flex justify-between"><span>{s.label}</span><span className="font-mono">{money(s.amount)}</span></li>)}</ul>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline"><Link to={r.to}>{r.actionLabel}</Link></Button>
              {r.steps.length > 0 && <Button size="sm" variant="ghost" onClick={() => setOpen(open === r.key ? null : r.key)}>{open === r.key ? "Hide" : "How worked out"}</Button>}
              <Button size="sm" variant="ghost" onClick={() => act(r.key, "accepted")}>Done</Button>
              <Button size="sm" variant="ghost" onClick={() => act(r.key, "later")}>Later</Button>
              <Button size="sm" variant="ghost" onClick={() => act(r.key, "dismissed")}>Dismiss</Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
