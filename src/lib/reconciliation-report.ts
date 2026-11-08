import type { Report } from './reports';
import type { Expense } from './expenses';
import type { accountStatementStatus, StatementStatusEvidence } from './account-statement-status';
type Status=ReturnType<typeof accountStatementStatus>;
/** Export existing saved checks, never infer approval or verify a balance from matching alone. */
export function reconciliationReport(rows:Status[], evidence:StatementStatusEvidence[], transactions:Expense[]):Report {
 return {title:'Account reconciliation evidence',headers:['Account','Account ID','Period from','Period to','Reconciliation','Balance status','Verified closing (INR)','Difference (INR)','Unresolved','Check recorded','Statement batch','Source file','Source document/path','Source reference','Linked ledger IDs','Outstanding checks'],rows:rows.map(r=>{
  const source=evidence.find(e=>e.batch.id===r.batchId);
  const ids=source?[...new Set([...source.posted.map(p=>p.transaction_id),...source.rows.filter(x=>x.duplicate_kind==='exact').flatMap(x=>x.duplicate_id?[x.duplicate_id]:[])])]:transactions.filter(t=>(t.accountId===r.accountId||t.toAccountId===r.accountId)&&t.statementRef).map(t=>t.id);
  return [r.name,r.accountId,r.periodFrom??'',r.periodTo??'',r.reconciliation,r.balance,r.confirmedBalance==null?'':r.confirmedBalance.toFixed(2),r.difference==null?'':r.difference.toFixed(2),r.unresolved,r.reconciliationDate??'',r.batchId??'',source?.batch.file_name??'',source?.batch.file_path??'',source?.batch.balance_verification?.sourceReference??'',ids.join('; '),r.missing.join('; ')];
 })};
}