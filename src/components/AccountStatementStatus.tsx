import { useEffect, useMemo, useRef, useState } from "react";
import { exportDeliver, exportFile } from "@/lib/export-gate";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { listImports, statementEvidence } from "@/lib/import-repository";
import { accountStatementStatus, accountStatementSummary, withStatementDeskEvidence, type StatementStatusEvidence } from "@/lib/account-statement-status";
import { useStore } from "@/lib/store";
import { money } from "@/lib/expenses";
import { statementCoverage } from "@/lib/statement-pipeline/coverage";
import { Button } from "./ui/button";
import { reconciliationReport } from '@/lib/reconciliation-report';
import { toCsv, toExcel, toPdf } from '@/lib/reports';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { backgroundAllowed } from '@/lib/lock-gate';

export function AccountStatementStatus({ onAttention }: { onAttention?: (count: number | null) => void } = {}) {
  const { accounts, transactions: ledgerTransactions, transferCounterparts, preferences, refresh } = useStore();
  const transactions = useMemo(() => [...ledgerTransactions,...(transferCounterparts??[])], [ledgerTransactions,transferCounterparts]);
  const [evidence, setEvidence] = useState<StatementStatusEvidence[]>([]), [status, setStatus] = useState("Loading statement evidence…"), [selected, setSelected] = useState<string | null>(null);
  const generation = useRef(0);
  const latestStore=useRef({accounts,transactions});latestStore.current={accounts,transactions};
  const load = async (updateLedger = false) => {
    const run = ++generation.current;
    try {
      if(updateLedger)await refresh();
      const batches = await listImports();
      // Read durable posting fingerprints with pagination; one statement's failure never becomes a false success.
      const next = await Promise.all(batches.map(async batch => {
        const account=latestStore.current.accounts.find(a=>a.id===batch.account_id);if(!account)throw Error('Account unavailable');
        return statementEvidence(batch,account,latestStore.current.transactions);
      }));
      if (run !== generation.current) return;
      if (run !== generation.current) return;
      setEvidence(next); setStatus("");
    } catch { if (run === generation.current) setStatus("Statement evidence could not refresh. Account checks are unavailable until retry succeeds."); }
  };
  useEffect(() => {
    // Initial load comes from the records effect below. The timer re-reads statement evidence only;
    // a full records refresh runs on focus, reconnect or a statement update.
    // P0-029: focus, reconnect and timer reads are skipped while the app is locked.
    const tick = () => { if (document.visibilityState === "visible" && backgroundAllowed()) void load(true); };
    const timer = window.setInterval(() => { if (document.visibilityState === "visible" && backgroundAllowed()) void load(); }, 20000); window.addEventListener("focus", tick); window.addEventListener("online", tick);window.addEventListener("ledgerline:statement-updated",tick);
    return () => { generation.current++; clearInterval(timer); window.removeEventListener("focus", tick); window.removeEventListener("online", tick);window.removeEventListener("ledgerline:statement-updated",tick); };
  }, []);
  useEffect(()=>{const t=window.setTimeout(()=>void load(),150);return()=>clearTimeout(t);},[transactions,accounts]);
  const today = new Date().toISOString().slice(0, 10);
  const coverage = useMemo(() => new Map(statementCoverage(accounts, transactions, today).map(c => [c.accountId, c])), [accounts, transactions, today]);
  const rows = accounts.filter(a => !a.archived).map(a => withStatementDeskEvidence(accountStatementStatus(a, evidence, transactions, preferences, today), coverage.get(a.id), preferences.freshness.perAccount[a.id] ?? preferences.freshness));
  const summary = accountStatementSummary(rows), focused = rows.find(r => r.accountId === selected);
  const [preparedExport,setPreparedExport]=useState<{key:string;blob:Blob}|null>(null);
  const exportReport=reconciliationReport(rows,evidence,transactions), exportKey=JSON.stringify(exportReport);
  const exportFile=async(format:'csv'|'xlsx'|'pdf')=>{try{
    if(format==='pdf'&&preparedExport?.key!==exportKey){setPreparedExport({key:exportKey,blob:await toPdf(exportReport,`Saved evidence as of ${today}; unavailable checks remain unverified`)});return;}
    const blob=format==='pdf'?preparedExport?.blob:format==='csv'?new Blob([toCsv(exportReport)],{type:'text/csv'}):await toExcel(exportReport);
    if(blob)await exportDeliver({kind:"ledger_csv"},blob,`ledgerline-reconciliation-${today}.${format}`);
  }catch{toast.error('Could not prepare reconciliation export; saved checks are unchanged');}};
  useEffect(() => { onAttention?.(status ? null : summary.attention); }, [status, summary.attention, onAttention]);
  if (status) return <div className="flex flex-wrap items-center gap-2 py-4 text-sm" role="status"><p>{status}</p><Button size="sm" variant="outline" onClick={() => load(true)}>Retry account checks</Button></div>;
  return <section className="space-y-4" aria-label="Statement account status">
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>exportFile('csv')}>Export reconciliation CSV</Button><Button size="sm" variant="outline" onClick={()=>exportFile('xlsx')}>Export reconciliation Excel</Button><Button size="sm" variant="outline" onClick={()=>exportFile('pdf')}>{preparedExport?.key===exportKey?'Download':'Prepare'} reconciliation PDF</Button></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">{[["Total accounts", summary.total], ["Current statements", summary.current], ["Reconciled accounts", summary.reconciled], ["Statement-matched", rows.filter(r => r.reconciliation === "Statement-matched").length], ["Verified balances", summary.verified], ["Requiring attention", summary.attention]].map(([label, count]) => <div key={label} className="border-b py-2"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold tabular-nums">{count}</p></div>)}</div>
    <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="text-xs text-muted-foreground"><tr>{["Account", "Statement through", "Reconciliation", "Balance", "Freshness", ""].map((s, i) => <th key={i} className="px-2 py-2">{s}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.accountId} className="border-t"><td className="px-2 py-3 font-medium">{r.name}</td><td className="px-2">{r.statementThrough ?? "Not available"}</td><td className="px-2">{r.reconciliation}</td><td className="px-2">{r.balance}</td><td className="px-2">{r.freshness}{r.nextStep && <p className="text-xs text-muted-foreground">Next: {r.nextStep}</p>}</td><td className="px-2"><Button variant="ghost" size="sm" onClick={() => setSelected(r.accountId)}>View details<span className="sr-only"> for {r.name}</span></Button></td></tr>)}</tbody></table></div>
    <ul className="divide-y md:hidden">{rows.map(r => <li key={r.accountId} className="space-y-2 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{r.name}</h3><Button variant="ghost" size="sm" onClick={() => setSelected(r.accountId)}>View details<span className="sr-only"> for {r.name}</span></Button></div><dl className="grid grid-cols-2 gap-2 text-xs">{[["Statement through", r.statementThrough ?? "Not available"], ["Reconciliation", r.reconciliation], ["Balance", r.balance], ["Freshness", r.freshness]].map(([l, v]) => <div key={l}><dt className="text-muted-foreground">{l}</dt><dd>{v}</dd></div>)}</dl>{r.nextStep && (r.source === "statement-desk" ? <Link className="block text-xs font-medium text-primary underline" to="/statements">Next: {r.nextStep}</Link> : <Link className="block text-xs font-medium text-primary underline" to="/historical-import" search={r.batchId ? { batch: r.batchId } : {}}>Next: {r.nextStep}</Link>)}</li>)}</ul>
    <Dialog open={!!focused} onOpenChange={v => { if (!v) setSelected(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{focused?.name}</DialogTitle><DialogDescription>Saved statement and current ledger evidence</DialogDescription></DialogHeader>{focused && <><dl className="space-y-2 text-sm">{[["Import", focused.imported], ["Last successful extraction", focused.lastSuccessfulImport ?? "Not available"], ["Statement period", `${focused.periodFrom ?? "Unknown"} — ${focused.periodTo ?? "Unknown"}`], ["Reconciliation", focused.reconciliation], ["Check recorded", focused.reconciliationDate?.slice(0, 10) ?? "Not available"], ["Last verified closing balance", focused.confirmedBalance == null ? "Not verified" : money(focused.confirmedBalance)], ["Balance difference", focused.difference == null ? "Unavailable" : money(focused.difference)], ["Parsed / posted / duplicates / unresolved", `${focused.parsed} / ${focused.posted} / ${focused.duplicates} / ${focused.unresolved}`]].map(([l, v]) => <div key={l}><dt className="text-xs text-muted-foreground">{l}</dt><dd className="break-words">{v}</dd></div>)}</dl><ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">{focused.missing.map(s => <li key={s}>{s}</li>)}</ul>{focused.nextStep && <p className="text-sm font-medium">Next step: {focused.nextStep}</p>}{focused.source === "statement-desk" ? <Button asChild variant="outline"><Link to="/statements">Open Statement Desk</Link></Button> : <Button asChild variant="outline"><Link to="/historical-import" search={focused.batchId ? { batch: focused.batchId } : {}}>Review statement</Link></Button>}</>}</DialogContent></Dialog>
  </section>;
}