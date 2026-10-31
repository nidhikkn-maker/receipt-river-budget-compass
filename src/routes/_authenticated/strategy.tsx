import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Trash2, X } from "lucide-react";
import { PageTitle } from "@/components/AppShell";
import { Bar, Card, Row, fieldCls } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { money } from "@/lib/expenses";
import { METRIC_LABEL, MILESTONE_METRICS, SCENARIOS, SCENARIO_LABEL, irregularCandidates, milestoneProgress, metricValue, plannedScenario, provisionFor, recordProgress, simulate, type Milestone, type MilestoneMetric, type Scenario, type ScenarioKind } from "@/lib/intelligence";
import { addMonths } from "@/lib/planning";
import { useIntelligence } from "@/lib/use-intelligence";
import { CoolingOff, StressTest } from "@/components/StrategyStressCooling";

export const Route = createFileRoute("/_authenticated/strategy")({
  head: () => ({
    meta: [
      { title: "Strategy — simulator, emergency fund & milestones · Ledgerline" },
      { name: "description", content: "Test money decisions safely, check emergency coverage, plan irregular bills and track milestones." },
      { property: "og:title", content: "Strategy · Ledgerline" },
      { property: "og:description", content: "Decision simulator, emergency fund, irregular expenses and milestones." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Strategy,
});

function Strategy() {
  const tab = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") ?? "simulate" : "simulate";
  return (
    <div>
      <PageTitle eyebrow="Plan ahead" title="Strategy" sub="What-ifs never change your real records. Nothing moves money for you." />
      <Tabs defaultValue={tab}>
        <TabsList className="mb-4 w-full justify-start overflow-x-auto">
          <TabsTrigger value="simulate">Simulator</TabsTrigger>
          <TabsTrigger value="emergency">Emergency fund</TabsTrigger>
          <TabsTrigger value="irregular">Irregular bills</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
          <TabsTrigger value="stress">Stress test</TabsTrigger>
          <TabsTrigger value="cooling">Cooling-off</TabsTrigger>
        </TabsList>
        <TabsContent value="simulate"><Simulator /></TabsContent>
        <TabsContent value="emergency"><Emergency /></TabsContent>
        <TabsContent value="irregular"><Irregular /></TabsContent>
        <TabsContent value="milestones"><Milestones /></TabsContent>
        <TabsContent value="stress"><StressTest /></TabsContent>
        <TabsContent value="cooling"><CoolingOff /></TabsContent>
      </Tabs>
    </div>
  );
}

function Simulator() {
  const { store, p, today } = useIntelligence();
  const [s, setS] = useState<Scenario>({ kind: "purchase", amount: 0, date: today, recurring: false, loanIndex: 0, goalIndex: 0, postponeTo: addMonths(today, 1) });
  const [account, setAccount] = useState("");
  const [saving, setSaving] = useState(false);
  const flow = p.flow;
  const input = useMemo(() => ({
    cash: p.cash, floor: p.minBalance + p.reserves, commitments: store.commitments, today, days: 90,
    goals: store.goals, loans: store.loans.filter((l) => l.status !== "closed"), monthlySavings: Math.max(0, flow.income - flow.spent),
  }), [p, store.commitments, store.goals, store.loans, today, flow]);
  const r = s.amount > 0 ? simulate(input, s) : null;
  const set = (patch: Partial<Scenario>) => setS({ ...s, ...patch });
  const savePlan = async () => {
    if (saving) return;
    if (!r || !confirm(`Save "${SCENARIO_LABEL[s.kind]}" of ${money(s.amount)} as a planned payment? It will appear in your Plan and forecast.`)) return;
    setSaving(true);
    try {
      const plan = plannedScenario(s);
      if (!plan) return;
      await store.saveCommitment({ ...plan, accountId: account || null });
      toast.success("Saved to your plan");
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  const showLoan = s.kind === "loan_extra", showGoal = s.kind === "goal_allocation";
  return (
    <>
      <Card title="Decision">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>What are you considering?</Label>
            <select className={fieldCls} value={s.kind} onChange={(e) => set({ kind: e.target.value as ScenarioKind })}>{SCENARIOS.map((k) => <option key={k} value={k}>{SCENARIO_LABEL[k]}</option>)}</select></div>
          <div><Label>Amount (₹)</Label><Input inputMode="decimal" type="number" className="h-11 font-mono text-lg font-semibold" value={s.amount || ""} onChange={(e) => set({ amount: Number(e.target.value) || 0 })} placeholder="0" /></div>
          <div><Label>{s.kind === "postpone" ? "Original date" : "Date"}</Label><Input type="date" className="h-11" value={s.date} onChange={(e) => set({ date: e.target.value })} /></div>
          {s.kind === "postpone" && <div><Label>Postpone to</Label><Input type="date" className="h-11" value={s.postponeTo} onChange={(e) => set({ postponeTo: e.target.value })} /></div>}
          <div><Label>Paid from</Label><select className={fieldCls} value={account} onChange={(e) => setAccount(e.target.value)}><option value="">Any account</option>{store.accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          {showLoan && <div><Label>Loan</Label><select className={fieldCls} value={s.loanIndex} onChange={(e) => set({ loanIndex: Number(e.target.value) })}>{input.loans.map((l, k) => <option key={k} value={k}>{l.name}</option>)}</select></div>}
          {showGoal && <div><Label>Goal</Label><select className={fieldCls} value={s.goalIndex} onChange={(e) => set({ goalIndex: Number(e.target.value) })}>{input.goals.map((g, k) => <option key={k} value={k}>{g.name}</option>)}</select></div>}
          {!["new_recurring", "increase_savings", "reduce_category", "postpone"].includes(s.kind) && <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={s.recurring} onChange={(e) => set({ recurring: e.target.checked })} /> Repeats monthly</label>}
        </div>
      </Card>
      {!r ? <p className="text-sm text-muted-foreground">Enter an amount to compare your position before and after.</p> : (
        <>
          <p className="mb-2 rounded-xl bg-gold-soft px-3 py-2 text-xs font-semibold text-gold-strong">Hypothetical — your records are unchanged. Next 90 days.</p>
          <div className="grid grid-cols-2 gap-3">
            {([["Now" + (s.kind === "postpone" ? " (buy now)" : ""), r.before], ["After" + (s.kind === "postpone" ? " (buy later)" : ""), r.after]] as const).map(([label, x]) => (
              <Card key={label} title={label} className="mb-0">
                <Row label="Cash today" value={money(x.cash)} />
                <Row label="Free to spend" value={money(x.available)} strong tone={x.available > 0 ? "good" : "bad"} />
                <Row label="Lowest balance" value={money(x.lowest)} />
                <Row label="Lowest on" value={x.lowestDate} />
                <Row label="Days below safety" value={x.shortDays} tone={x.shortDays ? "bad" : undefined} />
                <Row label="Balance in 90 days" value={money(x.endBalance)} />
                <Row label="Savings / month" value={money(x.savingsPerMonth)} />
                {x.goal && <Row label={`${x.goal.name}`} value={`${x.goal.pct}% · ${x.goal.eta ?? "no date"}`} />}
              </Card>
            ))}
          </div>
          <Card className="mt-3">
            <Row label="Change in free-to-spend" value={money(r.after.available - r.before.available)} strong tone={r.after.available >= r.before.available ? "good" : "bad"} />
            {r.loan && <><Row label="Loan interest saved" value={money(r.loan.interestSaved)} tone="good" /><Row label="Months saved" value={r.loan.monthsSaved} /></>}
            {r.notes.map((n) => <p key={n} className="mt-2 text-xs text-muted-foreground">{n}</p>)}
            {r.after.shortDays > 0 && <p className="mt-2 text-sm font-semibold text-destructive">This would take you below your safety balance on {r.after.shortDays} days.</p>}
            {["purchase", "postpone", "new_recurring"].includes(s.kind) && <Button variant="gold" className="mt-3 w-full" disabled={saving} onClick={savePlan}>Save as planned payment…</Button>}
          </Card>
        </>
      )}
    </>
  );
}

function Emergency() {
  const { store, ef, today } = useIntelligence();
  const { preferences: pr, savePreferences, accounts } = store;
  const s = pr.emergency;
  const save = async (patch: Partial<typeof s>) => { try { await savePreferences({ ...pr, emergency: { ...s, ...patch } }); } catch (e) { toast.error((e as Error).message); } };
  const cashAccts = accounts.filter((a) => !a.archived && ["savings", "current", "cash", "wallet"].includes(a.kind));
  const cats = pr.categories.filter((c) => !c.archived).map((c) => c.name);
  return (
    <>
      <Card title="Emergency coverage">
        <div className="mb-2 font-display text-4xl font-bold">{ef.coverage === null ? "—" : `${ef.coverage} months`}</div>
        <Bar pct={ef.pct} />
        <p className="mt-1 text-xs text-muted-foreground">{ef.pct}% of your {s.targetMonths}-month target{ef.monthsWithData < 3 && s.method === "conservative" ? ` · based on ${ef.monthsWithData} month(s) of data` : ""}</p>
        <div className="mt-3">
          <Row label="Eligible cash reserves" value={money(ef.reserves)} strong />
          {ef.earmarked > 0 && <Row label="Earmarked goals excluded" value={`− ${money(ef.earmarked)}`} />}
          <Row label="Monthly essentials" value={money(ef.essentials)} />
          <Row label="Mandatory EMIs" value={money(ef.emis)} />
          <Row label="Monthly commitments" value={money(ef.monthly)} strong />
          <Row label="Target reserve" value={money(ef.target)} />
          <Row label="Funding gap" value={money(ef.gap)} tone={ef.gap ? "bad" : "good"} />
          <Row label="Target reached by" value={ef.gap === 0 ? "Reached" : ef.eta ?? "Set a monthly contribution"} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Coverage = eligible cash ÷ monthly essential commitments. Credit card limits, investments and fixed deposits are never counted. Conservative uses your highest essential month of the last six.</p>
      </Card>
      <Card title="Settings">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Target (months)</Label><Input type="number" min={1} max={24} className="h-11" defaultValue={s.targetMonths} onBlur={(e) => save({ targetMonths: Number(e.target.value) || 6 })} /></div>
          <div><Label>Monthly contribution (₹)</Label><Input type="number" className="h-11" defaultValue={s.monthlyContribution || ""} onBlur={(e) => save({ monthlyContribution: Number(e.target.value) || 0 })} /></div>
          <div><Label>Method</Label><select className={fieldCls} value={s.method} onChange={(e) => save({ method: e.target.value as "conservative" | "custom" })}><option value="conservative">Conservative (highest month)</option><option value="custom">Custom monthly amount</option></select></div>
          {s.method === "custom" && <div><Label>Custom essentials / month (₹)</Label><Input type="number" className="h-11" defaultValue={s.customMonthly || ""} onBlur={(e) => save({ customMonthly: Number(e.target.value) || 0 })} /></div>}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={s.includeEmis} onChange={(e) => save({ includeEmis: e.target.checked })} /> Include loan EMIs</label>
        <label className="mt-2 flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={s.excludeEarmarked} onChange={(e) => save({ excludeEarmarked: e.target.checked })} /> Exclude money saved for other goals</label>
        <div className="mt-3 text-sm font-semibold">Reserve accounts {s.accountIds.length === 0 && <span className="font-normal text-muted-foreground">(all cash accounts)</span>}</div>
        <div className="mt-1 flex flex-wrap gap-2">{cashAccts.map((a) => { const on = s.accountIds.includes(a.id); return <Button key={a.id} size="sm" variant={on ? "default" : "outline"} onClick={() => save({ accountIds: on ? s.accountIds.filter((x) => x !== a.id) : [...s.accountIds, a.id] })}>{a.name}</Button>; })}</div>
        <div className="mt-3 text-sm font-semibold">Essential categories</div>
        <div className="mt-1 flex flex-wrap gap-2">{cats.map((c) => { const on = s.essentialCategories.includes(c); return <Button key={c} size="sm" variant={on ? "default" : "outline"} onClick={() => save({ essentialCategories: on ? s.essentialCategories.filter((x) => x !== c) : [...s.essentialCategories, c] })}>{c}</Button>; })}</div>
        <p className="mt-2 text-xs text-muted-foreground">As of {today}.</p>
      </Card>
    </>
  );
}

function Irregular() {
  const { store, today } = useIntelligence();
  const { preferences: pr, savePreferences, commitments, confirmIrregular } = store;
  const cands = useMemo(() => irregularCandidates(store.transactions, today), [store.transactions, today]);
  const open = cands.filter((c) => !pr.irregularRejected.includes(c.key) && !pr.irregularConfirmed.includes(c.key));
  const [edit, setEdit] = useState<Record<string, { amount: number; date: string }>>({});
  const [busy, setBusy] = useState(false);
  const confirmed = commitments.filter((c) => c.status === "active" && c.direction === "out" && ["yearly", "half_yearly"].includes(c.frequency));
  const accept = async (k: string) => {
    const c = cands.find((x) => x.key === k);
    if (!c || busy) return;
    const e = edit[k] ?? { amount: c.estimate, date: c.nextDate };
    setBusy(true);
    try {
      await confirmIrregular(c, e.amount, e.date); toast.success("Added to your plan and forecast");
    } catch (er) { toast.error((er as Error).message); } finally { setBusy(false); }
  };
  const reject = async (k: string) => { try { await savePreferences({ ...pr, irregularRejected: [...pr.irregularRejected, k] }); } catch (er) { toast.error((er as Error).message); } };
  const totalProvision = confirmed.reduce((s, c) => s + provisionFor(c.amount, c.nextDue, today), 0);
  return (
    <>
      <Card title="Confirmed irregular bills" action={<span className="font-mono text-sm font-semibold text-gold-strong">{money(totalProvision)}/mo to set aside</span>}>
        {confirmed.length === 0 ? <p className="text-sm text-muted-foreground">None yet. Confirm predictions below or add yearly items in Plan.</p> : confirmed.map((c) => (
          <Row key={c.id} label={`${c.name} · due ${c.nextDue}`} value={<>{money(c.amount)}<div className="text-[11px] font-normal text-muted-foreground">{money(provisionFor(c.amount, c.nextDue, today))}/mo</div></>} />
        ))}
        <p className="mt-2 text-xs text-muted-foreground">Confirmed bills are included in your cash-flow forecast.</p>
      </Card>
      <Card title={`Predicted (${open.length}) — not in your forecast until confirmed`}>
        {open.length === 0 && <p className="text-sm text-muted-foreground">No yearly or half-yearly patterns found yet. Predictions need at least two payments about 6 or 12 months apart.</p>}
        {open.map((c) => { const e = edit[c.key] ?? { amount: c.estimate, date: c.nextDate }; return (
          <div key={c.key} className="mb-3 rounded-xl border border-dashed p-3">
            <div className="flex justify-between gap-2"><div className="font-semibold">{c.name}</div><span className="text-xs text-muted-foreground">every {c.everyMonths} months</span></div>
            <div className="text-xs text-muted-foreground">History: {c.occurrences.map((o) => `${o.date} ${money(o.amount)}`).join(" · ")}</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Input type="number" className="h-10" value={e.amount} onChange={(x) => setEdit({ ...edit, [c.key]: { ...e, amount: Number(x.target.value) || 0 } })} aria-label="Expected amount" />
              <Input type="date" className="h-10" value={e.date} onChange={(x) => setEdit({ ...edit, [c.key]: { ...e, date: x.target.value } })} aria-label="Expected date" />
            </div>
            <div className="mt-1 text-xs">Set aside <b className="font-mono">{money(provisionFor(e.amount, e.date, today))}</b> per month</div>
            <div className="mt-2 flex gap-2"><Button size="sm" variant="gold" disabled={busy} onClick={() => accept(c.key)}><Check className="mr-1 h-4 w-4" />Confirm</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => reject(c.key)}><X className="mr-1 h-4 w-4" />Not recurring</Button></div>
          </div>
        ); })}
      </Card>
    </>
  );
}

function Milestones() {
  const { store, metrics, today } = useIntelligence();
  const { preferences: pr, savePreferences } = store;
  const [form, setForm] = useState({ name: "", metric: "emergency_amount" as MilestoneMetric, target: 0, targetDate: "", loanName: "", notify: false });
  const list = pr.milestones;
  // Record today's verified value once per day so progress history builds up automatically.
  useEffect(() => {
    if (!list.length || list.every((m) => m.history.some((h) => h.date === today))) return;
    void savePreferences({ ...pr, milestones: list.map((m) => recordProgress(m, metricValue(m, metrics), today)) }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length, today]);
  const add = async () => {
    if (!form.name.trim() || !Number.isFinite(form.target) || form.target < 0 || (!["card_debt", "loan_balance"].includes(form.metric) && form.target === 0) || (form.metric === "loan_balance" && !form.loanName)) { toast.error("Enter a name, valid target and loan where needed"); return; }
    const m: Milestone = { id: crypto.randomUUID(), name: form.name, metric: form.metric, target: form.target, targetDate: form.targetDate || null, loanName: form.loanName || undefined, notify: form.notify, history: [], createdAt: today, manual: form.metric === "custom" ? 0 : undefined };
    const start = metricValue(m, metrics);
    try { await savePreferences({ ...pr, milestones: [...list, recordProgress({ ...m, start }, start, today)] }); setForm({ ...form, name: "", target: 0 }); toast.success("Milestone added"); } catch (e) { toast.error((e as Error).message); }
  };
  const update = async (id: string, patch: Partial<Milestone>) => {
    if (patch.manual !== undefined && (!Number.isFinite(patch.manual) || patch.manual < 0)) { toast.error("Progress cannot be negative"); return; }
    try { await savePreferences({ ...pr, milestones: list.map((m) => m.id === id ? recordProgress({ ...m, ...patch }, metricValue({ ...m, ...patch }, metrics), today) : m) }); } catch (e) { toast.error((e as Error).message); }
  };
  const presets: [string, MilestoneMetric, number][] = [["First ₹1 lakh emergency reserve", "emergency_amount", 100000], ["3 months emergency cover", "emergency_months", 3], ["Clear credit card dues", "card_debt", 0], ["₹10 lakh net worth", "net_worth", 1000000]];
  return (
    <>
      {list.map((m) => { const pg = milestoneProgress(m, metrics, today); const months = m.metric === "emergency_months"; const fmt = (n: number) => (months ? `${n} mo` : money(n)); return (
        <Card key={m.id} title={m.name} action={<Button size="icon" variant="ghost" aria-label="Delete milestone" onClick={() => confirm("Delete this milestone?") && savePreferences({ ...pr, milestones: list.filter((x) => x.id !== m.id) })}><Trash2 className="h-4 w-4" /></Button>}>
          <Bar pct={pg.pct} />
          <div className="mt-1 text-xs text-muted-foreground">{pg.done ? "Achieved 🎉" : `${pg.pct}% · ${METRIC_LABEL[m.metric]}`}</div>
          <Row label="Current" value={fmt(pg.value)} strong />
          <Row label="Target" value={fmt(m.target)} />
          <Row label="Remaining" value={fmt(pg.remaining)} />
          <Row label="Estimated completion" value={pg.eta ?? "Needs more history"} />
          {m.targetDate && <Row label={`Target date ${m.targetDate}`} value={pg.onTrack ? "On track" : "Behind"} tone={pg.onTrack ? "good" : "bad"} />}
          {m.metric === "custom" && <div className="mt-2 flex gap-2"><Input type="number" className="h-10" placeholder="Update progress ₹" onBlur={(e) => e.target.value && update(m.id, { manual: Number(e.target.value) })} /></div>}
          {m.history.length > 1 && <div className="mt-2 text-[11px] text-muted-foreground">History: {m.history.slice(-5).map((h) => `${h.date.slice(5)} ${fmt(h.value)}`).join(" · ")}</div>}
          <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={m.notify} onChange={(e) => update(m.id, { notify: e.target.checked })} /> Celebrate on Home when achieved</label>
        </Card>
      ); })}
      <Card title="New milestone">
        <div className="mb-3 flex flex-wrap gap-2">{presets.map(([n, mt, t]) => <Button key={n} size="sm" variant="outline" onClick={() => setForm({ ...form, name: n, metric: mt, target: t })}>{n}</Button>)}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Name</Label><Input className="h-11" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Measured by</Label><select className={fieldCls} value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value as MilestoneMetric })}>{MILESTONE_METRICS.map((k) => <option key={k} value={k}>{METRIC_LABEL[k]}</option>)}</select></div>
          {form.metric === "loan_balance" && <div><Label>Loan</Label><select className={fieldCls} value={form.loanName} onChange={(e) => setForm({ ...form, loanName: e.target.value })}><option value="">Choose</option>{store.loans.map((l) => <option key={l.id}>{l.name}</option>)}</select></div>}
          <div><Label>Target</Label><Input type="number" className="h-11" value={form.target || ""} onChange={(e) => setForm({ ...form, target: Number(e.target.value) || 0 })} /></div>
          <div><Label>Target date (optional)</Label><Input type="date" className="h-11" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /></div>
        </div>
        <Button variant="gold" className="mt-3 w-full" onClick={add}>Add milestone</Button>
        <p className="mt-2 text-xs text-muted-foreground">Progress comes from your recorded balances and loans. Nothing is moved or paid automatically.</p>
      </Card>
    </>
  );
}
