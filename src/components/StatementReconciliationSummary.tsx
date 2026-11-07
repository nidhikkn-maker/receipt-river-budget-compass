import { useState } from 'react';
import { useStore } from '@/lib/store';
import { money } from '@/lib/expenses';
import { isLiability } from '@/lib/ledger';
import { importReconciliationSummary, reconciliationReadiness, type ImportBatch, type ImportRow } from '@/lib/historical-import';

export function StatementReconciliationSummary({batch,rows,posted,importingIds}:{batch:ImportBatch;rows:ImportRow[];posted:Set<string>;importingIds:Set<string>}) {
  const {accounts}=useStore();const a=accounts.find(x=>x.id===batch.account_id);
  const s=importReconciliationSummary({opening:batch.opening_balance,closing:batch.closing_balance,sourceOpening:batch.source_balances?.opening?.value??null,sourceClosing:batch.source_balances?.closing?.value??null,rows,posted,importingIds,liability:a?isLiability(a.kind):false});
  const [all,setAll]=useState(false);const ready=reconciliationReadiness(batch,rows,posted,a?isLiability(a.kind):false,n=>money(n,batch.currency));
  const show=(n:number|null)=>n==null?'Not entered':money(n,batch.currency);
  const items:[string,string][]=[['Opening balance',show(batch.opening_balance)],['Closing balance',show(batch.closing_balance)],['Money in (statement)',money(s.credits,batch.currency)],['Money out (statement)',money(s.debits,batch.currency)],['Expected closing from lines',show(s.expectedClosing)],['Difference',s.difference==null?'Not available':money(s.difference,batch.currency)],[`Imported after confirm · ${s.recordedCount} lines`,money(s.recordedMovement,batch.currency)],['Balance after import',show(s.balanceAfterImport)]];
  return <section aria-label="Statement reconciliation summary" className="rounded-md border p-3 space-y-3">
    <h4 className="font-semibold">Reconciliation summary</h4>
    <ReadinessBadge r={ready}/>
    <button type="button" className="text-xs underline" aria-expanded={all} onClick={()=>setAll(!all)}>{all?'Hide checks':'Show all checks'}</button>
    {all&&<ul className="space-y-1 text-sm">{ready.checks.map(c=><li key={c.label} className={c.ok?'text-success':'text-warning'}>{c.ok?'✓':'✗'} {c.label}</li>)}</ul>}
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">{items.map(([k,v])=><div key={k} className="min-w-0"><dt className="text-xs text-muted-foreground break-words">{k}</dt><dd className="tabular-nums font-medium break-words">{v}</dd></div>)}</dl>
    {s.discrepancies.length?<ul className="space-y-1 text-sm text-warning">{s.discrepancies.map(d=><li key={d}>• {d}</li>)}</ul>:<p className="text-sm text-success">No discrepancies — balances and lines agree.</p>}
    <p className="text-xs text-muted-foreground">Nothing is adjusted automatically. Edit balances under Historical balance verification below.</p>
  </section>;
}

export function ReadinessBadge({r}:{r:{state:string;title:string;reason:string}}) {
  const tone=r.state==='reconciled'||r.state==='ready'?'text-success':r.state==='failed'||r.state==='blocked'?'text-destructive':'text-warning';
  return <div role="status"><p className={`text-sm font-semibold ${tone}`}>{r.title}</p><p className="text-xs text-muted-foreground break-words">{r.reason}</p></div>;
}
