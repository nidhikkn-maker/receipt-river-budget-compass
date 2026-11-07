import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { CheckCircle2, CircleDashed, AlertCircle, Upload, X } from "lucide-react";
import { Card } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { completeness, mergeInvestmentDoc, type CheckState, type InvestDoc, type StoredHolding } from "@/lib/investments/demat";
import { createDemat, loadDemat, matchDemat, restoreHoldings, saveHoldings, type DematWithHoldings } from "@/lib/investments/holdings-store";
import { originalId } from '@/lib/statement-pipeline/apply';
import { readStatementFile } from '@/lib/statement-pipeline/source';
import type { StmtLine } from '@/lib/statement-pipeline/line';
import { brokerCashReconciliation } from '@/lib/investments/broker-reconciliation';

const TITLE: Record<InvestDoc["kind"], string> = { demat: "Demat Statement Review", transactions: "Transaction Statement Review", gains: "Capital Gains Statement Review" };
const DOC_TYPE = { demat: "demat_statement", transactions: "transaction_statement", gains: "capital_gains_statement" } as const;

function Row({ label, state, text }: { label: string; state: CheckState; text: string }) {
  const Icon = state === "ok" ? CheckCircle2 : state === "missing" ? AlertCircle : CircleDashed;
  const tone = state === "ok" ? "text-success" : state === "missing" ? "text-destructive" : "text-muted-foreground";
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-sm">{label}</span>
      <span className={`flex items-center gap-1.5 text-sm font-medium ${tone}`}><Icon className="h-4 w-4" />{text}</span>
    </li>
  );
}

