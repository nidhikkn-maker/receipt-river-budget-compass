import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, Row, fieldCls } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/expenses";
import { useIntelligence } from "@/lib/use-intelligence";
import { STRESS_SCENARIOS, STRESS_LABEL, defaultStress, stressTest, type StressScenario } from "@/lib/stress";
import { affordability, avoidedSpending, coolingStatus, decisionHistory, validateCoolingItem, type CoolingOffItem, type CoolingStatus } from "@/lib/cooling-off";

export function StressTest() {
  const { store, p, today } = useIntelligence();
  const [s, setS] = useState<StressScenario>(defaultStress("salary_delayed"));
  const set = (patch: Partial<StressScenario>) => setS({ ...s, ...patch });
  const r = useMemo(() => stressTest({
    cash: p.cash, minBalance: p.minBalance, reserves: p.reserves, commitments: store.commitments, today, days: 90,
    monthlySpend: p.flow.spent,
    loans: store.loans.filter((l) => l.status !== "closed").map((l) => ({ name: l.name, principal: l.principal, rate: l.rate, emi: l.emi, nextDue: l.nextDue })),
  }, s), [s, p, store.commitments, store.loans, today]);
  const k = s.kind;
  return (
    <>
      <Card title="What if…">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>Scenario</Label>
            <select className={fieldCls} value={k} onChange={(e) => set({ kind: e.target.value as StressScenario["kind"] })}>{STRESS_SCENARIOS.map((x) => <option key={x} value={x}>{STRESS_LABEL[x]}</option>)}</select></div>
          {["salary_delayed", "rent_delayed", "combined"].includes(k) && <div><Label>Days late</Label><Input type="number" value={s.delayDays} onChange={(e) => set({ delayDays: Math.max(0, Number(e.target.value) || 0) })} /></div>}
          {["medical", "emergency_payment", "combined"].includes(k) && <div><Label>Amount (₹)</Label><Input type="number" value={s.amount} onChange={(e) => set({ amount: Math.max(0, Number(e.target.value) || 0) })} /></div>}
          {["higher_spend", "combined"].includes(k) && <div><Label>Spending rise (%)</Label><Input type="number" value={s.spendIncreasePct} onChange={(e) => set({ spendIncreasePct: Math.max(0, Number(e.target.value) || 0) })} /></div>}
          {k === "income_interrupted" && <div><Label>Months without income</Label><Input type="number" value={s.months} onChange={(e) => set({ months: Math.min(24, Math.max(1, Number(e.target.value) || 1)) })} /></div>}
          {k === "higher_interest" && <div><Label>Rate rise (percentage points)</Label><Input type="number" value={s.rateIncrease} onChange={(e) => set({ rateIncrease: Math.max(0, Number(e.target.value) || 0) })} /></div>}
        </div>
      </Card>
      <Card title={r.shortfall > 0 ? "You would run short" : "Your plan holds"}>
        <Row label="Lowest balance (next 90 days)" value={`${money(r.lowest)} on ${r.lowestDate}`} tone={r.shortfall > 0 ? "bad" : "good"} />
        <Row label="Short by" value={money(r.shortfall)} tone={r.shortfall > 0 ? "bad" : undefined} />
        <Row label="Days until money runs short" value={r.daysUntilShort ?? "—"} />
        <Row label="Emergency reserve used" value={money(r.reserveUsed)} />
        {r.affected.length > 0 && <div className="mt-3"><p className="mb-1 text-xs font-semibold text-muted-foreground">Payments at risk</p>{r.affected.map((a, i) => <Row key={i} label={`${a.name} · ${a.date}`} value={money(a.amount)} />)}</div>}
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{r.corrective.map((c, i) => <li key={i}>{c}</li>)}</ul>
        <p className="mt-3 text-xs text-muted-foreground">A what-if only — your records are not changed.</p>
      </Card>
    </>
  );
}

const STATUS_LABEL: Record<CoolingStatus, string> = { waiting: "Cooling off", ready: "Ready to decide", purchased: "Bought", postponed: "Postponed", cancelled: "Decided against" };

export function CoolingOff() {
  const { store, p, today } = useIntelligence();
  const prefs = store.preferences;
  const items = prefs.coolingOff;
  const [f, setF] = useState({ title: "", amount: 0, category: "Shopping", waitDays: 7, reason: "" });
  const [busy, setBusy] = useState(false);
  const save = async (next: CoolingOffItem[]) => { setBusy(true); try { await store.savePreferences({ ...prefs, coolingOff: next }); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  const add = async () => {
    try { validateCoolingItem({ ...f, proposedDate: today }); } catch (e) { toast.error((e as Error).message); return; }
    await save([...items, { id: crypto.randomUUID(), title: f.title.trim(), amount: f.amount, category: f.category, proposedDate: today, priority: "low", reason: f.reason.trim(), paymentMethod: null, waitDays: f.waitDays, createdAt: new Date().toISOString(), status: "waiting", decidedAt: null }]);
    setF({ ...f, title: "", amount: 0, reason: "" }); toast.success("Added to your cooling-off list");
  };
  const decide = (id: string, status: CoolingStatus) => save(items.map((i) => (i.id === id ? { ...i, status, decidedAt: new Date().toISOString() } : i)));
  const open = items.filter((i) => i.status === "waiting" || i.status === "ready");
  const history = decisionHistory(items);
  const upcoming = p.upcoming.filter((u) => u.direction === "out").reduce((s, u) => s + u.amount, 0);
  return (
    <>
      <Card title="Thinking of buying something?">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>What is it?</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. New headphones" /></div>
          <div><Label>Estimated price (₹)</Label><Input type="number" value={f.amount || ""} onChange={(e) => setF({ ...f, amount: Number(e.target.value) || 0 })} /></div>
          <div><Label>Wait before deciding</Label><select className={fieldCls} value={f.waitDays} onChange={(e) => setF({ ...f, waitDays: Number(e.target.value) })}>{[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}</select></div>
          <div className="sm:col-span-2"><Label>Why do you want it? (optional)</Label><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>
        </div>
        <Button className="mt-3" disabled={busy} onClick={add}>Add to list</Button>
        <p className="mt-2 text-xs text-muted-foreground">This is not an expense. Record the purchase yourself only if you buy it.</p>
      </Card>
      {open.length > 0 && <Card title="Waiting">
        {open.map((i) => {
          const st = coolingStatus(i, today);
          const aff = affordability(i, { safeToSpend: p.safe.amount, upcomingObligations: upcoming, cash: p.cash });
          return (
            <div key={i.id} className="border-b py-3 last:border-0">
              <div className="flex justify-between gap-3"><p className="font-semibold">{i.title}</p><span className="font-mono">{money(i.amount)}</span></div>
              <p className="text-xs text-muted-foreground">{STATUS_LABEL[st.status]}{st.status === "waiting" ? ` · ${st.daysLeft} day${st.daysLeft === 1 ? "" : "s"} left (until ${st.readyAt})` : ""} · after buying, safe to spend would be <span className={aff.verdict === "risky" ? "text-destructive" : ""}>{money(aff.afterPurchase)}</span> ({aff.verdict})</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => decide(i.id, "purchased")}>I bought it</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(i.id, "postponed")}>Postpone</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(i.id, "cancelled")}>Decided against</Button>
              </div>
            </div>
          );
        })}
      </Card>}
      {history.length > 0 && <Card title={`Decisions · ${money(avoidedSpending(items))} not spent`}>
        {history.slice(0, 20).map((i) => <Row key={i.id} label={`${i.title} · ${STATUS_LABEL[i.status]}`} value={money(i.amount)} />)}
      </Card>}
    </>
  );
}
