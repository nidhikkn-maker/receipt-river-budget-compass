import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { allocateByPercent, money, validateAllocations, type Allocation, type Expense } from "@/lib/expenses";
import { REIMB_STAGES, REIMB_STAGE_LABEL, outstandingOf, receivedOf, reimbursableOf, stageOf, type ReimbStage } from "@/lib/reimbursements";
import { useStore } from "@/lib/store";
import { ValueDialog } from "@/components/ValueDialog";
import { requiredText } from "@/lib/value-edits";

const today = () => new Date().toLocaleDateString("en-CA");

/** Category split editor: one bank/card movement, several category lines that must add up exactly. */
export function AllocationEditor({ e, onDone }: { e: Expense; onDone?: () => void }) {
  const { preferences, savePreferences, setAllocations, members } = useStore();
  const cats = preferences.categories.filter((c) => !c.archived).map((c) => c.name);
  const start: Allocation[] = e.allocations?.length ? e.allocations : [{ category: e.category, amount: e.amount }, { category: cats.find((c) => c !== e.category) ?? e.category, amount: 0 }];
  const [lines, setLines] = useState<Allocation[]>(start);
  const [mode, setMode] = useState<"amount" | "pct">("amount");
  const [pcts, setPcts] = useState<number[]>(start.map((l) => Math.round((l.amount / e.amount) * 10000) / 100));
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState(false);
  const current = mode === "amount" ? lines : (() => { try { return allocateByPercent(e.amount, lines.map((l, i) => ({ category: l.category, pct: pcts[i] ?? 0 }))).map((a, i) => ({ ...lines[i]!, amount: a.amount })); } catch { return lines.map((l) => ({ ...l, amount: 0 })); } })();
  const sum = Math.round(current.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const left = Math.round((e.amount - sum) * 100) / 100;
  const set = (i: number, p: Partial<Allocation>) => setLines(lines.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const save = async (next: Allocation[]) => {
    setBusy(true);
    try { if (next.length) validateAllocations(next, e.amount); await setAllocations(e, next); toast.success(next.length ? "Split saved" : "Split removed"); onDone?.(); }
    catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-2xl border p-3">
      <div className="flex items-center justify-between gap-2"><b className="text-sm font-bold">Split by category</b>
        <div className="flex gap-1 text-xs">{(["amount", "pct"] as const).map((m) => <Button key={m} type="button" size="sm" variant={mode === m ? "gold" : "outline"} onClick={() => setMode(m)}>{m === "amount" ? "₹" : "%"}</Button>)}</div></div>
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_6rem_auto] items-center gap-2">
          <select aria-label="Split category" className="h-9 rounded-md border bg-background px-2 text-sm" value={l.category} onChange={(ev) => set(i, { category: ev.target.value })}>{[...new Set([l.category, ...cats])].map((c) => <option key={c}>{c}</option>)}</select>
          {mode === "amount"
            ? <Input aria-label="Split amount" type="number" inputMode="decimal" value={l.amount || ""} onChange={(ev) => set(i, { amount: Number(ev.target.value) || 0 })} />
            : <Input aria-label="Split percent" type="number" inputMode="decimal" value={pcts[i] ?? ""} onChange={(ev) => setPcts(pcts.map((p, k) => (k === i ? Number(ev.target.value) || 0 : p)))} />}
          <Button type="button" size="sm" variant="ghost" aria-label="Remove line" disabled={lines.length <= 2} onClick={() => { setLines(lines.filter((_, k) => k !== i)); setPcts(pcts.filter((_, k) => k !== i)); }}>✕</Button>
          {members.length > 0 && <select aria-label="Split person" className="col-span-3 h-8 rounded-md border bg-background px-2 text-xs" value={l.memberId ?? ""} onChange={(ev) => set(i, { memberId: ev.target.value || null })}><option value="">For me</option>{members.map((m) => <option key={m.id} value={m.id}>For {m.name}</option>)}</select>}
        </div>))}
      <div className={`text-sm font-medium ${left === 0 ? "text-success" : "text-destructive"}`}>{left === 0 ? `Adds up to ${money(e.amount)}` : `${money(Math.abs(left))} ${left > 0 ? "still to allocate" : "over the amount"}`}</div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => { setLines([...lines, { category: cats[0] ?? e.category, amount: Math.max(0, left) }]); setPcts([...pcts, 0]); }}>Add line</Button>
        <Button type="button" size="sm" variant="gold" disabled={busy || left !== 0} onClick={() => save(current)}>Save split</Button>
        {!!e.allocations?.length && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => save([])}>Remove split</Button>}
        <Button type="button" size="sm" variant="ghost" disabled={left !== 0} onClick={() => setNaming(true)}>Save as template</Button>
        <ValueDialog
          open={naming}
          title="Save split as a template"
          description="Saves these categories and their percentages so you can apply the same split to another entry. This entry is not changed."
          label="Template name"
          hint={preferences.splitTemplates.length ? "A template with the same name is replaced." : ""}
          confirmLabel="Save template"
          validate={requiredText("Name the template")}
          onSubmit={async (name) => { await savePreferences({ ...preferences, splitTemplates: [...preferences.splitTemplates.filter((t) => t.name !== name), { name, lines: current.map((l) => ({ category: l.category, pct: Math.round((l.amount / e.amount) * 10000) / 100 })) }] }); toast.success("Template saved"); }}
          onClose={() => setNaming(false)}
        />
      </div>
      {preferences.splitTemplates.length > 0 && <div className="flex flex-wrap gap-1 text-xs"><span className="self-center text-muted-foreground">Templates:</span>{preferences.splitTemplates.map((t) => <Button key={t.name} type="button" size="sm" variant="outline" onClick={() => { try { const fixed = t.lines.map((l, i) => i === t.lines.length - 1 ? { ...l, pct: Math.round((100 - t.lines.slice(0, -1).reduce((s, x) => s + x.pct, 0)) * 100) / 100 } : l); setLines(allocateByPercent(e.amount, fixed)); setPcts(fixed.map((l) => l.pct)); setMode("amount"); } catch (err) { toast.error((err as Error).message); } }}>{t.name}</Button>)}</div>}
    </div>
  );
}

