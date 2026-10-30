import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/expenses";
import { accountBalance, type Account } from "@/lib/ledger";
import { amortize, goalProgress, prepayment } from "@/lib/planning";
import { useStore, type Loan } from "@/lib/store";
import { todayISO } from "@/lib/use-position";

const months = (n: number) => (Number.isFinite(n) ? `${Math.floor(n / 12)}y ${n % 12}m` : "never");

export function CardDetails({ a }: { a: Account }) {
  const { updateAccount, transactions } = useStore();
  const [limit, setLimit] = useState(a.creditLimit ? String(a.creditLimit) : "");
  const [day, setDay] = useState(a.dueDay ? String(a.dueDay) : "");
  const due = accountBalance(a, transactions);
  const util = a.creditLimit ? Math.round((due / a.creditLimit) * 100) : null;
  return (
    <div className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2 border-t pt-2">
      <div className="grid gap-1"><Label htmlFor={`l-${a.id}`} className="text-xs">Limit (₹)</Label><Input id={`l-${a.id}`} type="number" value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
      <div className="grid gap-1"><Label htmlFor={`d-${a.id}`} className="text-xs">Due day</Label><Input id={`d-${a.id}`} type="number" min="1" max="31" value={day} onChange={(e) => setDay(e.target.value)} /></div>
      <Button size="sm" variant="secondary" onClick={() => updateAccount(a.id, { creditLimit: limit ? Number(limit) : null, dueDay: day ? Number(day) : null }).then(() => toast.success("Card updated")).catch((e) => toast.error(e.message))}>Save</Button>
      {util !== null && (
        <div className="col-span-3">
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={util >= 70 ? "h-full bg-destructive" : "h-full bg-primary"} style={{ width: `${Math.min(100, Math.max(0, util))}%` }} /></div>
          <div className="mt-1 text-xs text-muted-foreground">{util}% used · {money(Math.max(0, (a.creditLimit ?? 0) - due))} available{util >= 70 ? " · high utilisation" : ""}</div>
        </div>
      )}
    </div>
  );
}

export function LoansPanel() {
  const { loans, saveLoan, removeLoan } = useStore();
  const [f, setF] = useState({ name: "", principal: "", rate: "", emi: "", nextDue: todayISO() });
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    saveLoan({ name: f.name, principal: Number(f.principal), rate: Number(f.rate), emi: Number(f.emi), nextDue: f.nextDue })
      .then(() => { setF({ ...f, name: "", principal: "", rate: "", emi: "" }); toast.success("Loan added"); })
      .catch((err) => toast.error(err.message));
  };
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-bold">Loans & EMIs</h2>
      {loans.map((l) => <LoanCard key={l.id} l={l} onRemove={() => removeLoan(l.id).catch((e) => toast.error(e.message))} />)}
      <form onSubmit={add} className="grid grid-cols-2 gap-2 rounded-3xl border bg-card p-4">
        <div className="col-span-2 grid gap-1"><Label htmlFor="ln">Loan</Label><Input id="ln" placeholder="Home loan — SBI" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid gap-1"><Label htmlFor="lp">Outstanding (₹)</Label><Input id="lp" type="number" value={f.principal} onChange={(e) => setF({ ...f, principal: e.target.value })} /></div>
        <div className="grid gap-1"><Label htmlFor="lr">Interest % / yr</Label><Input id="lr" type="number" step="0.01" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></div>
        <div className="grid gap-1"><Label htmlFor="le">EMI (₹)</Label><Input id="le" type="number" value={f.emi} onChange={(e) => setF({ ...f, emi: e.target.value })} /></div>
        <div className="grid gap-1"><Label htmlFor="ld">Next EMI</Label><Input id="ld" type="date" value={f.nextDue} onChange={(e) => setF({ ...f, nextDue: e.target.value })} /></div>
        <Button type="submit" className="col-span-2">Add loan</Button>
      </form>
    </section>
  );
}

