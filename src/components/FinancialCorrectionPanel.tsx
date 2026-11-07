import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { useStore, type FinancialCorrectionHistory } from "@/lib/store";
import { money } from "@/lib/expenses";
import { isMove, TXN_LABEL, type TxnType } from "@/lib/ledger";
import type { FinancialReview } from "@/lib/financial-review";
import { CORRECTION_TYPES, correctionPreview, correctionStillCurrent, type CorrectionPreview } from "@/lib/financial-corrections";
import { correctionDestinationAccounts, correctionFields, intentAccounts, TXN_INTENTS } from "@/lib/correction-fields";
import { Link } from "@tanstack/react-router";

export function FinancialCorrectionPanel({ rows, onSaved }: { rows: FinancialReview[]; onSaved: () => void }) {
  const { accounts, transactions, correctFinancialEntries, undoFinancialCorrection, financialCorrectionHistory } = useStore();
  const [type, setType] = useState("keep"), [source, setSource] = useState("keep"), [destination, setDestination] = useState("keep");
  const [intentId, setIntentId] = useState("keep");
  const intent = TXN_INTENTS.find(i => i.id === intentId);
  const scoped = intentAccounts(intent, accounts);
  const [principal, setPrincipal] = useState(""), [interest, setInterest] = useState("");
  const [preview, setPreview] = useState<CorrectionPreview | null>(null);
  const [history, setHistory] = useState<FinancialCorrectionHistory[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [restore, setRestore] = useState<string | null>(null);
  const operation = useRef<string | null>(null);
  const loadHistory = async () => { if (!financialCorrectionHistory) return; try { setHistory(await financialCorrectionHistory()); setHistoryError(""); } catch { setHistoryError("Correction history could not load."); } };
  useEffect(() => { void loadHistory(); }, []);
  const fields = correctionFields(type === "keep" ? undefined : type as TxnType, rows.map(row => row.transaction));
  const destinationAccounts = intent ? scoped.destinations : correctionDestinationAccounts(fields.type, accounts);
  const changeType = (value: string) => {
    const next = correctionFields(value === "keep" ? undefined : value as TxnType, rows.map(row => row.transaction));
    if (!next.destination || !correctionDestinationAccounts(next.type, accounts).some(a => a.id === destination)) setDestination("keep");
    if (!next.repayment) { setPrincipal(""); setInterest(""); }
    setType(value); setPreview(null); operation.current = null;
  };
  const selectAccount = (label: string, value: string, set: (v: string) => void, options = accounts.filter(a => !a.archived)) => <Select value={value} onValueChange={set}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="keep">{label} · keep existing</SelectItem>{options.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>;
  const show = () => {
    try { if (fields.mixed) throw Error("Review different transaction types separately or choose the intended type before previewing."); const next = correctionPreview(rows, { ...(type !== "keep" ? { txnType: type as TxnType } : {}), ...(source !== "keep" ? { accountId: source } : {}), ...(fields.destination && destination !== "keep" ? { toAccountId: destination } : {}), ...(fields.repayment && principal !== "" ? { principal: Number(principal) } : {}), ...(fields.repayment && interest !== "" ? { interest: Number(interest) } : {}) }, accounts, transactions); operation.current = crypto.randomUUID(); setPreview(next); } catch (e) { const m = (e as Error).message; toast.error(m.startsWith("No account or transaction-type") ? "These transactions already have that type and account, so there is nothing to change. To clear them from review, use “Confirm as reviewed”." : m); }
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
    <label className="block text-xs font-medium">What is this transaction?<Select value={intentId} onValueChange={v => { setIntentId(v); const i = TXN_INTENTS.find(x => x.id === v); changeType(i?.type ?? "keep"); setSource("keep"); }}><SelectTrigger aria-label="What is this transaction?" className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="keep">Keep current treatment</SelectItem>{TXN_INTENTS.map(i => <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>)}</SelectContent></Select></label>
    {intent && <p className="text-xs text-muted-foreground">{intent.note}{intent.id === "own_transfer" && <> <Link to="/transfers" className="underline">Open moves between my accounts</Link></>}{intent.id === "third_party" && <> <Link to="/settings" className="underline">Manage recipients</Link></>}</p>}
    {intent?.type === null ? null : <div className="grid gap-2 sm:grid-cols-3"><Select value={type} onValueChange={changeType}><SelectTrigger aria-label="Correction transaction type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="keep">Type · keep existing</SelectItem>{CORRECTION_TYPES.map(t => <SelectItem key={t} value={t}>{TXN_LABEL[t]}</SelectItem>)}</SelectContent></Select>{!fields.mixed && selectAccount(fields.accountLabel, source, setSource, intent ? scoped.sources : undefined)}{fields.destination && selectAccount("Receiving account", destination, setDestination, destinationAccounts)}</div>}
    {fields.mixed && <p className="text-sm text-muted-foreground">Selected transactions have different financial types. Review compatible transactions separately before changing accounts.</p>}
    {fields.repayment && <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs">Principal · original currency<Input aria-label="Correction principal" type="number" min="0" value={principal} onChange={e => setPrincipal(e.target.value)} /></label><label className="text-xs">Interest · original currency<Input aria-label="Correction interest" type="number" min="0" value={interest} onChange={e => setInterest(e.target.value)} /></label></div>}
    <Button variant="outline" disabled={!rows.length} onClick={show}>Preview account & type changes</Button>
    {historyError && <div className="flex gap-2 text-sm"><p>{historyError}</p><Button variant="ghost" size="sm" onClick={loadHistory}>Retry history</Button></div>}
    {!!history.length && <details><summary className="cursor-pointer text-sm">Financial correction history ({history.length})</summary><ul className="mt-2 divide-y text-sm">{history.map(h => <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{h.createdAt.slice(0, 10)} · {h.count} transactions</span><Button variant="outline" size="sm" onClick={() => setRestore(h.id)}><Undo2 className="mr-1 size-4" />Review undo</Button></li>)}</ul></details>}
    <Dialog open={!!preview} onOpenChange={v => { if (!v) setPreview(null); }}><DialogContent className="max-h-[85dvh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Confirm financial correction</DialogTitle><DialogDescription>{preview?.records.length} transactions · exact account and type changes</DialogDescription></DialogHeader>
      <div className="grid grid-cols-2 gap-3 border-y py-3 text-sm"><p>Income change<br /><strong>{money(preview?.incomeChange ?? 0)}</strong></p><p>Spending change<br /><strong>{money(preview?.spendingChange ?? 0)}</strong></p></div>
      <ul className="space-y-1 text-sm">{preview?.balanceChanges.map(a => <li key={a.id} className="flex flex-wrap justify-between gap-2"><span>{a.name}{["credit_card", "loan", "other_liability"].includes(a.kind) ? " · owed balance change" : " · balance change"}</span><strong>{money(a.change)}</strong></li>)}</ul>
      <ul className="divide-y text-sm">{preview?.records.map((e, index) => { const next = preview.after[index]; return <li key={e.id} className="space-y-1 py-3"><p className="break-words font-medium">{e.date} · {e.title} · {money(e.amount)}</p><p className="break-all text-xs text-muted-foreground">{e.id}</p><p>{TXN_LABEL[e.txnType ?? "expense"]} → {TXN_LABEL[next?.txnType ?? "expense"]}</p><p>Account: {name(e.accountId)} → {name(next?.accountId)}</p>{(isMove(e.txnType)||isMove(next?.txnType))&&<p>Receiving: {name(e.toAccountId)} → {name(next?.toAccountId)}</p>}{next?.txnType === "loan_repayment" && <p>Principal {next.principal} · Interest {next.interest} {e.currency}</p>}<p className="break-words text-xs text-muted-foreground">Original: {e.originalAmount} {e.currency} · rate {e.fxRate} · {e.statementRef ?? "No statement reference"}</p></li>; })}</ul>
      <p className="text-sm text-muted-foreground">Original amounts, exchange rates, dates, narration and statements stay unchanged. Previous statement matching is reset for review. No entries are created or merged. Changes are audited; later edits block undo.</p>
      <div className="sticky bottom-0 grid gap-2 border-t bg-background py-2 [&_button]:min-h-11 [&_button]:whitespace-normal sm:grid-cols-2"><Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button><Button onClick={apply}>Confirm financial changes</Button></div>
    </DialogContent></Dialog>
    <Dialog open={!!restore} onOpenChange={v => { if (!v) setRestore(null); }}><DialogContent className="max-h-[85dvh] w-[calc(100vw-1.5rem)] overflow-y-auto"><DialogHeader><DialogTitle>Restore original account & type?</DialogTitle><DialogDescription>The exact original accounts, types, repayment split and previous statement matching will be restored for this batch. Any later edit blocks the entire restoration.</DialogDescription></DialogHeader><ul className="divide-y text-sm">{history.find(h => h.id === restore)?.entries.map(e => <li key={e.before.id} className="space-y-1 py-2"><p className="font-medium">{e.before.title} · {money(Number(e.before.amount))}</p><p>{TXN_LABEL[e.after.txn_type]} → {TXN_LABEL[e.before.txn_type]}</p><p>Source: {name(e.after.account_id)} → {name(e.before.account_id)}</p><p>Receiving: {name(e.after.to_account_id)} → {name(e.before.to_account_id)}</p>{e.before.txn_type === "loan_repayment" && <p>Original principal {e.before.principal} · interest {e.before.interest}</p>}</li>)}</ul><Button variant="outline" onClick={() => setRestore(null)}>Cancel</Button><Button onClick={async () => { if (!restore) return; await undoFinancialCorrection(restore); setRestore(null); onSaved(); await loadHistory(); toast.success("Original financial treatment restored."); }}>Confirm restoration</Button></DialogContent></Dialog>
  </div>;
}