/** Reimbursement claim tracker: stage, payer, dates and partial receipts linked to this expense. */
export function ReimbursementEditor({ e, onDone }: { e: Expense; onDone?: () => void }) {
  const { updateReimbursement, addReimbursementReceipt, accounts } = useStore();
  const r = e.reimbursement ?? {};
  const [f, setF] = useState({ stage: (r.stage ?? "not_submitted") as ReimbStage, reimbursable: String(r.reimbursable ?? e.amount), payer: r.payer ?? "", purpose: r.purpose ?? "", submittedOn: r.submittedOn ?? "", expectedOn: r.expectedOn ?? "", remarks: r.remarks ?? "" });
  const banks = accounts.filter((a) => !a.archived && ["savings", "current", "cash", "wallet"].includes(a.kind));
  const [rc, setRc] = useState({ amount: "", date: today(), accountId: banks[0]?.id ?? "" });
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>, msg: string) => { setBusy(true); try { await fn(); toast.success(msg); onDone?.(); } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); } };
  const receiptRequest = useRef<{ key: string; id: string } | null>(null);
  const receive = async () => {
    const key = JSON.stringify(rc);
    if (receiptRequest.current?.key !== key) receiptRequest.current = { key, id: crypto.randomUUID() };
    const request = receiptRequest.current;
    if (!request) return;
    await addReimbursementReceipt(e, { amount: Number(rc.amount), date: rc.date, accountId: rc.accountId || null, operationId: request.id });
  };
  const tracked = (e.reimbursementStatus ?? "none") !== "none" || !!r.stage;
  const field = "h-9 rounded-md border bg-background px-2 text-sm";
  return (
    <div className="space-y-2 rounded-2xl border p-3">
      <div className="flex items-center justify-between"><b className="text-sm font-bold">Reimbursement claim</b>{tracked && <span className="text-xs font-semibold text-gold-strong">{REIMB_STAGE_LABEL[stageOf(e)]}</span>}</div>
      {tracked && <div className="grid grid-cols-3 gap-2 text-center text-xs"><div><div className="font-mono text-sm font-bold">{money(reimbursableOf(e))}</div>Claimable</div><div><div className="font-mono text-sm font-bold">{money(receivedOf(e))}</div>Received</div><div><div className="font-mono text-sm font-bold">{money(outstandingOf(e))}</div>Outstanding</div></div>}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">Status<select className={`${field} w-full`} value={f.stage} onChange={(ev) => setF({ ...f, stage: ev.target.value as ReimbStage })}>{REIMB_STAGES.filter((s) => s !== "partial" && s !== "received").map((s) => <option key={s} value={s}>{REIMB_STAGE_LABEL[s]}</option>)}</select></label>
        <label className="text-xs">Claimable ₹<Input type="number" inputMode="decimal" value={f.reimbursable} onChange={(ev) => setF({ ...f, reimbursable: ev.target.value })} /></label>
        <label className="text-xs">Organisation / person<Input value={f.payer} maxLength={80} onChange={(ev) => setF({ ...f, payer: ev.target.value })} /></label>
        <label className="text-xs">Purpose<Input value={f.purpose} maxLength={120} onChange={(ev) => setF({ ...f, purpose: ev.target.value })} /></label>
        <label className="text-xs">Submitted on<Input type="date" value={f.submittedOn} onChange={(ev) => setF({ ...f, submittedOn: ev.target.value })} /></label>
        <label className="text-xs">Expected by<Input type="date" value={f.expectedOn} onChange={(ev) => setF({ ...f, expectedOn: ev.target.value })} /></label>
        <label className="col-span-2 text-xs">Remarks<Input value={f.remarks} maxLength={300} onChange={(ev) => setF({ ...f, remarks: ev.target.value })} /></label>
      </div>
      <Button size="sm" variant="gold" disabled={busy} onClick={() => run(() => updateReimbursement(e, { ...r, stage: f.stage, reimbursable: Number(f.reimbursable), payer: f.payer.trim(), purpose: f.purpose.trim(), submittedOn: f.submittedOn || null, expectedOn: f.expectedOn || null, remarks: f.remarks.trim(), receipts: r.receipts ?? [] }), "Claim saved")}>{tracked ? "Update claim" : "Track as reimbursable"}</Button>
      {tracked && outstandingOf(e) > 0 && <div className="space-y-2 border-t pt-2">
        <b className="text-xs font-bold">Record money received</b>
        <div className="grid grid-cols-3 gap-2">
          <Input aria-label="Amount received" type="number" inputMode="decimal" placeholder="₹" value={rc.amount} onChange={(ev) => setRc({ ...rc, amount: ev.target.value })} />
          <Input aria-label="Received on" type="date" value={rc.date} onChange={(ev) => setRc({ ...rc, date: ev.target.value })} />
          <select aria-label="Received into" className={field} value={rc.accountId} onChange={(ev) => setRc({ ...rc, accountId: ev.target.value })}><option value="">No account</option>{banks.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </div>
        <Button size="sm" variant="outline" disabled={busy || !rc.amount || !rc.accountId} onClick={() => run(receive, "Receipt recorded")}>Record receipt</Button>
      </div>}
      {!!r.receipts?.length && <ul className="divide-y text-xs">{r.receipts.map((x) => <li key={x.id} className="flex justify-between py-1"><span>{x.date}</span><span className="font-mono">{money(x.amount)}</span></li>)}</ul>}
    </div>
  );
}
