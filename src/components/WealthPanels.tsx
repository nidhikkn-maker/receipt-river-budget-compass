import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/expenses";
import { accountBalance, type Account } from "@/lib/ledger";
import { amortize, goalProgress, prepayment, closureDate, addMonths, LOAN_TYPES, LOAN_TYPE_LABEL, type LoanType } from "@/lib/planning";
import { cardCycle, CARD_STATUS_LABEL } from "@/lib/cards";
import { cardEmisOf } from "@/lib/position";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useStore, type Goal, type Loan } from "@/lib/store";
import { ValueDialog } from "./ValueDialog";
import { goalSavedProblem } from "@/lib/value-edits";
import { loanHistory, loanBalanceChart, loanHistoryRows, payoffProjection } from "@/lib/loan-history";
import { downloadBlob } from "@/lib/reports";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { todayISO } from "@/lib/use-position";
import { emiReconciliation, emiTargets, matchEmiDebit, type EmiRowStatus } from "@/lib/emi-match";
import { LoanFundingPanel } from "./LoanFundingPanel";
import { LoanBalanceReview } from './books/LoanBalanceReview';
import { ArchivedGoals, ArchivedLoans, TableArchiveButton, useGoalsSplit, useLoansSplit } from "./WealthArchive";

const months = (n: number) => (Number.isFinite(n) ? `${Math.floor(n / 12)}y ${n % 12}m` : "never");

