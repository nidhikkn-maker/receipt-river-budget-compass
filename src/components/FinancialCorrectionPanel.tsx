import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { useStore, type FinancialCorrectionHistory } from "@/lib/store";
import { money } from "@/lib/expenses";
import { TXN_LABEL, type TxnType } from "@/lib/ledger";
import type { FinancialReview } from "@/lib/financial-review";
import { CORRECTION_TYPES, correctionPreview, correctionStillCurrent, type CorrectionPreview } from "@/lib/financial-corrections";

export function FinancialCorrectionPanel({ rows, onSaved }: { rows: FinancialReview[]; onSaved: () => void }) {
  const { accounts, transactions, correctFinancialEntries, undoFinancialCorrection, financialCorrectionHistory } = useStore();
  const [type, setType] = useState("keep"), [source, setSource] = useState("keep"), [destination, setDestination] = useState("keep");
  const [principal, setPrincipal] = useState(""), [interest, setInterest] = useState("");
  const [preview, setPreview] = useState<CorrectionPreview | null>(null);
  const [history, setHistory] = useState<FinancialCorrectionHistory[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [restore, setRestore] = useState<string | null>(null);
  const operation = useRef<string | null>(null);
  const loadHistory = async () => { if (!financialCorrectionHistory) return; try { setHistory(await financialCorrectionHistory()); setHistoryError(""); } catch { setHistoryError("Correction history could not load."); } };
  useEffect(() => { void loadHistory(); }, []);
  const selectAccount = (label: string, value: string, set: (v: string) => void) => <Select value={value} onValueChange={set}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="keep">{label} · keep existing</SelectItem>{accounts.filter(a => !a.archived).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>;
  const show = () => {
    try { const next = correctionPreview(rows, { ...(type !== "keep" ? { txnType: type as TxnType } : {}), ...(source !== "keep" ? { accountId: source } : {}), ...(destination !== "keep" ? { toAccountId: destination } : {}), ...(principal !== "" ? { principal: Number(principal) } : {}), ...(interest !== "" ? { interest: Number(interest) } : {}) }, accounts, transactions); operation.current = crypto.randomUUID(); setPreview(next); } catch (e) { toast.error((e as Error).message); }
  };
  const apply = async () => {
    if (!preview || !operation.current) return;
    if (!correctionStillCurrent(preview, transactions, accounts)) throw Error("Records or accounts changed. Review a new preview before saving.");
    await correctFinancialEntries(preview, operation.current);
    setPreview(null); operation.current = null; onSaved(); await loadHistory();
    toast.success("Financial correction saved. Statement matching needs review again.");
  };
  const name = (id?: string | null) => accounts.find(a => a.id === id)?.name ?? "Not recorded";
  return <div className="space-y-3 border-y py-3">
    <h3 className="text-sm font-semibold">Account & transaction-type corrections</h3>
    <div className="grid gap-2 sm:grid-cols-3"><Select value={type} onValueChange={setType}><SelectTrigger aria-label="Correction transaction type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="keep">Type · keep existing</SelectItem>{CORRECTION_TYPES.map(t => <SelectItem key={t} value={t}>{TXN_LABEL[t]}</SelectItem>)}</SelectContent></Select>{selectAccount("Source account", source, setSource)}{selectAccount("Receiving account", destination, setDestination)}</div>
    {type === "loan_repayment" && <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs">Principal · original currency<Input aria-label="Correction principal" type="number" min="0" value={principal} onChange={e => setPrincipal(e.target.value)} /></label><label className="text-xs">Interest · original currency<Input aria-label="Correction interest" type="number" min="0" value={interest} onChange={e => setInterest(e.target.value)} /></label></div>}
    <Button variant="outline" disabled={!rows.length} onClick={show}>Preview account & type changes</Button>
    {historyError && <div className="flex gap-2 text-sm"><p>{historyError}</p><Button variant="ghost" size="sm" onClick={loadHistory}>Retry history</Button></div>}
    {!!history.length && <details><summary className="cursor-pointer text-sm">Financial correction history ({history.length})</summary><ul className="mt-2 divide-y text-sm">{history.map(h => <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{h.createdAt.slice(0, 10)} · {h.count} transactions</span><Button variant="outline" size="sm" onClick={() => setRestore(h.id)}><Undo2 className="mr-1 size-4" />Review undo</Button></li>)}</ul></details>}
    <Dialog open={!!preview} onOpenChange={v => { if (!v) setPreview(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Confirm financial correction</DialogTitle><DialogDescription>{preview?.records.length} transactions · exact account and type changes</DialogDescription></DialogHeader>
      <div className="grid grid-cols-2 gap-3 border-y py-3 text-sm"><p>Income change<br /><strong>{money(preview?.incomeChange ?? 0)}</strong></p><p>Spending change<br /><strong>{money(preview?.spendingChange ?? 0)}</strong></p></div>
      <ul className="space-y-1 text-sm">{preview?.balanceChanges.map(a => <li key={a.id} className="flex flex-wrap justify-between gap-2"><span>{a.name}{["credit_card", "loan", "other_liability"].includes(a.kind) ? " · owed balance change" : " · balance change"}</span><strong>{money(a.change)}</strong></li>)}</ul>
      <ul className="divide-y text-sm">{preview?.records.map((e, index) => { const next = preview.after[index]; return <li key={e.id} className="space-y-1 py-3"><p className="break-words font-medium">{e.date} · {e.title} · {money(e.amount)}</p><p className="break-all text-xs text-muted-foreground">{e.id}</p><p>{TXN_LABEL[e.txnType ?? "expense"]} → {TXN_LABEL[next?.txnType ?? "expense"]}</p><p>Source: {name(e.accountId)} → {name(next?.accountId)}</p><p>Receiving: {name(e.toAccountId)} → {name(next?.toAccountId)}</p>{next?.txnType === "loan_repayment" && <p>Principal {next.principal} · Interest {next.interest} {e.currency}</p>}<p className="break-words text-xs text-muted-foreground">Original: {e.originalAmount} {e.currency} · rate {e.fxRate} · {e.statementRef ?? "No statement reference"}</p></li>; })}</ul>
      <p className="text-sm text-muted-foreground">Original amounts, exchange rates, dates, narration and statements stay unchanged. Previous statement matching is reset for review. No entries are created or merged. Changes are audited; later edits block undo.</p>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button><Button onClick={apply}>Confirm financial changes</Button></div>
    </DialogContent></Dialog>
    <Dialog open={!!restore} onOpenChange={v => { if (!v) setRestore(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Restore original account & type?</DialogTitle><DialogDescription>The exact original accounts, types, repayment split and previous statement matching will be restored for this batch. Any later edit blocks the entire restoration.</DialogDescription></DialogHeader><ul className="divide-y text-sm">{history.find(h => h.id === restore)?.entries.map(e => <li key={e.before.id} className="space-y-1 py-2"><p className="font-medium">{e.before.title} · {money(Number(e.before.amount))}</p><p>{TXN_LABEL[e.after.txn_type]} → {TXN_LABEL[e.before.txn_type]}</p><p>Source: {name(e.after.account_id)} → {name(e.before.account_id)}</p><p>Receiving: {name(e.after.to_account_id)} → {name(e.before.to_account_id)}</p>{e.before.txn_type === "loan_repayment" && <p>Original principal {e.before.principal} · interest {e.before.interest}</p>}</li>)}</ul><Button variant="outline" onClick={() => setRestore(null)}>Cancel</Button><Button onClick={async () => { if (!restore) return; await undoFinancialCorrection(restore); setRestore(null); await loadHistory(); toast.success("Original financial treatment restored."); }}>Confirm restoration</Button></DialogContent></Dialog>
  </div>;
}