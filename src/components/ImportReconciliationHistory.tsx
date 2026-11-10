import { useState } from 'react';
import { exportFile } from "@/lib/export-gate";
import { useStore } from '@/lib/store';
import { listImportRows, statementEvidence } from '@/lib/import-repository';
import { accountStatementStatus } from '@/lib/account-statement-status';
import { statementReconciliationSummary } from '@/lib/import-manifest';
import type { ImportBatch } from '@/lib/historical-import';
import { supabase } from '@/integrations/supabase/client';
import { toCsv } from '@/lib/reports';
import { money } from '@/lib/expenses';
import { Button } from './ui/button';

interface HistoryLine {batch:ImportBatch;account:string;status:string;difference:number|null;unresolved:number;debits:number;credits:number}
export function ImportReconciliationHistory({batches,onOpen}:{batches:ImportBatch[];onOpen:(id:string)=>Promise<void>}) {
  const {accounts,transactions,preferences}=useStore();const [lines,setLines]=useState<HistoryLine[]|null>(null);
  const load=async()=>{
    const posted=new Set<string>();
    for(let from=0;;from+=1000){const r=await supabase.from('import_posts').select('account_id,fingerprint').range(from,from+999);if(r.error)throw Error('Could not read reconciliation history');r.data.forEach(row=>posted.add(`${row.account_id}:${row.fingerprint}`));if(r.data.length<1000)break;}
    const next=await Promise.all(batches.map(async batch=>{
      const rows=await listImportRows(batch.id),account=accounts.find(a=>a.id===batch.account_id);
      const known=new Set(rows.filter(row=>posted.has(`${batch.account_id}:${row.fingerprint}`)).map(row=>row.fingerprint));
      const summary=statementReconciliationSummary(batch,rows,known,account,transactions);
      const evidence=account?await statementEvidence(batch,account,transactions):null;
      const saved=account&&evidence?accountStatementStatus(account,[evidence],transactions,preferences,new Date().toISOString().slice(0,10)):null;
      return {batch,account:account?.name??'Account unavailable',...summary,status:saved?.reconciliation??'Requires Review'};
    }));setLines(next);
  };
  return <section className="mb-6 border-y py-4"><div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold">Reconciliation history</h2><Button size="sm" variant="outline" onClick={load}>{lines?'Refresh reconciliation':'Review reconciliation history'}</Button>{lines&&<Button size="sm" variant="ghost" onClick={()=>void exportFile({kind:'ledger_csv'},new Blob([toCsv({title:'Statement reconciliation history',headers:['Statement','Account','Currency','From','To','Status','Opening','Closing','Confirmed debits','Confirmed credits','Ledger closing difference','Unresolved rows'],rows:lines.map(l=>[l.batch.file_name,l.account,l.batch.currency,l.batch.period_from??'',l.batch.period_to??'',l.status,l.batch.opening_balance??'',l.batch.closing_balance??'',l.debits,l.credits,l.difference??'',l.unresolved])})],{type:'text/csv'}),'statement-reconciliation.csv')}>Export reconciliation</Button>}</div>{lines&&<ul className="divide-y">{lines.map(l=><li key={l.batch.id} className="py-3 text-sm"><p className="break-words font-medium">{l.batch.file_name} · {l.account}</p><p className={l.status==='Reconciled'?'text-success':'text-warning'}>{l.status}</p><p>{l.unresolved} unresolved rows{l.difference!==null?` · Ledger difference ${money(l.difference,l.batch.currency)}`:''}</p><Button size="sm" variant="ghost" onClick={()=>onOpen(l.batch.id)}>Open balance review</Button></li>)}</ul>}</section>;
}