import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { ImportBatch, ImportRow, ImportRule, ImportProposal } from './historical-import';

export async function listImports(): Promise<ImportBatch[]> {
  const r=await supabase.from('import_batches').select('*').order('created_at',{ascending:false});
  if(r.error) throw Error('Could not load statement imports');
  return r.data as unknown as ImportBatch[];
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
export async function listImportRules():Promise<ImportRule[]> {
  const r=await supabase.from('import_rules').select('*').order('created_at');
  if(r.error) throw Error('Could not load import rules'); return r.data as unknown as ImportRule[];
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