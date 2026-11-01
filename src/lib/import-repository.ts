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
export async function reviseRows(batch:string,ids:string[],patch:Partial<ImportProposal>,decision?:ImportRow['decision']) {
  const current=(await listImportRows(batch)).filter(r=>ids.includes(r.id));
  const r=await supabase.from('import_rows').upsert(current.map(row=>({id:row.id,batch_id:batch,fingerprint:row.fingerprint,line:row.line as unknown as Json,proposal:{...row.proposal,...patch} as unknown as Json,review_group:row.review_group,confidence:row.confidence,duplicate_kind:row.duplicate_kind,duplicate_id:row.duplicate_id,decision:decision ?? row.decision,updated_at:new Date().toISOString()})));
  if(r.error) throw Error('Could not save review changes');
  const audit=await supabase.from('import_audit').insert({batch_id:batch,action:decision ?? 'classification',details:{ids,patch} as unknown as Json});
  if(audit.error) throw Error('Changes saved but audit could not be recorded');
}