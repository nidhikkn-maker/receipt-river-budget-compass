import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { listImports, statementEvidence } from "@/lib/import-repository";
import { accountStatementStatus, accountStatementSummary, type StatementStatusEvidence } from "@/lib/account-statement-status";
import { useStore } from "@/lib/store";
import { money } from "@/lib/expenses";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

export function AccountStatementStatus() {
  const { accounts, transactions, preferences, refresh } = useStore();
  const [evidence, setEvidence] = useState<StatementStatusEvidence[]>([]), [status, setStatus] = useState("Loading statement evidence…"), [selected, setSelected] = useState<string | null>(null);
  const generation = useRef(0);
  const load = async (updateLedger = false) => {
    const run = ++generation.current;
    try {
      const batches = await listImports();
      // Read durable posting fingerprints with pagination; one statement's failure never becomes a false success.
      const next = await Promise.all(batches.map(async batch => {
        const account=accounts.find(a=>a.id===batch.account_id);if(!account)throw Error('Account unavailable');
        return statementEvidence(batch,account,transactions);
      }));
      if (run !== generation.current) return;
      if (updateLedger) await refresh();
      if (run !== generation.current) return;
      setEvidence(next); setStatus("");
    } catch { if (run === generation.current) setStatus("Statement evidence could not refresh. Account checks are unavailable until retry succeeds."); }
  };
  useEffect(() => {
    void load();
    const tick = () => { if (document.visibilityState === "visible") void load(true); };
    const timer = window.setInterval(tick, 20000); window.addEventListener("focus", tick); window.addEventListener("online", tick);window.addEventListener("ledgerline:statement-updated",tick);
    return () => { generation.current++; clearInterval(timer); window.removeEventListener("focus", tick); window.removeEventListener("online", tick);window.removeEventListener("ledgerline:statement-updated",tick); };
  }, []);
  const rows = accounts.filter(a => !a.archived).map(a => accountStatementStatus(a, evidence, transactions, preferences, new Date().toISOString().slice(0, 10)));
  const summary = accountStatementSummary(rows), focused = rows.find(r => r.accountId === selected);
  if (status) return <div className="flex flex-wrap items-center gap-2 py-4 text-sm" role="status"><p>{status}</p><Button size="sm" variant="outline" onClick={() => load(true)}>Retry account checks</Button></div>;
  return <section className="space-y-4" aria-label="Statement account status">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[["Total accounts", summary.total], ["Current statements", summary.current], ["Reconciled accounts", summary.reconciled], ["Verified balances", summary.verified], ["Requiring attention", summary.attention]].map(([label, count]) => <div key={label} className="border-b py-2"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold tabular-nums">{count}</p></div>)}</div>
    <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="text-xs text-muted-foreground"><tr>{["Account", "Statement through", "Reconciliation", "Balance", "Freshness", ""].map((s, i) => <th key={i} className="px-2 py-2">{s}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.accountId} className="border-t"><td className="px-2 py-3 font-medium">{r.name}</td><td className="px-2">{r.statementThrough ?? "Not available"}</td><td className="px-2">{r.reconciliation}</td><td className="px-2">{r.balance}</td><td className="px-2">{r.freshness}</td><td className="px-2"><Button variant="ghost" size="sm" onClick={() => setSelected(r.accountId)}>View details<span className="sr-only"> for {r.name}</span></Button></td></tr>)}</tbody></table></div>
    <ul className="divide-y md:hidden">{rows.map(r => <li key={r.accountId} className="space-y-2 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{r.name}</h3><Button variant="ghost" size="sm" onClick={() => setSelected(r.accountId)}>View details<span className="sr-only"> for {r.name}</span></Button></div><dl className="grid grid-cols-2 gap-2 text-xs">{[["Statement through", r.statementThrough ?? "Not available"], ["Reconciliation", r.reconciliation], ["Balance", r.balance], ["Freshness", r.freshness]].map(([l, v]) => <div key={l}><dt className="text-muted-foreground">{l}</dt><dd>{v}</dd></div>)}</dl></li>)}</ul>
    <Dialog open={!!focused} onOpenChange={v => { if (!v) setSelected(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{focused?.name}</DialogTitle><DialogDescription>Saved statement and current ledger evidence</DialogDescription></DialogHeader>{focused && <><dl className="space-y-2 text-sm">{[["Import", focused.imported], ["Last successful extraction", focused.lastSuccessfulImport ?? "Not available"], ["Statement period", `${focused.periodFrom ?? "Unknown"} — ${focused.periodTo ?? "Unknown"}`], ["Reconciliation", focused.reconciliation], ["Check recorded", focused.reconciliationDate?.slice(0, 10) ?? "Not available"], ["Last verified closing balance", focused.confirmedBalance == null ? "Not verified" : money(focused.confirmedBalance)], ["Balance difference", focused.difference == null ? "Unavailable" : money(focused.difference)], ["Parsed / posted / duplicates / unresolved", `${focused.parsed} / ${focused.posted} / ${focused.duplicates} / ${focused.unresolved}`]].map(([l, v]) => <div key={l}><dt className="text-xs text-muted-foreground">{l}</dt><dd className="break-words">{v}</dd></div>)}</dl><ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">{focused.missing.map(s => <li key={s}>{s}</li>)}</ul><Button asChild variant="outline"><Link to="/historical-import" search={focused.batchId ? { batch: focused.batchId } : {}}>Review statement</Link></Button></>}</DialogContent></Dialog>
  </section>;
}