function LoanCard({ l, onRemove }: { l: Loan; onRemove: () => void }) {
  const [extra, setExtra] = useState("");
  const a = amortize(l.principal, l.rate, l.emi);
  const sim = Number(extra) > 0 ? prepayment(l.principal, l.rate, l.emi, Number(extra)) : null;
  const first = a.schedule[0];
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="font-medium">{l.name}</div>
          <div className="text-xs text-muted-foreground">{money(l.principal)} at {l.rate}% · EMI {money(l.emi)} · next {l.nextDue}</div>
        </div>
        <Button size="icon" variant="ghost" aria-label={`Delete ${l.name}`} onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
      </div>
      {a.payable ? (
        <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
          <div><div className="text-[11px] text-muted-foreground">Time left</div><div className="font-mono">{months(a.months)}</div></div>
          <div><div className="text-[11px] text-muted-foreground">Interest left</div><div className="font-mono">{money(a.totalInterest)}</div></div>
          <div><div className="text-[11px] text-muted-foreground">Next EMI split</div><div className="font-mono text-xs">{first ? `${money(first.principal)} + ${money(first.interest)} int.` : "—"}</div></div>
        </div>
      ) : <p className="mt-2 text-sm text-destructive">This EMI doesn't cover the monthly interest — the loan would never close.</p>}
      <div className="mt-3 grid gap-1">
        <Label htmlFor={`x-${l.id}`} className="text-xs">What if I prepay (₹)?</Label>
        <Input id={`x-${l.id}`} type="number" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. 100000" />
      </div>
      {sim && (
        <div className="mt-2 grid gap-2 rounded-xl bg-secondary p-3 text-sm sm:grid-cols-2">
          <div><b>Keep EMI:</b> finish {months(sim.reduceTenure.monthsSaved)} sooner, save {money(sim.reduceTenure.interestSaved)} interest.</div>
          <div><b>Keep tenure:</b> EMI drops by {money(sim.reduceEmi.emiDrop)} to {money(sim.reduceEmi.newEmi)}, save {money(sim.reduceEmi.interestSaved)}.</div>
          <div className="text-xs text-muted-foreground sm:col-span-2">Hypothetical — uses the rate and EMI you entered. Your cash today drops by {money(Number(extra))}.</div>
        </div>
      )}
    </div>
  );
}

export function GoalsPanel() {
  const { goals, saveGoal, removeGoal } = useStore();
  const [f, setF] = useState({ name: "", target: "", saved: "0", monthly: "", reserve: false });
  const today = todayISO();
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    saveGoal({ name: f.name, target: Number(f.target), saved: Number(f.saved), monthly: Number(f.monthly || 0), reserve: f.reserve })
      .then(() => { setF({ name: "", target: "", saved: "0", monthly: "", reserve: false }); toast.success("Goal added"); })
      .catch((err) => toast.error(err.message));
  };
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-bold">Goals & reserves</h2>
      {goals.map((g) => {
        const p = goalProgress(g, today);
        return (
          <div key={g.id} className="rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 font-medium">{g.name}{g.reserve && <span className="ml-2 rounded-full bg-secondary px-2 text-[11px]">held back from safe-to-spend</span>}</div>
              <Button size="sm" variant="ghost" onClick={() => { const v = window.prompt("Saved so far (₹)", String(g.saved)); if (v !== null) saveGoal({ ...g, saved: Number(v) }).catch((e) => toast.error(e.message)); }}>Update</Button>
              <Button size="icon" variant="ghost" aria-label={`Delete ${g.name}`} onClick={() => removeGoal(g.id).catch((e) => toast.error(e.message))}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${p.pct}%` }} /></div>
            <div className="mt-1 text-xs text-muted-foreground">{money(g.saved)} of {money(g.target)} · {money(p.remaining)} to go · {p.eta ? `on track for ${p.eta}` : "set a monthly amount to see a date"}</div>
          </div>
        );
      })}
      <form onSubmit={add} className="grid grid-cols-2 gap-2 rounded-3xl border bg-card p-4">
        <div className="col-span-2 grid gap-1"><Label htmlFor="gn">Goal</Label><Input id="gn" placeholder="Emergency fund, School fees…" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid gap-1"><Label htmlFor="gt">Target (₹)</Label><Input id="gt" type="number" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></div>
        <div className="grid gap-1"><Label htmlFor="gs">Saved (₹)</Label><Input id="gs" type="number" value={f.saved} onChange={(e) => setF({ ...f, saved: e.target.value })} /></div>
        <div className="grid gap-1"><Label htmlFor="gm">Per month (₹)</Label><Input id="gm" type="number" value={f.monthly} onChange={(e) => setF({ ...f, monthly: e.target.value })} /></div>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={f.reserve} onChange={(e) => setF({ ...f, reserve: e.target.checked })} className="accent-[var(--primary)]" />Keep aside</label>
        <Button type="submit" className="col-span-2">Add goal</Button>
      </form>
    </section>
  );
}
