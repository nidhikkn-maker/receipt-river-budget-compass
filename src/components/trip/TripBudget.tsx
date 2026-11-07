// Compact Trip Budget (Version 5.5): one primary budget card, an Edit Budget sheet,
// and an optional tabbed Budget Breakdown. Allocation dimensions are views of the same
// plan — never summed. Actuals come from the shared ledger only.
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Pencil, Plus, SlidersHorizontal } from "lucide-react";
import { Card, Row } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CURRENCIES, SCOPE_LABEL, money, type Scope } from "@/lib/expenses";
import { tagsInGroup } from "@/lib/preferences";
import { useStore } from "@/lib/store";
import { tripAllocationPlans } from "@/lib/trip-planning";
import { allocationReconciliation, budgetNeedsConfirmation, reimbursementBreakdown, tripBudgetSummary, validateAllocation, validateBudgetEdit, validateCompleteAllocations, BUDGET_STATUS_LABEL, type AllocationDimension } from "@/lib/trip-budget";
import { tripBudgetDetail, type TravelTrip } from "@/lib/travel";

const sel = "h-10 rounded-xl border bg-background px-2 text-sm";

const STATUS_STYLE: Record<string, string> = {
  within: "bg-secondary text-secondary-foreground",
  approaching: "bg-gold/15 text-gold-strong",
  full: "bg-gold/15 text-gold-strong",
  over: "bg-destructive/10 text-destructive",
};

