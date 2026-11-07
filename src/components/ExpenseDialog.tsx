import { receiptRoundOffFor } from "@/lib/receipt-reading";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScopeToggle } from "./ScopeBadge";
import { AllocationEditor, ReimbursementEditor } from "./SplitAndClaim";
import { whoLabel, BASE_CURRENCY, PAYMENT_LABEL, REIMBURSEMENT_LABEL, money, type Expense } from "@/lib/expenses";
import { hasReceiptAudit, receiptCorrectionLines } from "@/lib/receipt-audit";
import type { AuditEntry } from "@/lib/store";
import { useStore } from "@/lib/store";

function ReceiptThumb({ path, name, type }: { path: string; name: string; type: string }) {
  const { signedUrl } = useStore();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { void signedUrl(path).then(setUrl); }, [path, signedUrl]);
  if (!url) return <div className="h-32 w-24 animate-pulse rounded-xl border bg-muted" />;
  return type.startsWith("image/") ? (
    <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={name} className="h-32 w-24 rounded-xl border object-cover" /></a>
  ) : (
    <a href={url} target="_blank" rel="noreferrer" className="flex h-32 w-24 items-center justify-center rounded-xl border p-2 text-center text-xs underline">{name}</a>
  );
}

export function ExpenseDialog({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  if (!expense) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto rounded-3xl">
        <DialogHeader><DialogTitle className="font-display text-2xl font-bold">{expense.title}</DialogTitle></DialogHeader>
        <ExpenseDetail expense={expense} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

/** Expense detail body, shared by the modal dialog and the iPad-landscape side pane. */
export function ExpenseDetail({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const { memberName, setScope, remove, accounts, setReimbursement, recordReimbursement, convertToEmi, history } = useStore();
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{setAudit([]);void history(expense.id).then(setAudit).catch(()=>{});},[expense?.id,history]);
  const nav = useNavigate();
  const [scope, setLocalScope] = useState(expense.scope);
  useEffect(() => { setLocalScope(expense.scope); }, [expense]);
  const e = expense;

  const changeScope = async (s: typeof scope) => {
    setLocalScope(s);
    try { await setScope(e.id, s); toast.success(`Moved to ${s}`); } catch (err) { toast.error((err as Error).message); }
  };
  const del = async () => {
    if (!confirm("Delete this expense and its receipts?")) return;
    try { await remove(e); toast.success("Expense deleted"); onClose(); } catch (err) { toast.error((err as Error).message); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto rounded-3xl">
        <DialogHeader><DialogTitle className="font-display text-2xl font-bold">{e.title}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{e.date}</span>·<span>{e.category}</span>·<span>{PAYMENT_LABEL[e.paymentMethod]}</span>·<span>For {whoLabel(e, memberName)}</span>
          {e.merchant && <>·<span>{e.merchant}</span></>}
        </div>
        <div>
          <div className="font-mono text-3xl">{money(e.originalAmount, e.currency)}</div>
          {e.currency !== BASE_CURRENCY && (
            <div className="text-sm text-muted-foreground">≈ <span className="font-mono">{money(e.amount)}</span> at 1 {e.currency} = {e.fxRate.toFixed(4)} {BASE_CURRENCY}</div>
          )}
        </div>
        {e.receiptDetails?.tax != null && <p className="text-sm">Tax included: <span className="font-mono">{money(e.receiptDetails.tax,e.currency)}</span></p>}
        {(e.receiptDetails?.charges ?? []).map((c, i) => <p key={`c${i}`} className="text-sm">{c.label}: <span className="font-mono">{c.amount < 0 ? "−" : ""}{money(Math.abs(c.amount), e.currency)}</span></p>)}
        {(e.receiptDetails?.taxParts?.length ?? 0) > 0 && <p className="text-xs text-muted-foreground">{e.receiptDetails!.taxParts!.map((t) => `${t.label}${t.rate != null ? ` ${t.rate}%` : ""} ${t.amount.toFixed(2)}`).join(" · ")}</p>}
        {e.receiptDetails?.tip != null && <p className="text-sm">Tip included: <span className="font-mono">{money(e.receiptDetails.tip,e.currency)}</span></p>}
        {(() => { const r = receiptRoundOffFor(e); if (!r.amount) return null; const d = e.receiptDetails;
          return <><p className="text-sm">Round-off: <span className="font-mono">{r.amount > 0 ? "+" : "−"}{money(Math.abs(r.amount),e.currency)}</span> <span className="text-muted-foreground">({r.source === "implied" ? "bill rounded to nearest rupee" : "round-off on bill"})</span></p>
          {d?.subtotal != null && <p className="text-xs text-muted-foreground font-mono">Subtotal {d.subtotal.toFixed(2)}{(d.charges ?? []).map((c) => ` ${c.amount < 0 ? "−" : "+"} ${c.label} ${Math.abs(c.amount).toFixed(2)}`).join("")}{d.tax ? ` + Tax ${d.tax.toFixed(2)}` : ""}{d.tip ? ` + Tip ${d.tip.toFixed(2)}` : ""} {r.amount > 0 ? "+" : "−"} Round-off {Math.abs(r.amount).toFixed(2)} = {e.originalAmount.toFixed(2)}</p>}</>; })()}
        {!!e.receiptDetails?.items?.length && <ul className="divide-y">{e.receiptDetails.items.map((item,i)=><li key={i} className="flex justify-between gap-3 py-2 text-sm"><span>{item.name} × {item.quantity}</span><span className="font-mono">{money(item.amount,e.currency)}</span></li>)}</ul>}
        <ScopeToggle value={scope} onChange={changeScope} />
        {e.description && <p className="text-sm">{e.description}</p>}
        {e.reconciledAt && <p className="text-sm text-success">Matched to bank statement: {e.statementRef}</p>}
        {(e.txnType??"expense")==="expense"&&<div className="flex flex-wrap gap-2 border-t pt-3"><span className="w-full text-sm">{REIMBURSEMENT_LABEL[e.reimbursementStatus??"none"]}</span><Button size="sm" variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{await setReimbursement(e.id,e.reimbursementStatus==="pending"?"none":"pending");toast.success("Reimbursement status updated");onClose();}catch(err){toast.error((err as Error).message);}finally{setBusy(false);}}}>{e.reimbursementStatus==="pending"?"Remove claim":"Mark reimbursable"}</Button>{e.reimbursementStatus==="pending"&&<Button size="sm" disabled={busy} onClick={async()=>{const candidates=accounts.filter(a=>!a.archived&&["savings","current","cash","wallet"].includes(a.kind));const selected=window.prompt(`Received into which account? Enter its name: ${candidates.map(a=>a.name).join(", ")}`);if(!selected)return;const account=candidates.find(a=>a.name.toLowerCase()===selected.toLowerCase());if(!account){toast.error("Choose one of your cash or bank accounts");return;}setBusy(true);try{await recordReimbursement([e.id],account.id,new Date().toLocaleDateString("en-CA"));toast.success("Reimbursement received");onClose();}catch(err){toast.error((err as Error).message);}finally{setBusy(false);}}}>Record reimbursement</Button>}{accounts.find(a=>a.id===e.accountId)?.kind==="credit_card"&&<Button size="sm" variant="outline" disabled={busy} onClick={async()=>{const months=window.prompt("EMI term in months (2–60)","6");if(!months)return;const rate=window.prompt("Annual EMI interest %","12");if(rate===null)return;const fee=window.prompt("Processing fee (₹)","0");if(fee===null)return;setBusy(true);try{await convertToEmi(e,{months:Number(months),rate:Number(rate),fee:Number(fee)});toast.success("Purchase converted to EMI");onClose();}catch(err){toast.error((err as Error).message);}finally{setBusy(false);}}}>Convert to EMI</Button>}</div>}
        {(e.txnType??"expense")==="expense"&&<details className="border-t pt-3" open={!!e.allocations?.length}><summary className="cursor-pointer text-sm font-semibold">{e.allocations?.length?`Split across ${e.allocations.length} categories`:"Split by category"}</summary><div className="mt-2"><AllocationEditor e={e} onDone={onClose}/></div></details>}
        {(e.txnType??"expense")==="expense"&&<details className="border-t pt-3"><summary className="cursor-pointer text-sm font-semibold">Reimbursement claim details</summary><div className="mt-2"><ReimbursementEditor e={e} onDone={onClose}/></div></details>}
        {e.receipts.length > 0 && (
          <div className="flex flex-wrap gap-3">{e.receipts.map((r) => <ReceiptThumb key={r.path} {...r} />)}</div>
        )}
        {hasReceiptAudit(e.receiptDetails) && (
          <details className="border-t pt-3" open={receiptCorrectionLines(e.receiptDetails.audit).length > 0}>
            <summary className="cursor-pointer text-sm font-semibold">Receipt reading audit</summary>
            <div className="mt-2 space-y-1 text-xs">
              <p className="text-muted-foreground">Read from the receipt on {new Date(e.receiptDetails.audit.confirmedAt).toLocaleString()}:</p>
              <p className="break-words">{e.receiptDetails.audit.read.merchant || "(no merchant)"} · {e.receiptDetails.audit.read.date} · {e.receiptDetails.audit.read.currency} {e.receiptDetails.audit.read.amount.toFixed(2)}</p>
              {receiptCorrectionLines(e.receiptDetails.audit).length > 0 ? (
                <><p className="pt-1 text-muted-foreground">Corrected before submitting:</p>
                <ul className="list-disc pl-4">{receiptCorrectionLines(e.receiptDetails.audit).map((l) => <li key={l} className="break-words">{l}</li>)}</ul></>
              ) : (
                <p className="pt-1 text-muted-foreground">Saved exactly as read — no corrections.</p>
              )}
            </div>
          </details>
        )}
        <div className="flex justify-between gap-2 pt-2">
          <Button variant="ghost" className="text-destructive" onClick={del}>Delete</Button>
          <Button variant="outline" onClick={() => { onClose(); nav({ to: "/new", search: { edit: e.id } }); }}>Edit</Button>
        </div>
        <details className="border-t pt-3"><summary className="cursor-pointer text-sm">Change history</summary><ul className="mt-2 divide-y text-xs">{audit.map(a=><li key={a.id} className="py-2"><b className="capitalize">{a.action}</b> · {new Date(a.createdAt).toLocaleString()}<div>{a.summary}</div>{Object.entries(a.changes).map(([key,value])=><p key={key} className="break-words text-muted-foreground">{key.replaceAll("_"," ")}: {JSON.stringify(value)}</p>)}</li>)}</ul></details>
      </DialogContent>
    </Dialog>
  );
}
