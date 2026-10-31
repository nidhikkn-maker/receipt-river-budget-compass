import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check, Pause, Play, Trash2, X } from "lucide-react";
import { PageTitle, Stat } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, money } from "@/lib/expenses";
import { COMMITMENT_KINDS, FREQUENCIES, FREQ_LABEL, KIND_LABEL, dueStatus, monthlyCost, type Commitment, type CommitmentKind, type Frequency } from "@/lib/planning";
import { useStore } from "@/lib/store";
import { todayISO, usePosition } from "@/lib/use-position";
import { cn } from "@/lib/utils";
import { PlanCalendar } from "@/components/PlanCalendar";

export const Route = createFileRoute("/_authenticated/plan")({
  head: () => ({
    meta: [
      { title: "Plan — safe-to-spend & forecast — Ledgerline" },
      { name: "description", content: "Safe-to-spend, cash forecast, upcoming payments, recurring bills and subscriptions." },
      { property: "og:title", content: "Plan — Ledgerline" },
      { property: "og:description", content: "Safe-to-spend, cash forecast, upcoming payments, recurring bills and subscriptions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Plan,
});

const PERIODS = [7, 15, 30, 60, 90];
const STATUS_STYLE: Record<string, string> = {
  overdue: "bg-destructive text-destructive-foreground", due_soon: "bg-primary text-primary-foreground",
  scheduled: "bg-secondary text-secondary-foreground", paused: "bg-muted text-muted-foreground", cancelled: "bg-muted text-muted-foreground line-through",
};
const STATUS_LABEL: Record<string, string> = { overdue: "Overdue", due_soon: "Due soon", scheduled: "Scheduled", paused: "Paused", cancelled: "Cancelled" };

function Plan() {
  const [days, setDays] = useState(30);
  const [withUnconfirmed, setWithUnconfirmed] = useState(false);
  const p = usePosition(days, withUnconfirmed);
  const { commitments, saveCommitment, removeCommitment, confirmCommitment, preferences } = useStore();
  const today = todayISO();
  const short = p.forecast.shortDates;

  return (
    <>
      <PageTitle eyebrow="Plan" title="What can I spend?" sub="Works through every payment in date order — money arriving later can't pay an earlier bill." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PERIODS.map((d) => (
          <Button key={d} variant={days===d?"default":"outline"} onClick={() => setDays(d)}>{d} days</Button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withUnconfirmed} onChange={(e) => setWithUnconfirmed(e.target.checked)} className="accent-[var(--primary)]" />
          Include unconfirmed income
        </label>
      </div>
      <div className="mb-4 flex items-center gap-3"><Label htmlFor="forecast-days">Custom forecast days</Label><Input id="forecast-days" className="w-24" type="number" min="1" max="365" value={days} onChange={e=>setDays(Math.min(365,Math.max(1,Number(e.target.value)||1)))}/></div>

      <section className="mb-6 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-3xl bg-hero p-6 text-ink-foreground shadow-float">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] opacity-80">Safe to spend · next {days} days</div>
          <div className="mt-1 font-display text-5xl font-extrabold tracking-tight">{money(p.safe.amount)}</div>
          <div className="mt-1 text-sm opacity-80">Lowest point {money(p.safe.lowest)} on {p.safe.lowestDate}</div>
          <ul className="mt-5 space-y-1.5 text-sm">
            {p.safe.steps.map((s) => (
              <li key={s.label} className="flex justify-between gap-3 border-b border-ink-foreground/15 pb-1.5"><span className="opacity-85">{s.label}</span><span className="font-mono">{money(s.amount)}</span></li>
            ))}
          </ul>
          {!withUnconfirmed && <p className="mt-3 text-xs opacity-75">Unconfirmed income is left out to stay on the safe side.</p>}
        </div>

        <div className="rounded-3xl border bg-card p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Projected balance</h2>
            {short.length > 0
              ? <span className="rounded-full bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground">Short from {short[0]}</span>
              : <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">No shortfall</span>}
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={p.forecast.series}>
                <defs><linearGradient id="fc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(8)} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis hide />
                <Tooltip formatter={(v: number) => money(v)} />
                <ReferenceLine y={p.minBalance + p.reserves} stroke="var(--destructive)" strokeDasharray="4 4" />
                <Area dataKey="balance" stroke="var(--primary)" fill="url(#fc)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground">Dashed line: minimum balances + reserves.</p>
        </div>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cash now" value={money(p.cash)} />
        <Stat label="Due in period" value={money(p.upcoming.filter((u) => u.direction === "out").reduce((s, u) => s + u.amount, 0))} />
        <Stat label="Subscriptions / month" value={money(p.subscriptions.monthly)} hint={`${p.subscriptions.active} active`} />
        <Stat label="Overdue" value={String(commitments.filter((c) => dueStatus(c, today) === "overdue").length)} />
      </div>

      <PlanCalendar />
      <section className="mb-6 grid gap-5 sm:grid-cols-2"><div><h2 className="font-display text-lg font-bold">Income this month</h2><p className="mt-2 text-sm">Received {money(p.income.received)} · expected remaining {money(p.income.expectedRemaining)} · confirmed {money(p.income.expectedConfirmed)}</p><ul className="mt-2 divide-y text-sm">{Object.entries(p.income.bySource).map(([name,amount])=><li key={name} className="flex justify-between py-2"><span>{name}</span><span>{money(amount)}</span></li>)}</ul>{p.income.late.map((x,i)=><p key={i} className="text-sm text-destructive">Late income: {x.name} · {money(x.amount)}</p>)}</div><div><h2 className="font-display text-lg font-bold">Subscriptions</h2><p className="mt-2 text-sm">{p.subscriptions.active} active · {money(p.subscriptions.monthly)}/month · {money(p.subscriptions.annual)}/year</p>{p.subscriptions.summary.increases.map((x,i)=><p key={i} className="mt-2 text-sm">Price increase: {x.name}</p>)}{p.subscriptions.summary.duplicates.map((x,i)=><p key={i} className="mt-2 text-sm text-warning">Review duplicates: {x.names.join(" / ")}</p>)}</div></section>
      <section className="mb-8">
        <h2 className="mb-2 font-display text-lg font-bold">Calendar</h2>
        {!p.upcoming.length && <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing scheduled. Add salary, rent, EMIs, insurance or subscriptions below.</p>}
        <ul className="space-y-2">
          {p.upcoming.slice(0, 40).map((u, k) => {
            const c = commitments.find((x) => x.id === u.commitmentId);
            return (
              <li key={k} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
                <div className="w-14 text-center font-mono text-xs"><div className="text-lg font-bold">{u.date.slice(8)}</div>{new Date(u.date + "T00:00:00").toLocaleString("en", { month: "short" })}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{u.name}</div>
                  <div className="flex gap-1 text-[11px]">
                    {u.overdue && <span className={cn("rounded-full px-2", STATUS_STYLE["overdue"])}>Overdue</span>}
                    {u.direction === "in" && !u.confirmed && <span className="rounded-full bg-muted px-2">Unconfirmed</span>}
                  </div>
                </div>
                <div className={cn("font-mono", u.direction === "in" && "text-primary")}>{u.direction === "in" ? "+" : "−"}{money(u.amount)}</div>
                {c && (u.overdue || u.date===c.nextDue) && <PayButton c={c} onPay={confirmCommitment} />}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0">
          <h2 className="mb-2 font-display text-lg font-bold">Recurring & subscriptions</h2>
          <ul className="space-y-2">
            {commitments.map((c) => {
              const st = dueStatus(c, today);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3">
                  <div className="min-w-0 basis-1/2 flex-1">
                    <div className="truncate font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{KIND_LABEL[c.kind]} · {FREQ_LABEL[c.frequency]} · next {c.nextDue} · {money(monthlyCost(c))}/mo</div>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px]", STATUS_STYLE[st])}>{STATUS_LABEL[st] ?? st}</span>
                  <Button size="sm" variant="ghost" onClick={()=>{const v=window.prompt(`New amount for ${c.name} (₹)`,String(c.amount));if(v!==null)void saveCommitment({...c,amount:Number(v)}).catch(e=>toast.error(e.message));}}>Edit amount</Button>
                  <Button size="icon" variant="ghost" aria-label={c.status === "active" ? `Pause ${c.name}` : `Resume ${c.name}`}
                    onClick={() => saveCommitment({ ...c, status: c.status === "active" ? "paused" : "active" }).catch((e) => toast.error(e.message))}>
                    {c.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  {c.status !== "cancelled" && (
                    <Button size="icon" variant="ghost" aria-label={`Cancel ${c.name}`} onClick={() => saveCommitment({ ...c, status: "cancelled" }).catch((e) => toast.error(e.message))}><X className="h-4 w-4" /></Button>
                  )}
                  <Button size="icon" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => removeCommitment(c.id).catch((e) => toast.error(e.message))}><Trash2 className="h-4 w-4" /></Button>
                </li>
              );
            })}
          </ul>

          {p.subscriptions.detected.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 font-display font-bold">Looks like a subscription</h3>
              <ul className="space-y-2">
                {p.subscriptions.detected.filter((d) => !commitments.some((c) => c.name.toLowerCase() === d.merchant.toLowerCase())).map((d) => (
                  <li key={d.merchant} className="flex items-center gap-3 rounded-2xl border border-dashed bg-card p-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{d.merchant}</div>
                      <div className="text-xs text-muted-foreground">{d.count} charges · every ~{d.everyDays} days · last {money(d.last)}{d.increased ? " · price went up" : ""}</div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => saveCommitment({
                      name: d.merchant, kind: "subscription", direction: "out", amount: d.last, frequency: d.everyDays > 300 ? "yearly" : d.everyDays > 80 ? "quarterly" : d.everyDays < 10 ? "weekly" : "monthly",
                      intervalDays: null, nextDue: nextFrom(d.lastDate, d.everyDays, today), accountId: null, category: "Software & Subscriptions", confirmed: true, essential: false, status: "active",
                    }).then(() => toast.success("Added to subscriptions")).catch((e) => toast.error(e.message))}>Track</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <CommitmentForm />
      </section>
    </>
  );
}

function nextFrom(last: string, every: number, today: string) {
  const d = new Date(last + "T00:00:00Z");
  while (d.toISOString().slice(0, 10) < today) d.setUTCDate(d.getUTCDate() + every);
  return d.toISOString().slice(0, 10);
}

function PayButton({ c, onPay }: { c: Commitment; onPay: (c: Commitment, amount: number) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button size="sm" variant="secondary" disabled={busy} aria-label={`Mark ${c.name} ${c.direction === "in" ? "received" : "paid"}`}
      onClick={async () => {
        const v = window.prompt(`Actual amount ${c.direction === "in" ? "received" : "paid"} (₹)`, String(c.amount));
        if (v === null) return;
        setBusy(true);
        try { await onPay(c, Number(v)); toast.success("Recorded and moved to the next date"); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
      }}>
      <Check className="h-4 w-4" />{c.direction === "in" ? "Got it" : "Paid"}
    </Button>
  );
}

function CommitmentForm() {
  const { saveCommitment, accounts, preferences } = useStore();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CommitmentKind>("bill");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [interval, setInterval] = useState("30");
  const [nextDue, setNextDue] = useState(todayISO());
  const [accountId, setAccountId] = useState("none");
  const [category, setCategory] = useState<string>("Bills & Utilities");
  const [confirmed, setConfirmed] = useState(true);
  const [essential, setEssential] = useState(true);
  const [busy, setBusy] = useState(false);
  const isIncome = kind === "income";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveCommitment({ name, kind, direction: isIncome ? "in" : "out", amount: Number(amount), frequency, intervalDays: frequency === "custom" ? Number(interval) : null,
        nextDue, accountId: accountId === "none" ? null : accountId, category: isIncome ? "Income" : category, confirmed: isIncome ? confirmed : true, essential, status: "active" });
      setName(""); setAmount("");
      toast.success("Added to your plan");
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="grid content-start gap-3 rounded-3xl border bg-card p-5">
      <h2 className="font-display text-lg font-bold">Add recurring</h2>
      <div className="grid gap-1"><Label htmlFor="cn">Name</Label><Input id="cn" placeholder="Salary, Rent, Netflix, LIC…" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <Label>Kind</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as CommitmentKind)}>
            <SelectTrigger aria-label="Kind"><SelectValue /></SelectTrigger>
            <SelectContent>{COMMITMENT_KINDS.map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1"><Label htmlFor="ca">Amount (₹)</Label><Input id="ca" type="number" step="0.01" className="font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <Label>How often</Label>
          <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
            <SelectTrigger aria-label="How often"><SelectValue /></SelectTrigger>
            <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{FREQ_LABEL[f]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1"><Label htmlFor="cd">Next date</Label><Input id="cd" type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} /></div>
      </div>
      {frequency === "custom" && <div className="grid gap-1"><Label htmlFor="ci">Every (days)</Label><Input id="ci" type="number" min="1" value={interval} onChange={(e) => setInterval(e.target.value)} /></div>}
      <div className="grid gap-1">
        <Label>Account</Label>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger aria-label="Account"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="none">Not set</SelectItem>{accounts.filter((a) => !a.archived).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {!isIncome && (
        <div className="grid gap-1">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
            <SelectContent>{[...new Set([category,...preferences.categories.filter(c=>!c.archived).map(c=>c.name)])].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      {isIncome
        ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="accent-[var(--primary)]" />Confirmed (count it in safe-to-spend)</label>
        : <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={essential} onChange={(e) => setEssential(e.target.checked)} className="accent-[var(--primary)]" />Essential</label>}
      <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add"}</Button>
    </form>
  );
}