/** The compact summary card: budget, actuals, remaining, reimbursable — plus the three actions. */
export function TripBudgetCard({ trip, onEdit, onBreakdown }: { trip: TravelTrip; onEdit: () => void; onBreakdown: () => void }) {
  const { preferences: pr, transactions } = useStore();
  const s = useMemo(() => tripBudgetSummary(trip, transactions, pr.tripBudgetWarnPct), [trip, transactions, pr.tripBudgetWarnPct]);
  const closed = !!trip.closedAt;
  return (
    <Card title="Trip Budget">
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{SCOPE_LABEL[trip.primaryWorkspace ?? (trip.type === "mixed" ? "personal" : trip.type ?? "personal")]}{trip.organisation ? ` · ${trip.organisation}` : ""} · {s.currency}</span>
        {s.updatedAt && <span>Updated {s.updatedAt.slice(0, 10)}</span>}
      </div>
      {!s.hasBudget && !s.needsConfirmation && (
        <div className="py-2 text-center">
          <p className="text-sm font-semibold">Budget not set</p>
          <p className="mt-1 text-xs text-muted-foreground">Add an overall budget to track this trip against a plan.</p>
          {!closed && <Button variant="gold" size="sm" className="mt-3" onClick={onEdit}><Plus className="mr-1 h-4 w-4" />Add Budget</Button>}
        </div>
      )}
      {!s.hasBudget && s.needsConfirmation && (
        <div className="py-2">
          <p className="text-sm font-semibold">Budget requires confirmation</p>
          <p className="mt-1 text-xs text-muted-foreground">This trip has saved allocations but no overall budget. Review the breakdown, then set the primary budget — allocations are never added together automatically.</p>
          <div className="mt-3 flex gap-2">
            {!closed && <Button variant="gold" size="sm" onClick={onEdit}>Set Budget</Button>}
            <Button variant="outline" size="sm" onClick={onBreakdown}>Review Breakdown</Button>
          </div>
        </div>
      )}
      {s.hasBudget && (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[s.status] ?? ""}`}>{BUDGET_STATUS_LABEL[s.status]}</span>
            {s.contingency > 0 && <span className="text-xs text-muted-foreground">+ {money(s.contingency)} contingency</span>}
          </div>
          <div className="mt-2">
            <Row label="Total Budget" value={money(s.budget)} />
            <Row label="Actual Expenses" value={money(s.spent)} />
            {s.overAmount > 0
              ? <Row label="Over Budget by" value={money(s.overAmount)} />
              : <Row label="Remaining Budget" value={money(s.remaining)} />}
            <Row label="Reimbursable Balance" value={money(s.reimbursablePending)} />
            {s.committed > 0 && <Row label="Available After Commitments" value={money(s.availableAfterCommitments)} />}
          </div>
          {s.notes && <p className="mt-1 text-xs text-muted-foreground">{s.notes}</p>}
        </>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {!closed && <Button variant="outline" size="sm" onClick={onEdit}><Pencil className="mr-1 h-3.5 w-3.5" />Edit Budget</Button>}
        <Button variant="outline" size="sm" onClick={onBreakdown}><SlidersHorizontal className="mr-1 h-3.5 w-3.5" />Breakdown</Button>
        <Button asChild variant="gold" size="sm"><Link to="/new" search={{ trip: trip.id }}><Plus className="mr-1 h-3.5 w-3.5" />Add Expense</Link></Button>
      </div>
    </Card>
  );
}

/** Small dedicated Edit Budget form: total, currency, contingency, notes — one Save Changes. */
export function EditBudgetDialog({ trip, open, onOpenChange }: { trip: TravelTrip; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { preferences: pr, savePreferences } = useStore();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [contingency, setContingency] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastKey, setLastKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount(trip.budget > 0 ? String(trip.budget) : "");
    setCurrency(trip.currencies?.[0] ?? "INR");
    setContingency(trip.contingency ? String(trip.contingency) : "");
    setNotes(trip.budgetNotes ?? "");
    setLastKey(null);
  }, [open, trip]);

  const save = async () => {
    let patch: ReturnType<typeof validateBudgetEdit>;
    try { patch = validateBudgetEdit({ amount: amount.trim() ? Number(amount) : 0, currency, contingency: contingency.trim() ? Number(contingency) : 0, notes }); validateCompleteAllocations({ ...trip, ...patch }); }
    catch (e) { toast.error((e as Error).message); return; }
    // Repeat taps with the same values write the same patch — no duplicate records.
    const key = JSON.stringify([patch.budget, patch.currencies[0], patch.contingency, patch.budgetNotes]);
    if (saving || key === lastKey) return;
    setSaving(true);
    try {
      await savePreferences({ ...pr, trips: (pr.trips as TravelTrip[]).map((t) => (t.id === trip.id ? { ...t, ...patch } : t)) });
      setLastKey(key);
      toast.success("Saved successfully");
      onOpenChange(false);
    } catch (e) {
      toast.error(`Unable to save — Retry. ${(e as Error).message}`);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-label="Edit trip budget">
        <DialogHeader><DialogTitle>Edit Budget</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="tb-amount">Total budget</Label><Input id="tb-amount" type="number" min="0" className="h-11" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10000" /></div>
            <div><Label htmlFor="tb-currency">Currency</Label><select id="tb-currency" className={`${sel} w-full`} value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          </div>
          <div><Label htmlFor="tb-contingency">Contingency (optional)</Label><Input id="tb-contingency" type="number" min="0" className="h-11" value={contingency} onChange={(e) => setContingency(e.target.value)} placeholder="Extra room for surprises" /></div>
          <div><Label htmlFor="tb-notes">Notes (optional)</Label><Input id="tb-notes" className="h-11" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What this budget covers" /></div>
          <Button variant="gold" className="w-full" loading={saving} onClick={save}>{saving ? "Saving…" : "Save Changes"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type TabKey = AllocationDimension["key"];
const TABS: { key: TabKey; label: string }[] = [
  { key: "workspace", label: "Workspace" },
  { key: "traveller", label: "Traveller" },
  { key: "category", label: "Category" },
  { key: "currency", label: "Currency" },
  { key: "organisation", label: "Organisation" },
];

const STATE_NOTE: Record<string, string> = {
  partial: "Partial allocation — it does not cover the full trip budget.",
  complete: "Fully allocated — matches the trip budget.",
  exceeds: "Exceeds the trip budget — review the amounts; nothing was changed automatically.",
};

/** Optional detailed allocations. Each dimension reconciles independently with the primary budget. */
export function BudgetBreakdown({ trip: savedTrip }: { trip: TravelTrip }) {
  const { preferences: pr, savePreferences, transactions, members } = useStore();
  const [pending, setPending] = useState<Partial<TravelTrip>>({});
  const trip = { ...savedTrip, ...pending };
  const dirty = Object.keys(pending).length > 0;
  const closed = !!trip.closedAt;
  const [tab, setTab] = useState<TabKey>("workspace");
  const plans = useMemo(() => tripAllocationPlans(trip, transactions), [trip, transactions]);
  const bd = useMemo(() => tripBudgetDetail(trip, transactions), [trip, transactions]);
  const dims = useMemo(() => allocationReconciliation(trip), [trip]);
  const organisations = useMemo(() => tagsInGroup(pr.tags, "Organisation"), [pr.tags]);
  const [form, setForm] = useState({ key: "", amount: "", rate: "1" });
  const [saving, setSaving] = useState(false);

  const put = async (patch: Partial<TravelTrip>, _msg: string) => {
    if (closed || saving) return;
    setPending(current => ({ ...current, ...patch }));
    setForm({ key: "", amount: "", rate: "1" });
  };
  const commit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const latest = pr.trips.find(t => t.id === savedTrip.id);
      if (!latest || JSON.stringify(latest) !== JSON.stringify(savedTrip)) throw Error("Trip changed. Cancel and review the updated budget.");
      validateCompleteAllocations(trip);
      await savePreferences({ ...pr, trips: (pr.trips as TravelTrip[]).map((t) => (t.id === trip.id ? { ...t, ...pending } : t)) });
      toast.success("Budget breakdown saved");
      setPending({});
    } catch (e) { toast.error(`Unable to save — Retry. ${(e as Error).message}`); }
    finally { setSaving(false); }
  };

  const dim = dims.find((d) => d.key === tab);
  const add = () => {
    const n = Number(form.amount);
    try { validateAllocation(n, tab === "currency" ? Number(form.rate) : 1); } catch (e) { toast.error((e as Error).message); return; }
    if (!form.key) { toast.error("Choose what to allocate"); return; }
    if (tab === "workspace") {
      if (!["personal", "family", "business", "official"].includes(form.key)) return;
      void put({ workspaceBudgets: [...(trip.workspaceBudgets ?? []).filter((x) => x.workspace !== form.key), { workspace: form.key as Scope, amount: n }] }, "Workspace allocation saved");
    } else if (tab === "traveller") {
      void put({ travellerBudgets: [...(trip.travellerBudgets ?? []).filter((x) => x.traveller !== form.key), { traveller: form.key, amount: n }] }, "Traveller allocation saved");
    } else if (tab === "category") {
      if ((trip.budgetLines ?? []).some((x) => x.category === form.key)) { toast.error("That category already has a budget"); return; }
      void put({ budgetLines: [...(trip.budgetLines ?? []), { category: form.key, amount: n }] }, "Category budget saved");
    } else if (tab === "currency") {
      void put({ currencyBudgets: [...(trip.currencyBudgets ?? []).filter((x) => x.currency !== form.key), { currency: form.key, amount: n, planningRate: Number(form.rate) }] }, "Currency budget saved");
    } else {
      void put({ organisationBudgets: [...(trip.organisationBudgets ?? []).filter((x) => x.organisation !== form.key), { organisation: form.key, amount: n }] }, "Organisation allocation saved");
    }
  };

  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? id;
  const travellerOptions = [...new Set(["Me", ...(trip.travellers ?? []), ...members.map((m) => m.id)])];

  return (
    <Card title="Budget Breakdown">
      <p className="mb-2 text-xs text-muted-foreground">Each view is a different cut of the same {money(trip.budget > 0 ? trip.budget : 0)} trip budget — they are never added together.</p>
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Budget breakdown dimensions">
        {TABS.map((t) => <Button key={t.key} size="sm" variant={tab === t.key ? "default" : "outline"} role="tab" aria-selected={tab === t.key} onClick={() => { setTab(t.key); setForm({ key: "", amount: "", rate: "1" }); }} className="shrink-0">{t.label}</Button>)}
      </div>
      {!closed && <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" aria-label="Complete allocation" checked={trip.completeBudgetDimensions?.includes(tab) ?? false} disabled={saving} onChange={e => void put({ completeBudgetDimensions: e.target.checked ? [...(trip.completeBudgetDimensions ?? []).filter(k => k !== tab), tab] : (trip.completeBudgetDimensions ?? []).filter(k => k !== tab) }, "Allocation control saved")} />Must match the full budget</label>}
      {dim && dim.state !== "none" && <p className={`mb-2 text-xs ${dim.state === "exceeds" ? "text-destructive" : "text-muted-foreground"}`}>{dim.label}: {money(dim.total)} allocated. {STATE_NOTE[dim.state]}</p>}

      {tab === "workspace" && (
        <>
          {plans.workspace.length === 0 && <p className="text-sm text-muted-foreground">No workspace allocations yet.</p>}
          {plans.workspace.map((x) => (
            <div key={x.label} className="flex items-center gap-2 border-b py-1.5 text-sm last:border-0">
              <span className="min-w-0 flex-1 truncate">{x.label}</span>
              <span className="font-mono text-xs text-muted-foreground">{money(x.budget)} plan</span>
              <span className={`font-mono text-xs ${x.left < 0 ? "text-destructive" : "text-muted-foreground"}`}>{x.left < 0 ? `${money(-x.left)} over` : `${money(x.left)} left`}</span>
              {!closed && <Button size="sm" variant="ghost" aria-label={`Remove ${x.label} allocation`} onClick={() => void put({ workspaceBudgets: (trip.workspaceBudgets ?? []).filter((b) => SCOPE_LABEL[b.workspace] !== x.label) }, "Allocation removed")}>×</Button>}
            </div>
          ))}
        </>
      )}
      {tab === "traveller" && (
        <>
          {plans.traveller.length === 0 && <p className="text-sm text-muted-foreground">No traveller allocations yet.</p>}
          {plans.traveller.map((x) => (
            <div key={x.label} className="flex items-center gap-2 border-b py-1.5 text-sm last:border-0">
              <span className="min-w-0 flex-1 truncate">{memberName(x.label)}</span>
              <span className="font-mono text-xs text-muted-foreground">{money(x.budget)} plan</span>
              <span className={`font-mono text-xs ${x.left < 0 ? "text-destructive" : "text-muted-foreground"}`}>{x.left < 0 ? `${money(-x.left)} over` : `${money(x.left)} left`}</span>
              {!closed && <Button size="sm" variant="ghost" aria-label={`Remove ${memberName(x.label)} allocation`} onClick={() => void put({ travellerBudgets: (trip.travellerBudgets ?? []).filter((b) => b.traveller !== x.label) }, "Allocation removed")}>×</Button>}
            </div>
          ))}
        </>
      )}
      {tab === "category" && (
        <>
          {bd.lines.length === 0 && <p className="text-sm text-muted-foreground">No category budgets yet — add one to see the plan line by line.</p>}
          {bd.lines.map((l) => (
            <div key={l.category} className="flex items-center gap-2 border-b py-1.5 text-sm last:border-0">
              <span className="min-w-0 flex-1 truncate">{l.category}</span>
              <span className="font-mono text-xs text-muted-foreground">{money(l.budget)} plan</span>
              <span className={`font-mono text-xs ${l.over ? "text-destructive" : "text-muted-foreground"}`}>{l.over ? `${money(-l.left)} over` : `${money(l.left)} left`}</span>
              {!closed && <Button size="sm" variant="ghost" aria-label={`Remove ${l.category} budget`} onClick={() => void put({ budgetLines: (trip.budgetLines ?? []).filter((x) => x.category !== l.category) }, "Category budget removed")}>×</Button>}
            </div>
          ))}
          {bd.unbudgeted > 0 && <Row label="Spent outside the budget lines" value={money(bd.unbudgeted)} />}
        </>
      )}
      {tab === "currency" && (
        <>
          {plans.currencies.length === 0 && <p className="text-sm text-muted-foreground">No currency budgets yet.</p>}
          {plans.currencies.map((x) => (
            <div key={x.currency} className="flex items-center gap-2 border-b py-1.5 text-sm last:border-0">
              <span className="min-w-0 flex-1 truncate">{x.currency} {x.amount.toLocaleString()} × {x.planningRate} planning rate</span>
              <span className="font-mono text-xs text-muted-foreground">{money(x.inr)}</span>
              {!closed && <Button size="sm" variant="ghost" aria-label={`Remove ${x.currency} budget`} onClick={() => void put({ currencyBudgets: (trip.currencyBudgets ?? []).filter((b) => b.currency !== x.currency) }, "Currency budget removed")}>×</Button>}
            </div>
          ))}
        </>
      )}
      {tab === "organisation" && (
        <>
          {(trip.organisationBudgets ?? []).length === 0 && <p className="text-sm text-muted-foreground">No organisation allocations yet. Organisations come from Settings.</p>}
          {(trip.organisationBudgets ?? []).map((x) => (
            <div key={x.organisation} className="flex items-center gap-2 border-b py-1.5 text-sm last:border-0">
              <span className="min-w-0 flex-1 truncate">{x.organisation}</span>
              <span className="font-mono text-xs text-muted-foreground">{money(x.amount)} plan</span>
              {!closed && <Button size="sm" variant="ghost" aria-label={`Remove ${x.organisation} allocation`} onClick={() => void put({ organisationBudgets: (trip.organisationBudgets ?? []).filter((b) => b.organisation !== x.organisation) }, "Allocation removed")}>×</Button>}
            </div>
          ))}
        </>
      )}

      {!closed && (
        <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-3">
          {tab === "workspace" && <select aria-label="Allocation workspace" className={sel} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })}><option value="">Workspace…</option>{Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
          {tab === "traveller" && <select aria-label="Allocation traveller" className={sel} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })}><option value="">Traveller…</option>{travellerOptions.map((t) => <option key={t} value={t}>{memberName(t)}</option>)}</select>}
          {tab === "category" && <select aria-label="Allocation category" className={sel} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })}><option value="">Category…</option>{pr.categories.filter((c) => !c.archived).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</select>}
          {tab === "currency" && <select aria-label="Allocation currency" className={sel} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value, rate: e.target.value === "INR" ? "1" : form.rate })}><option value="">Currency…</option>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>}
          {tab === "organisation" && <select aria-label="Allocation organisation" className={sel} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })}><option value="">Organisation…</option>{organisations.map((o) => <option key={o} value={o}>{o}</option>)}</select>}
          <Input aria-label="Allocation amount" type="number" min="0" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          {tab === "currency" && <Input aria-label="Planning exchange rate" type="number" min="0" placeholder="Rate to INR" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />}
          <Button variant="outline" disabled={saving} onClick={add} className={tab === "currency" ? "" : "sm:col-span-1"}>Add allocation</Button>
        </div>
      )}
      {!closed && dirty && <div className="mt-3 flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setPending({})}>Cancel changes</Button><Button variant="gold" loading={saving} onClick={commit}>Save breakdown</Button></div>}
    </Card>
  );
}

/** §5.4 reimbursement summary: who paid, what came back, what is still pending. */
export function ReimbursementBreakdownCard({ trip }: { trip: TravelTrip }) {
  const { transactions } = useStore();
  const rb = useMemo(() => reimbursementBreakdown(trip, transactions), [trip, transactions]);
  const empty = rb.personalCash + rb.personalCard + rb.organisationPaid + rb.advances + rb.received + rb.pending === 0;
  if (empty) return null;
  return (
    <Card title="Reimbursement summary">
      {rb.personalCash > 0 && <Row label="Eligible, paid personally" value={money(rb.personalCash)} />}
      {rb.personalCard > 0 && <Row label="Eligible, paid by personal card" value={money(rb.personalCard)} />}
      {rb.organisationPaid > 0 && <Row label="Paid by organisation card" value={money(rb.organisationPaid)} />}
      {rb.advances > 0 && <Row label="Travel advances received" value={money(rb.advances)} />}
      {rb.received > 0 && <Row label="Reimbursements received" value={money(rb.received)} />}
      <Row label="Still pending reimbursement" value={money(rb.pending)} />
      <p className="mt-1 text-xs text-muted-foreground">Receipts settle the original spend and are never counted as income. Organisation-card spending usually isn't a personal receivable.</p>
    </Card>
  );
}

/** Compact budget summary for Trip Overview — taps through to Budget & Settlements. */
export function TripBudgetMini({ trip, onOpen }: { trip: TravelTrip; onOpen: () => void }) {
  const { preferences: pr, transactions } = useStore();
  const s = useMemo(() => tripBudgetSummary(trip, transactions, pr.tripBudgetWarnPct), [trip, transactions, pr.tripBudgetWarnPct]);
  return (
    <button type="button" onClick={onOpen} className="mt-3 block w-full rounded-xl border bg-card p-3 text-left">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">Trip budget</span>
        {s.hasBudget && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[s.status] ?? ""}`}>{BUDGET_STATUS_LABEL[s.status]}</span>}
      </div>
      {s.hasBudget ? (
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="font-display text-lg font-bold">{money(s.spent)} <span className="text-xs font-normal text-muted-foreground">of {money(s.budget)}</span></span>
          <span className={`text-xs ${s.overAmount > 0 ? "text-destructive" : "text-muted-foreground"}`}>{s.overAmount > 0 ? `${money(s.overAmount)} over` : `${money(s.remaining)} left`}</span>
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">{budgetNeedsConfirmation(trip) ? "Budget requires confirmation — tap to review." : "Budget not set — tap to add one."}</p>
      )}
    </button>
  );
}