/** One investment document: identify the demat account, fold rows in by ISIN, show the six checks, save on tap. */
export function InvestmentReview({ file, doc, onClose, onUploadMore, onReviewCash }: { file: File; doc: InvestDoc; onClose: () => void; onUploadMore: () => void; onReviewCash?: (file: File, accountId: string) => Promise<void> }) {
  const { addDocument, userId, accounts: ledgerAccounts, transactions } = useStore();
  const [accounts, setAccounts] = useState<DematWithHoldings[] | null>(null);
  const [pick, setPick] = useState<string>("");
  const [saved, setSaved] = useState<{ dematId: string; before: StoredHolding[]; after: StoredHolding[]; docId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [createdAccountId, setCreatedAccountId] = useState<string|null>(null);
  const [cashAccount, setCashAccount] = useState('');
  const [cashStatement, setCashStatement] = useState<{lines:StmtLine[];closing:number|null}|null>(null);
  useEffect(()=>{let live=true;setCashStatement(null);void readStatementFile(file).then(r=>{const part=r.files[0];if(live&&part?.lines.length)setCashStatement({lines:part.lines,closing:part.closing});}).catch(()=>{});return()=>{live=false;};},[file]);
  useEffect(() => { loadDemat().then(setAccounts).catch(() => setAccounts([])); }, []);

  const matched = accounts ? matchDemat(accounts, doc) : null;
  const target = accounts?.find((a) => a.id === (pick || matched?.id)) ?? null;
  // Trade and gains files rarely print IDs; with exactly one demat account on file, that one is the only candidate.
  const onlyOne = !matched && doc.kind !== "demat" && accounts?.length === 1 ? accounts[0]! : null;
  const dest = target ?? onlyOne;
  const merge = useMemo(() => mergeInvestmentDoc(saved ? saved.after : dest?.holdings ?? [], doc, file.name), [dest, doc, file.name, saved]);
  const check = completeness({ dpId: doc.dpId || dest?.dpId || "", clientId: doc.clientId || dest?.clientId || "", holdings: merge.holdings, stored: !!saved });
  const needsAccount = doc.kind !== "demat" && !dest;

  const save = async () => {
    setBusy(true);
    try {
      const dematId = dest?.id ?? createdAccountId ?? await createDemat(doc);
      if(!dest)setCreatedAccountId(dematId);
      const before = dest?.holdings ?? [];
      const docId = await addDocument(file, { id: await originalId(userId,await file.arrayBuffer()), evidenceLocked: true, title: `${doc.broker || "Investment"} ${TITLE[doc.kind].replace(" Review", "")}${doc.asOf ? ` ${doc.asOf}` : ""}`, docType: DOC_TYPE[doc.kind], docDate: doc.asOf, amount: null, currency: "INR", merchant: doc.broker || null, notes: `Read on Statement Desk: ${merge.added.holdings} new holdings, ${merge.added.lots} trades, ${merge.added.gains} gains.`, transactionId: null, accountId: null, loanId: null, expiresOn: null });
      const after = mergeInvestmentDoc(before, doc, docId).holdings;
      await saveHoldings(dematId, after);
      setSaved({ dematId, before, after, docId });
      toast.success("Saved to Investments, original stored in DocuRepo");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const undo = async () => {
    if (!saved) return; setBusy(true);
    try { await restoreHoldings(saved.dematId, saved.before, saved.after); setSaved(null); toast.success("Holdings put back as they were. The document stays in DocuRepo."); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const valuationText = merge.holdings.some((h) => h.statementValue != null) ? "Price data required" : "Price data required";
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">{TITLE[doc.kind]}</h2><p className="text-sm text-muted-foreground">{file.name}{doc.broker ? ` · ${doc.broker}` : ""}</p></div>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded-xl p-1.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <ul className="mt-3 divide-y divide-border">
        <Row label="Demat account" state={check.account === "ok" || dest ? "ok" : "needed"} text={dest ? `Identified${dest.clientId ? ` · ${dest.clientId}` : ""}` : check.account === "ok" ? "Identified" : "Confirm account"} />
        <Row label="Stock holdings" state={check.holdings} text={merge.holdings.length ? `Extracted · ${merge.holdings.length}` : "None found"} />
        <Row label="Portfolio valuation" state="needed" text={valuationText} />
        <Row label="Purchase history" state={check.purchaseHistory} text={check.purchaseHistory === "ok" ? "Complete" : check.purchaseHistory === "missing" ? `Missing for ${check.missingHistory.length}` : "Check completeness"} />
        <Row label="Capital gains" state={check.capitalGains} text={check.capitalGains === "ok" ? "Verified" : "Pending verification"} />
        <Row label="Original document" state={check.original} text={saved ? "Stored in DocuRepo" : "Stored in DocuRepo on save"} />
      </ul>

      {needsAccount && accounts && (
        <div className="mt-3 rounded-2xl bg-muted p-3 text-sm">
          {accounts.length ? (<>
            <p className="mb-2">Which demat account is this for?</p>
            <select className="w-full rounded-xl border bg-background p-2" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.broker || "Demat"} {a.clientId || a.dpId}</option>)}
            </select>
          </>) : <p>Upload the demat holding statement first, so these lines can attach to its holdings.</p>}
        </div>
      )}

      {merge.unmatched.length > 0 && <p className="mt-3 text-sm text-muted-foreground">Not in your holdings, so not added: {merge.unmatched.map((u) => u.name || u.isin).join(", ")}.</p>}
      {!!doc.events?.length && <div className="mt-3 text-sm"><p className="font-semibold">Other events on this statement ({doc.events.length})</p>{doc.events.slice(0, 12).map((e, i) => <p key={i} className="text-xs text-muted-foreground">{e.date} · {e.name || e.isin} · {e.kind}{e.quantity != null ? ` · ${e.quantity} units` : ""}{e.amount != null ? ` · ₹${e.amount.toLocaleString("en-IN")}` : ""}</p>)}<p className="text-xs text-muted-foreground">Events are saved with their source for review. Dividends need matching bank receipts; redemptions require separate capital and gain checks. Quantities, cost and bank entries are never changed automatically.</p></div>}
      {cashStatement&&<section aria-label="Broker statement cash check" className="mt-3 space-y-2 text-sm">
        <h3 className="font-semibold">Broker statement cash</h3>
        <select aria-label="Broker cash ledger account" className="w-full rounded-md border bg-background p-2" value={cashAccount} onChange={e=>setCashAccount(e.target.value)}>
          <option value="">Choose cash-only account…</option>
          {ledgerAccounts.filter(a=>!a.archived&&['savings','current','cash','wallet'].includes(a.kind)).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {(()=>{const account=ledgerAccounts.find(a=>a.id===cashAccount);if(!account)return null;const r=brokerCashReconciliation(cashStatement.lines,account,transactions,cashStatement.closing);return <>
          <p>{r.rows.length-r.missing} matched · {r.missing} unresolved{r.difference!==null?` · closing difference INR ${r.difference.toFixed(2)}`:' · closing not compared'}</p>
          <ul>{r.rows.filter(x=>x.state!=='matched').slice(0,20).map(x=><li key={x.line.key} className="text-warning">{x.line.date} · {x.line.description} · {x.state}</li>)}</ul>
          {onReviewCash && <Button size="sm" variant="outline" onClick={() => onReviewCash(file, account.id)}>Review cash statement entries</Button>}
        </>;})()}
      </section>}
      {merge.duplicatesSkipped > 0 && <p className="mt-1 text-sm text-muted-foreground">{merge.duplicatesSkipped} line{merge.duplicatesSkipped === 1 ? "" : "s"} already on file, skipped.</p>}

      {check.needsHistoryUpload && (
        <div className="mt-4 rounded-2xl border border-gold/40 bg-gold/10 p-3">
          <p className="text-sm">Buy dates or costs are missing for {check.missingHistory.slice(0, 3).map((m) => m.name || m.isin).join(", ")}{check.missingHistory.length > 3 ? ` and ${check.missingHistory.length - 3} more` : ""}.</p>
          <Button variant="outline" size="sm" className="mt-2 h-auto whitespace-normal py-2 text-left" onClick={onUploadMore}><Upload className="h-4 w-4" />Upload ICICI Direct Transaction Statement or Capital Gains Statement</Button>
        </div>
      )}

      {merge.holdings.length > 0 && (
        <details className="mt-4 text-sm"><summary className="cursor-pointer text-muted-foreground">Holdings ({merge.holdings.length})</summary>
          <ul className="mt-2 space-y-1">{merge.holdings.map((h) => <li key={h.isin} className="flex justify-between gap-2"><span className="truncate">{h.name || h.isin} <span className="text-muted-foreground">{h.isin}</span></span><span className="tabular-nums">{h.quantity}</span></li>)}</ul>
        </details>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!saved ? <Button onClick={save} loading={busy} disabled={needsAccount || !merge.holdings.length}>Save to Investments</Button>
          : <><Button variant="outline" onClick={undo} loading={busy}>Undo</Button><Button asChild variant="ghost"><Link to="/wealth">Open Wealth</Link></Button></>}
      </div>
    </Card>
  );
}
