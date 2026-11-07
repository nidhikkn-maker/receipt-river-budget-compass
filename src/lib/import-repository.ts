import { supabase } from '@/integrations/supabase/client';
import { shareInflight } from './request-dedupe';
import type { Json } from '@/integrations/supabase/types';
import type { ImportBatch, ImportRow, ImportRule, ImportProposal } from './historical-import';
import type { Account } from './ledger';
import type { Expense } from './expenses';
import type { StatementStatusEvidence } from './account-statement-status';
import { checkpointHash, checkpointSnapshot, type StatementCheckpoint } from './statement-checkpoint';
import { canonicalEvidence } from './statement-evidence';

export async function statementEvidence(batch:ImportBatch,account:Account,transactions:Expense[]):Promise<StatementStatusEvidence> {
  const rows=await listImportRows(batch.id),posted:StatementStatusEvidence['posted']=[];
  for(let from=0;;from+=1000) {
    const r=await supabase.from('import_posts').select('fingerprint,transaction_id,posted_at').eq('account_id',batch.account_id).order('fingerprint').range(from,from+999);
    if(r.error)throw Error('Posting evidence unavailable');posted.push(...r.data);if(r.data.length<1000)break;
  }
  const checkpoint=await supabase.from('statement_checkpoints').select('*').eq('batch_id',batch.id).order('created_at',{ascending:false}).order('id').limit(1).maybeSingle();
  if(checkpoint.error)throw Error('Saved reconciliation evidence unavailable');
  const evidence:StatementStatusEvidence={batch,rows,posted,...(checkpoint.data?{checkpoint:checkpoint.data as unknown as StatementCheckpoint}:{})};
  const snapshot=checkpointSnapshot(evidence,account,transactions);evidence.snapshotKey=canonicalEvidence(snapshot);evidence.currentHash=await checkpointHash(snapshot);return evidence;
}

export function listImports(): Promise<ImportBatch[]> { return shareInflight('import_batches', readImports); }
async function readImports(): Promise<ImportBatch[]> {
  const batches: ImportBatch[] = [];
  for(let from=0;;from+=1000) {
    const r=await supabase.from('import_batches').select('*').order('created_at',{ascending:false}).order('id').range(from,from+999);
    if(r.error) throw Error('Could not load statement imports');
    batches.push(...r.data as unknown as ImportBatch[]); if(r.data.length<1000) break;
  }
  return batches;
}
export async function listImportRows(batch:string):Promise<ImportRow[]> {
  const rows:ImportRow[]=[];
  for(let from=0;;from+=1000) {
    const r=await supabase.from('import_rows').select('*').eq('batch_id',batch).order('id').range(from,from+999);
    if(r.error) throw Error('Could not load extracted transactions');
    rows.push(...r.data as unknown as ImportRow[]); if(r.data.length<1000) break;
  }
  return rows;
}
export function listImportRules():Promise<ImportRule[]> {
  return shareInflight('import_rules', async () => {
    const r=await supabase.from('import_rules').select('*').order('created_at');
    if(r.error) throw Error('Could not load import rules'); return r.data as unknown as ImportRule[];
  });
}
export async function reviseRows(batch:string,rows:ImportRow[],patch:Partial<ImportProposal>,decision?:ImportRow['decision']) {
  const fields=new Set(['title','merchant','category','scope','memberId','paymentMethod','txnType','accountId','toAccountId','description','tags','reviewed','categoryConfirmed','duplicateOverride','reimbursable','organisation','subcategory','reimbursementOrganisation']);
  const classification=Object.fromEntries(Object.entries(patch).filter(([key])=>fields.has(key)));
  const r=await supabase.rpc('revise_import_rows',{
    _batch:batch,
    _items:rows.map(row=>({id:row.id,proposal:row.proposal,decision:row.decision})) as unknown as Json,
    _patch:classification as unknown as Json,
    ... (decision ? {_decision:decision} : {}),
  });
  if(r.error) throw Error(r.error.message);
  return r.data;
}