export function CardDetails({ a }: { a: Account }) {
  const { updateAccount, transactions, loans, preferences, accounts, payCard } = useStore();
  const [issuer, setIssuer] = useState(a.issuer ?? "");
  const [digits, setDigits] = useState(a.lastFour ?? "");
  const [statementDay, setStatementDay] = useState(String(a.statementDay ?? ""));
  const [rate, setRate] = useState(String(a.interestRate ?? ""));
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(a.creditLimit ? String(a.creditLimit) : "");
  const [day, setDay] = useState(a.dueDay ? String(a.dueDay) : "");
  const due = accountBalance(a, transactions);
  const util = a.creditLimit ? Math.round((due / a.creditLimit) * 100) : null;
  const cycle = cardCycle(a, transactions, cardEmisOf(loans), todayISO(), preferences.cardAlertPct);
  const [payFrom, setPayFrom] = useState("none");
  // P0-005b: an in-app form (no window.prompt). One payment id per form: a retry after a lost response
  // reuses it, so the payment is recorded once; a new id is made only after a confirmed save.
  const [payAmount, setPayAmount] = useState(() => String(cycle.remainingDue || Math.max(0, due) || ""));
  const [payDate, setPayDate] = useState(todayISO());
  const [payId, setPayId] = useState(() => crypto.randomUUID());
  const fromName = accounts.find((x) => x.id === payFrom)?.name;
  const amountValue = Number(payAmount);
  const payReady = payFrom !== "none" && Number.isFinite(amountValue) && amountValue > 0;
  const pay = async () => {
    if (!payReady) return;
    try {
      const r = await payCard({ requestId: payId, fromAccountId: payFrom, cardAccountId: a.id, amount: amountValue, date: payDate, note: "Credit card settlement" });
      toast.success(r.replayed ? "This card payment was already recorded" : "Card payment recorded");
      setPayId(crypto.randomUUID());
    } catch (e) { toast.error(`${(e as Error).message} Retrying records it once.`); }
  };
  return (
    <div className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2 border-t pt-2">
      <div className="grid gap-1"><Label htmlFor={`l-${a.id}`} className="text-xs">Limit (₹)</Label><Input id={`l-${a.id}`} type="number" value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
      <div className="grid gap-1"><Label htmlFor={`d-${a.id}`} className="text-xs">Due day</Label><Input id={`d-${a.id}`} type="number" min="1" max="31" value={day} onChange={(e) => setDay(e.target.value)} /></div>
      <Button size="sm" variant="secondary" onClick={() => updateAccount(a.id, { issuer, lastFour: digits || null, statementDay: statementDay ? Number(statementDay) : null, interestRate: rate ? Number(rate) : null, creditLimit: limit ? Number(limit) : null, dueDay: day ? Number(day) : null }).then(() => toast.success("Card updated")).catch((e) => toast.error(e.message))}>Save</Button>
      <div className="col-span-3 grid grid-cols-2 gap-2"><div><Label htmlFor={`issuer-${a.id}`}>Bank / issuer</Label><Input id={`issuer-${a.id}`} value={issuer} onChange={e=>setIssuer(e.target.value)}/></div><div><Label htmlFor={`digits-${a.id}`}>Last four digits</Label><Input id={`digits-${a.id}`} maxLength={4} value={digits} onChange={e=>setDigits(e.target.value)}/></div><div><Label htmlFor={`statement-${a.id}`}>Statement day</Label><Input id={`statement-${a.id}`} type="number" min="1" max="31" value={statementDay} onChange={e=>setStatementDay(e.target.value)}/></div><div><Label htmlFor={`rate-${a.id}`}>Annual interest %</Label><Input id={`rate-${a.id}`} type="number" min="0" max="100" value={rate} onChange={e=>setRate(e.target.value)}/></div></div>
      <div className="col-span-3 grid grid-cols-2 gap-2 border-t pt-3 text-xs"><div>Status: <b>{CARD_STATUS_LABEL[cycle.status]}</b></div><div>Due: {cycle.dueDate ?? "—"}</div><div>Statement: {money(cycle.statementBalance)}</div><div>Remaining due: {money(cycle.remainingDue)}</div><div>Unbilled: {money(cycle.unbilled)}</div><div>Payments: {money(cycle.paymentsSinceStatement)}</div><div>Interest & charges: {money(cycle.interestSinceStatement)}</div><div>EMI principal left: {money(cycle.emiOutstanding)}</div></div>
      <fieldset className="col-span-3 grid grid-cols-2 gap-2 border-t pt-3" aria-label={`Record a payment to ${a.name}`}>
        <legend className="text-xs font-semibold">Record a card payment</legend>
        <div className="col-span-2 grid gap-1"><Label className="text-xs">Paid from</Label><Select value={payFrom} onValueChange={setPayFrom}><SelectTrigger aria-label={`Pay ${a.name} from`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Payment account</SelectItem>{accounts.filter(x=>!x.archived&&["savings","current","cash","wallet"].includes(x.kind)).map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid gap-1"><Label htmlFor={`pay-amount-${a.id}`} className="text-xs">Amount (₹)</Label><Input id={`pay-amount-${a.id}`} type="number" inputMode="decimal" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
        <div className="grid gap-1"><Label htmlFor={`pay-date-${a.id}`} className="text-xs">Paid on</Label><Input id={`pay-date-${a.id}`} type="date" max={todayISO()} value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
        {payReady && <p className="col-span-2 text-xs text-muted-foreground" role="status">{money(amountValue)} from {fromName} to {a.name} on {payDate}. This moves money between your accounts; it is not spending.</p>}
        <div className="col-span-2"><Button size="sm" disabled={!payReady} onClick={pay}>Record payment</Button></div>
      </fieldset>
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
  const { saveLoan } = useStore();
  // Archive instead of delete (P0-008): archived loans are only listed apart; they stay stored and in what you owe.
  const loans = useLoansSplit();
  const [f, setF] = useState({ name: "", principal: "", rate: "", emi: "", nextDue: todayISO(), provider: "", loanType: "personal" as LoanType, original: "", startDate: "", prepaymentTerms: "", foreclosure: "0" });
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    saveLoan({ name: f.name, principal: Number(f.principal), rate: Number(f.rate), emi: Number(f.emi), nextDue: f.nextDue, provider: f.provider, loanType: f.loanType, original: f.original ? Number(f.original) : null, startDate: f.startDate || null, prepaymentTerms: f.prepaymentTerms, foreclosurePct: Number(f.foreclosure) })
      .then(() => { setF({ ...f, name: "", principal: "", rate: "", emi: "" }); toast.success("Loan added"); })
      .catch((err) => toast.error(err.message));
  };
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-bold">Loans & EMIs</h2>
      {loans.active.map((l) => <LoanCard key={l.id} l={l} />)}
      <ArchivedLoans rows={loans.archived} />
      <details className="cmp-manage"><summary>Add a loan</summary><form onSubmit={add} className="grid grid-cols-2 gap-2 rounded-3xl border bg-card p-4">
        <div className="col-span-2 grid gap-1"><Label htmlFor="ln">Loan</Label><Input id="ln" placeholder="Home loan — SBI" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid gap-1"><Label htmlFor="loan-provider">Provider</Label><Input id="loan-provider" value={f.provider} onChange={e=>setF({...f,provider:e.target.value})}/></div><div className="grid gap-1"><Label>Loan type</Label><Select value={f.loanType} onValueChange={v=>setF({...f,loanType:v as LoanType})}><SelectTrigger aria-label="Loan type"><SelectValue/></SelectTrigger><SelectContent>{LOAN_TYPES.filter(t=>t!=="credit_card_emi").map(t=><SelectItem key={t} value={t}>{LOAN_TYPE_LABEL[t]}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid gap-1"><Label htmlFor="loan-original">Original principal (₹)</Label><Input id="loan-original" type="number" value={f.original} onChange={e=>setF({...f,original:e.target.value})}/></div><div className="grid gap-1"><Label htmlFor="loan-start">Start date</Label><Input id="loan-start" type="date" value={f.startDate} onChange={e=>setF({...f,startDate:e.target.value})}/></div>
        <div className="grid gap-1"><Label htmlFor="loan-foreclosure">Foreclosure charge %</Label><Input id="loan-foreclosure" type="number" min="0" max="20" value={f.foreclosure} onChange={e=>setF({...f,foreclosure:e.target.value})}/></div><div className="grid gap-1"><Label htmlFor="loan-terms">Prepayment terms</Label><Input id="loan-terms" value={f.prepaymentTerms} onChange={e=>setF({...f,prepaymentTerms:e.target.value})}/></div>
        <div className="grid gap-1"><Label htmlFor="lp">Still to pay (₹)</Label><Input id="lp" type="number" value={f.principal} onChange={(e) => setF({ ...f, principal: e.target.value })} /></div>
        <div className="grid gap-1"><Label htmlFor="lr">Interest % / yr</Label><Input id="lr" type="number" step="0.01" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></div>
        <div className="grid gap-1"><Label htmlFor="le">EMI (₹)</Label><Input id="le" type="number" value={f.emi} onChange={(e) => setF({ ...f, emi: e.target.value })} /></div>
        <div className="grid gap-1"><Label htmlFor="ld">Next EMI</Label><Input id="ld" type="date" value={f.nextDue} onChange={(e) => setF({ ...f, nextDue: e.target.value })} /></div>
        <Button type="submit" className="col-span-2">Add loan</Button>
      </form></details>
    </section>
  );
}

function LoanCard({ l }: { l: Loan }) {
  const { accounts, recordLoanPayment, transactions } = useStore();
  const hist = loanHistory(l.accountId, l.principal, transactions, l.name);
  const chart = loanBalanceChart(hist.rows);
  const payoff = payoffProjection(l.principal, l.rate, hist.rows, l.emi, todayISO());
  const [from, setFrom] = useState("none"); const [payDate, setPayDate] = useState(todayISO()); const [busy,setBusy]=useState(false);
  const [extra, setExtra] = useState("");
  const a = amortize(l.principal, l.rate, l.emi);
  const sim = Number(extra) > 0 ? prepayment(l.principal, l.rate, l.emi, Number(extra), l.foreclosurePct) : null;
  const first = a.schedule[0];
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="font-medium">{l.name}</div>
          <div className="text-xs text-muted-foreground">{money(l.principal)} at {l.rate}% · EMI {money(l.emi)} · next {l.nextDue}</div>
          <div className="text-xs text-muted-foreground">{LOAN_TYPE_LABEL[l.loanType]} · {l.provider || "No provider"} · {l.status} · closes {closureDate(l.nextDue,a.months) ?? "—"}</div>
        </div>
        <TableArchiveButton table="loans" id={l.id} name={l.name} noun="loan" />
      </div>
      {a.payable ? (
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div className="min-w-0"><div className="text-[11px] text-muted-foreground">Time left</div><div className="font-mono">{months(a.months)}</div></div>
          <div className="min-w-0"><div className="text-[11px] text-muted-foreground">Interest left</div><div className="break-words font-mono">{money(a.totalInterest)}</div></div>
          <div className="col-span-2 min-w-0 sm:col-span-1"><div className="text-[11px] text-muted-foreground">Next EMI split</div><div className="break-words font-mono text-xs">{first ? `${money(first.principal)} + ${money(first.interest)} int.` : "—"}</div></div>
        </div>
      ) : <p className="mt-2 text-sm text-destructive">This EMI doesn't cover the monthly interest — the loan would never close.</p>}
      {l.principal > 0 && <div className="mt-3 rounded-xl border p-2 text-sm">
        <div className="font-medium">Payoff projection</div>
        {payoff.payable ? <p className="text-xs text-muted-foreground">At {money(payoff.payment)} a month ({payoff.basis === "recent" ? `average of your last ${Math.min(3, hist.rows.length)} repayment${hist.rows.length === 1 ? "" : "s"}` : "scheduled EMI — no repayments recorded yet"}), paid off around <span className="font-mono text-foreground">{payoff.payoffDate}</span> · {months(payoff.months)} · about {money(payoff.interestLeft)} more interest.</p>
          : <p className="text-xs text-destructive">At {money(payoff.payment)} a month the interest isn't covered, so this loan won't be paid off at that pace.</p>}
      </div>}
      {hist.rows.length > 0 && <details className="mt-3 rounded-xl border p-2">
        <summary className="cursor-pointer text-sm font-medium">Repayment history · {hist.rows.length} · principal {money(hist.totalPrincipal)} · interest {money(hist.totalInterest)}</summary>
        <div className="mt-2 flex justify-end"><Button size="sm" variant="outline" onClick={() => downloadBlob(new Blob([loanHistoryRows(hist, l.principal).map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" }), `loan-${l.name.replace(/\W+/g, "-")}-repayments.csv`)}>Export CSV</Button></div>
        <div className="mt-2">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis width={56} tick={{ fontSize: 11 }} tickFormatter={(v: number) => (v >= 1e5 ? `${Math.round((v / 1e5) * 100) / 100}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Line type="monotone" dataKey="balance" name="Balance left" stroke="var(--chart-4)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-muted-foreground">Balance left after each repayment, starting from {money(chart[0]!.balance)} before the first one.</p>
        </div>
        <div className="mt-2 grid grid-cols-5 gap-1 text-[11px] text-muted-foreground"><span>Date</span><span>Paid</span><span>Principal</span><span>Interest</span><span>Balance after</span></div>
        {hist.rows.map((r) => <div key={r.id} className="grid grid-cols-5 gap-1 border-t py-1 font-mono text-xs"><span>{r.date}</span><span>{money(r.amount)}</span><span>{money(r.principal)}</span><span>{r.split ? money(r.interest) : "—"}</span><span title={`From ${money(r.balanceBefore)}`}>{money(r.balanceAfter)}</span></div>)}
        <div className="mt-1 grid grid-cols-5 gap-1 border-t pt-1 text-xs font-medium"><span>Total</span><span>{money(hist.totalPaid)}</span><span>{money(hist.totalPrincipal)}</span><span>{money(hist.totalInterest)}</span><span>{money(l.principal)}</span></div>
        {hist.rows.some((r) => !r.split) && <p className="mt-1 text-[11px] text-muted-foreground">Repayments without a split are counted fully as principal.</p>}
      </details>}
      <div className="mt-3 grid gap-1">
        <Label htmlFor={`x-${l.id}`} className="text-xs">What if I prepay (₹)?</Label>
        <Input id={`x-${l.id}`} type="number" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. 100000" />
      </div>
      {sim && (
        <div className="mt-2 grid gap-2 rounded-xl bg-secondary p-3 text-sm sm:grid-cols-2">
          <div><b>Keep EMI:</b> finish {months(sim.reduceTenure.monthsSaved)} sooner, save {money(sim.reduceTenure.interestSaved)} interest.</div>
          <div><b>Keep tenure:</b> EMI drops by {money(sim.reduceEmi.emiDrop)} to {money(sim.reduceEmi.newEmi)}, save {money(sim.reduceEmi.interestSaved)}.</div>
          <div className="text-xs text-muted-foreground sm:col-span-2">Charge: {money(sim.charge)} · cash needed: {money(sim.cashImpact)} · net savings: {money(sim.reduceTenure.netSaving)}. {l.prepaymentTerms}</div>
        </div>
      )}
      {l.status!=="closed"&&<div className="mt-4 grid gap-2 border-t pt-3"><Input aria-label={`Payment date for ${l.name}`} type="date" max={todayISO()} value={payDate} onChange={e=>setPayDate(e.target.value)}/>{l.loanType!=="credit_card_emi"&&<Select value={from} onValueChange={setFrom}><SelectTrigger aria-label={`Pay ${l.name} from`}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Payment account</SelectItem>{accounts.filter(x=>!x.archived&&["savings","current","cash","wallet"].includes(x.kind)).map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select>}<Button size="sm" disabled={busy||(l.loanType!=="credit_card_emi"&&from==="none")} onClick={async()=>{setBusy(true);try{await recordLoanPayment(l,{fromAccountId:from==="none"?null:from,date:payDate});toast.success("EMI recorded");}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}}>{l.loanType==="credit_card_emi"?"Record billed instalment":"Record EMI payment"}</Button></div>}
      <LoanBalanceReview loan={l} />
      {l.loanType !== "credit_card_emi" && <><LoanFundingPanel loan={l} /><EmiReconciliation l={l} /></>}
      <details className="mt-3"><summary className="cursor-pointer text-sm">Payment history & full schedule</summary><ul className="mt-2 divide-y text-xs">{l.payments.map((p,i)=><li key={i} className="py-2">{p.date} · principal {money(p.principal)} + interest {money(p.interest)} = {money(p.total)}</li>)}</ul><div className="mt-2 max-h-64 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th>Date</th><th>Principal</th><th>Interest</th><th>Balance</th></tr></thead><tbody>{a.schedule.map(row=><tr key={row.month} className="border-t"><td className="py-2">{addMonths(l.nextDue,row.month-1)}</td><td>{money(row.principal)}</td><td>{money(row.interest)}</td><td>{money(row.balance)}</td></tr>)}</tbody></table></div></details>
    </div>
  );
}

export function GoalsPanel() {
  const { saveGoal } = useStore();
  // Archive instead of delete (P0-013): archived goals stay stored and, if a reserve, still held back from safe-to-spend.
  const goals = useGoalsSplit();
  const [f, setF] = useState({ name: "", target: "", saved: "0", monthly: "", reserve: false });
  const [updating, setUpdating] = useState<Goal | null>(null);
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
      <ValueDialog
        open={!!updating}
        title={`Update “${updating?.name ?? ""}”`}
        description={`How much is set aside for this goal now (target ${money(updating?.target ?? 0)}). This updates the goal's progress only; no money moves and no entry is recorded.`}
        label="Saved so far (₹)"
        inputMode="decimal"
        initialValue={String(updating?.saved ?? "")}
        confirmLabel="Save amount"
        validate={goalSavedProblem}
        onSubmit={(v) => updating ? saveGoal({ ...updating, saved: Number(v) }) : Promise.resolve()}
        onClose={() => setUpdating(null)}
      />
      {goals.active.map((g) => {
        const p = goalProgress(g, today);
        return (
          <div key={g.id} className="rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 font-medium">{g.name}{g.reserve && <span className="ml-2 rounded-full bg-secondary px-2 text-[11px]">held back from safe-to-spend</span>}</div>
              <Button size="sm" variant="ghost" aria-label={`Update saved so far for ${g.name}`} onClick={() => setUpdating(g)}>Update</Button>
              <TableArchiveButton table="goals" id={g.id} name={g.name} noun="goal" />
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${p.pct}%` }} /></div>
            <div className="mt-1 text-xs text-muted-foreground">{money(g.saved)} of {money(g.target)} · {money(p.remaining)} to go · {p.eta ? `on track for ${p.eta}` : "set a monthly amount to see a date"}</div>
          </div>
        );
      })}
      <ArchivedGoals rows={goals.archived} />
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

const EMI_STATUS: Record<EmiRowStatus, { label: string; tone: string }> = {
  matched: { label: "Matched", tone: "text-muted-foreground" },
  amount: { label: "Amount differs", tone: "text-destructive" },
  date: { label: "Date differs", tone: "text-warning" },
  missing: { label: "No payment seen in the bank", tone: "text-destructive" },
  funded_only: { label: "Money arrived, EMI payment not seen yet", tone: "text-muted-foreground" },
  lender_only: { label: "Lender only", tone: "text-muted-foreground" },
  upcoming: { label: "Upcoming", tone: "text-muted-foreground" },
};

/** Each scheduled EMI beside the bank debit that paid it; read-only, never changes records. */
function EmiReconciliation({ l }: { l: Loan }) {
  const { accounts, commitments, transactions } = useStore();
  const target = emiTargets([l], commitments, accounts)[0];
  if (!target) return null;
  const debits = transactions.filter((e) =>
    (e.txnType === "loan_repayment" && !!l.accountId && e.toAccountId === l.accountId)
    || (matchEmiDebit({ date: e.date, amount: e.amount, direction: "debit", accountId: e.accountId ?? null, description: `${e.title} ${e.merchant ?? ""} ${e.statementRef ?? ""}` }, [target]) !== null && !["income", "refund"].includes(e.txnType ?? "expense")),
  ).map((e) => ({ id: e.id, date: e.date, amount: e.amount, title: e.title }));
  const fundings = target.fundingFromAccountId && target.payFromAccountId ? transactions.filter((e) => e.txnType === "transfer" && e.accountId === target.fundingFromAccountId && e.toAccountId === target.payFromAccountId)
    .map((e) => ({ id: e.id, date: e.date, amount: e.amount })) : [];
  const from = [...l.payments.map((p) => p.date), ...debits.map((d) => d.date)].sort()[0] ?? l.nextDue;
  const rows = emiReconciliation({ emi: l.emi, dueDay: target.dueDay, from, nextDue: l.nextDue, payments: l.payments }, debits, todayISO(), fundings).reverse();
  const flagged = rows.filter((r) => r.status === "amount" || r.status === "date" || r.status === "missing").length;
  const payFrom = accounts.find((a) => a.id === target.payFromAccountId)?.name;
  return (
    <details className="mt-3 rounded-xl border p-2">
      <summary className="cursor-pointer text-sm font-medium">EMI reconciliation · {rows.length} EMIs · {flagged ? `${flagged} to check` : "all clear"}</summary>
      <p className="mt-1 text-[11px] text-muted-foreground">Scheduled EMI on day {target.dueDay}{payFrom ? ` from ${payFrom}` : ""} beside the bank debit found within 7 days before or 5 days after. Gaps up to ₹{Math.max(100, Math.round(l.emi * 0.005)).toLocaleString("en-IN")} count as matched; "Lender only" means the loan statement shows it paid but your bank records don't go back that far.</p>
      <div className="mt-2 grid grid-cols-[1fr_1fr_1fr_auto] gap-1 text-[11px] text-muted-foreground"><span>Due</span><span>Paid from bank</span><span>Difference</span><span>Status</span></div>
      {rows.map((r) => {
        const st = EMI_STATUS[r.status];
        return (
          <div key={r.due} className="grid grid-cols-[1fr_1fr_1fr_auto] items-start gap-1 border-t py-1 text-xs">
            <span className="font-mono">{r.due}<span className="block text-[10px] text-muted-foreground">{money(r.emi)}{r.lenderPaid ? ` · lender ${money(r.lenderPaid)}` : ""}{r.funding ? ` · funded ${r.funding.date.slice(5)}` : ""}</span></span>
            <span className="min-w-0 font-mono">{r.debit ? <>{r.debit.date}<span className="block truncate text-[10px] text-muted-foreground" title={r.debit.title}>{money(r.debit.amount)}</span></> : "—"}</span>
            <span className="font-mono">{r.debit ? <>{r.amountDiff === 0 ? "₹0" : `${r.amountDiff! > 0 ? "+" : "−"}${money(Math.abs(r.amountDiff!))}`}<span className="block text-[10px] text-muted-foreground">{r.dayDiff === 0 ? "on time" : `${Math.abs(r.dayDiff!)}d ${r.dayDiff! < 0 ? "early" : "late"}`}</span></> : "—"}</span>
            <span className={`text-right font-medium ${st.tone}`}>{st.label}</span>
          </div>
        );
      })}
    </details>
  );
}
