import { LoadError } from "./LoadError";
import { withdrawReasonProblem } from "@/lib/withdrawal";
import { receiptRoundOffFor } from "@/lib/receipt-reading";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { correctionToday, removalMode, ReversalReasonRequired, usePostingStatus, validReason } from "@/lib/posting";
import { ConfirmDialog } from "./ConfirmDialog";
import { emiProblems } from "@/lib/value-edits";
import { Input } from "@/components/ui/input";
import { isReversalHistory } from "@/lib/ledger";
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
        <DialogHeader><DialogTitle className="sr-only">{expense.title}</DialogTitle></DialogHeader>
        <ExpenseDetail expense={expense} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

/** Expense detail body, shared by the modal dialog and the iPad-landscape side pane. */
export function ExpenseDetail({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const { memberName, setScope, remove, restoreWithdrawn, accounts, setReimbursement, recordReimbursement, convertToEmi, history, userId } = useStore();
  // Balanced posting (P7): where it is active a posted entry is reversed with a reason, never deleted.
  const posting = usePostingStatus(userId);
  const reverse = !!posting && removalMode(posting) === "reverse";
  const [reverseOpen, setReverseOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [correctionDate, setCorrectionDate] = useState(correctionToday);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [busy,setBusy]=useState(false);
  // In-app dialogs (never a browser pop-up): delete when posting is not active, reimbursement account, card EMI terms.
  const [ask,setAsk]=useState<null|"delete"|"restore"|"reimburse"|"emi">(null);
  const [reimburseTo,setReimburseTo]=useState("");
  const [emi,setEmi]=useState({months:"6",rate:"12",fee:"0"});
  const [auditFailed,setAuditFailed]=useState(false);
  const [auditTry,setAuditTry]=useState(0);
  const loadAudit=()=>setAuditTry(n=>n+1);
  useEffect(()=>{setAudit([]);setAuditFailed(false);void history(expense.id).then(setAudit).catch(()=>setAuditFailed(true));},[expense?.id,history,auditTry]);
  const nav = useNavigate();
  const [scope, setLocalScope] = useState(expense.scope);
  useEffect(() => { setLocalScope(expense.scope); }, [expense]);
  const e = expense;

  const changeScope = async (s: typeof scope) => {
    setLocalScope(s);
    try { await setScope(e.id, s); toast.success(`Moved to ${s}`); } catch (err) { toast.error((err as Error).message); }
  };
  const confirmReverse = async () => {
    try { await remove(e, { reason, requestId, correctionDate }); toast.success("Entry reversed on the correction date. The original, its reversal, the audit record and receipts are all kept."); setReverseOpen(false); onClose(); }
    catch (err) { toast.error((err as Error).message); }
  };
  const openReverse = () => { setReason(""); setCorrectionDate(correctionToday()); setRequestId(crypto.randomUUID()); setReverseOpen(true); };
  const del = () => {
    if (reverse) { openReverse(); return; }
    setAsk("delete");
  };
  // RB-LED-01: an unposted entry is withdrawn with the reason (never deleted). If the database says the entry is posted
  // after all, nothing was changed: the reversal dialog takes over, as the withdraw dialog says it will.
  const withdrawNow = async (why: string) => {
    try { await remove(e, { reason: why }); }
    catch (err) { if (err instanceof ReversalReasonRequired) { setAsk(null); openReverse(); return; } throw err; }
    toast.success("Entry withdrawn. It is kept in history with its receipts, left out of totals, and can be restored."); onClose();
  };
  const withdrawn = !!e.withdrawnAt;
  const noun = (e.txnType ?? "expense") === "expense" ? "expense" : "entry";
  const cashAccounts = accounts.filter(a=>!a.archived&&["savings","current","cash","wallet"].includes(a.kind));
  const emiCheck = emiProblems(emi);
  const today = new Date().toLocaleDateString("en-CA");

  return (
    <div className="space-y-4">
        <h2 className="font-display text-2xl font-bold">{e.title}</h2>
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
        {(e.txnType??"expense")==="expense"&&<div className="flex flex-wrap gap-2 border-t pt-3"><span className="w-full text-sm">{REIMBURSEMENT_LABEL[e.reimbursementStatus??"none"]}</span><Button size="sm" variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{await setReimbursement(e.id,e.reimbursementStatus==="pending"?"none":"pending");toast.success("Reimbursement status updated");onClose();}catch(err){toast.error((err as Error).message);}finally{setBusy(false);}}}>{e.reimbursementStatus==="pending"?"Remove claim":"Mark reimbursable"}</Button>{e.reimbursementStatus==="pending"&&<Button size="sm" disabled={busy} onClick={()=>{setReimburseTo(cashAccounts.length===1?cashAccounts[0]!.id:"");setAsk("reimburse");}}>Record reimbursement</Button>}{accounts.find(a=>a.id===e.accountId)?.kind==="credit_card"&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>{setEmi({months:"6",rate:"12",fee:"0"});setAsk("emi");}}>Convert to EMI</Button>}</div>}
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
        {withdrawn ? (
          <div role="note" className="space-y-2 rounded-xl border p-3 text-sm">
            <p className="font-medium">Withdrawn{e.withdrawal?.at ? ` on ${new Date(e.withdrawal.at).toLocaleString()}` : ""}{e.withdrawal?.by ? (e.withdrawal.by === userId ? " by you" : " by another member") : ""}</p>
            {e.withdrawal?.reason && <p className="break-words text-muted-foreground">Reason: {e.withdrawal.reason}</p>}
            <p className="text-muted-foreground">Kept in your history with its receipt files; left out of balances, reports and every total. Restore it to count it again.</p>
            <Button variant="outline" onClick={() => setAsk("restore")}>Restore entry</Button>
          </div>
        ) : isReversalHistory(e) ? (
          // KK decision 1: a reversed entry and its reversal are kept as linked history; neither is edited or removed.
          <p role="note" className="rounded-xl border p-2 text-sm text-muted-foreground">{e.reversesEntryId ? `This is the reversal of an earlier entry, recorded on ${e.date}. It cancels that entry; both are kept in your records.` : "This entry was reversed. It stays in your records with its linked reversal; record a new entry for any correction."}</p>
        ) : (
        <div className="flex justify-between gap-2 pt-2">
          {/* KK: Withdraw only for unposted, unreconciled entries; a statement-matched entry goes through correction (the server decides either way). */}
          {!reverse && (e.reconciledAt || e.statementRef)
            ? <p className="text-sm text-muted-foreground">Matched to a bank statement line — correct it with Edit instead of withdrawing it.</p>
            : <Button variant="ghost" className="text-destructive" onClick={del}>{reverse ? "Reverse entry" : "Withdraw entry"}</Button>}
          <Button variant="outline" onClick={() => { onClose(); nav({ to: "/new", search: { edit: e.id } }); }}>Edit</Button>
        </div>
        )}
        <details className="border-t pt-3"><summary className="cursor-pointer text-sm">Change history</summary>{auditFailed&&<LoadError className="mt-2" what="the change history" onRetry={loadAudit} />}<ul className="mt-2 divide-y text-xs">{audit.map(a=><li key={a.id} className="py-2"><b className="capitalize">{a.action}</b> · {new Date(a.createdAt).toLocaleString()}<div>{a.summary}</div>{Object.entries(a.changes).map(([key,value])=><p key={key} className="break-words text-muted-foreground">{key.replaceAll("_"," ")}: {JSON.stringify(value)}</p>)}</li>)}</ul></details>
        <ConfirmDialog
          open={ask==="delete"}
          destructive
          title={`Withdraw “${e.title}”?`}
          description={`This ${noun} is withdrawn, not deleted: it is kept in history with who, when and your reason, excluded from totals, and can be restored.`}
          consequences={[
            `${money(e.originalAmount, e.currency)} on ${e.date}${accounts.find(a=>a.id===e.accountId) ? ` · ${accounts.find(a=>a.id===e.accountId)!.name}` : ""} is left out of balances, reports and every total`,
            e.receipts.length ? `${e.receipts.length} receipt file${e.receipts.length===1?" is":"s are"} kept with it` : "No receipt files are attached",
            "Restore brings it back with the same amount, accounts and receipts",
            "If it turns out to be posted to your books, nothing is changed and you are asked to reverse it with a reason instead",
          ]}
          reason={{ label: "Reason for withdrawing", placeholder: "For example: entered twice by mistake", validate: withdrawReasonProblem }}
          confirmLabel="Withdraw entry"
          cancelLabel={`Keep ${noun}`}
          onConfirm={withdrawNow}
          onClose={()=>setAsk(null)}
        />
        <ConfirmDialog
          open={ask==="restore"}
          title={`Restore “${e.title}”?`}
          description={`This ${noun} counts again in balances, reports and every total, with the same amount, accounts and receipts. The withdrawal stays in its history.`}
          reason={{ label: "Reason for restoring", placeholder: "For example: withdrawn by mistake", validate: withdrawReasonProblem }}
          confirmLabel="Restore entry"
          cancelLabel="Keep withdrawn"
          onConfirm={async (why)=>{await restoreWithdrawn(e, why);toast.success("Entry restored — it counts again");onClose();}}
          onClose={()=>setAsk(null)}
        />
        <ConfirmDialog
          open={ask==="reimburse"}
          title="Record reimbursement received"
          description={`Records the money paid back for “${e.title}” as a reimbursement entry dated today (${today}) into the account you choose. It settles this claim and is not counted as income.`}
          confirmLabel="Record reimbursement"
          ready={cashAccounts.some(a=>a.id===reimburseTo)}
          onConfirm={async()=>{await recordReimbursement([e.id],reimburseTo,today);toast.success("Reimbursement received");onClose();}}
          onClose={()=>setAsk(null)}
        >
          {cashAccounts.length ? (
            <fieldset className="space-y-1">
              <legend className="mb-1 text-sm font-medium">Received into</legend>
              {cashAccounts.map(a=>(
                <label key={a.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm">
                  <input type="radio" name="reimburse-account" value={a.id} checked={reimburseTo===a.id} onChange={()=>setReimburseTo(a.id)} className="size-4" />
                  <span className="break-words">{a.name}</span>
                </label>
              ))}
            </fieldset>
          ) : (
            <p role="alert" className="text-sm text-destructive">Choose one of your cash or bank accounts — add a savings, current, cash or wallet account first.</p>
          )}
        </ConfirmDialog>
        <ConfirmDialog
          open={ask==="emi"}
          title={`Convert “${e.title}” to EMI`}
          description={`A card EMI plan is created for this ${money(e.amount)} purchase with the term and rate below, repaid monthly on the card. A processing fee above zero is recorded as a separate "Financial charges" expense on the card today. The purchase itself is not changed.`}
          confirmLabel="Convert to EMI"
          ready={!emiCheck.months&&!emiCheck.rate&&!emiCheck.fee}
          onConfirm={async()=>{await convertToEmi(e,{months:Number(emi.months),rate:Number(emi.rate),fee:Number(emi.fee)});toast.success("Purchase converted to EMI");onClose();}}
          onClose={()=>setAsk(null)}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {([["months","EMI term in months (2–60)"],["rate","Annual EMI interest %"],["fee","Processing fee (₹)"]] as const).map(([k,label])=>(
              <div key={k} className="space-y-1">
                <Label htmlFor={`emi-${k}`}>{label}</Label>
                <Input id={`emi-${k}`} inputMode={k==="months"?"numeric":"decimal"} value={emi[k]} aria-invalid={emiCheck[k]?true:undefined} aria-describedby={`emi-${k}-note`} onChange={ev=>setEmi({...emi,[k]:ev.target.value})} />
                <p id={`emi-${k}-note`} className={emiCheck[k]?"text-sm text-destructive":"text-xs text-muted-foreground"}>{emiCheck[k]??""}</p>
              </div>
            ))}
          </div>
        </ConfirmDialog>
        <Dialog open={reverseOpen} onOpenChange={(o) => { if (!o) setReverseOpen(false); }}>
          <DialogContent aria-label="Reverse entry" className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reverse this posted entry?</DialogTitle>
              <DialogDescription>It is already in your books, so it is not deleted. The entry stays and a separate reversal that cancels it is recorded on the correction date, in an open period. The original, the reversal, an audit record with your reason and the receipts are all kept. You will be asked to confirm it is you.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
              <Label htmlFor="reverse-reason">Reason (at least five characters)</Label>
              <Textarea id="reverse-reason" value={reason} maxLength={500} onChange={(ev) => setReason(ev.target.value)} placeholder="For example: duplicate of the bank import" />
              <Label htmlFor="reverse-date">Correction date</Label>
              <Input id="reverse-date" type="date" min={e.date} max={correctionToday()} value={correctionDate} onChange={(ev) => setCorrectionDate(ev.target.value)} />
              <p className="text-xs text-muted-foreground">Closed periods are never reopened. If this date is in a closed period you will be told; a correction of a closed period is a separate prior-period adjustment.</p>
            </div>
            <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setReverseOpen(false)}>Keep entry</Button><Button variant="destructive" disabled={!validReason(reason)} onClick={confirmReverse}>Reverse entry</Button></DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
}
