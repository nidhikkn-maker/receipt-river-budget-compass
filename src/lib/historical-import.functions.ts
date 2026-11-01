import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { enrichedInput, postingBlockers, type ImportRow } from './historical-import';
import type { Account } from './ledger';
import type { Json } from '@/integrations/supabase/types';

export const processHistoricalImport=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({id:z.string().uuid()}).parse(d)).handler(async({data,context})=>{
  const b=await context.supabase.from('import_batches').select('id,status').eq('id',data.id).eq('owner_id',context.userId).single();
  if(b.error) throw Error('Import not found');
  if(b.data.status==='processing') return {ok:true};
  const update=await context.supabase.from('import_batches').update({status:'processing',lease_until:new Date(Date.now()+300000).toISOString()}).eq('id',data.id).eq('owner_id',context.userId);
  if(update.error) throw Error('Could not start import');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {processImport}=await import('./import-jobs.server');
  await processImport(supabaseAdmin,data.id,context.userId);
  return {ok:true};
});

export const postHistoricalImport=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({batch:z.string().uuid(),ids:z.array(z.string().uuid()).min(1).max(100)}).parse(d)).handler(async({data,context})=>{
  const db=context.supabase;
  const [batch,rows,accounts]=await Promise.all([
    db.from('import_batches').select('*').eq('id',data.batch).eq('owner_id',context.userId).single(),
    db.from('import_rows').select('*').eq('batch_id',data.batch).eq('owner_id',context.userId).in('id',data.ids),
    db.from('accounts').select('*').eq('owner_id',context.userId),
  ]);
  if(batch.error || rows.error || accounts.error || rows.data.length!==new Set(data.ids).size) throw Error('Could not read the selected import');
  const accs=accounts.data.map(a=>({id:a.id,name:a.name,kind:a.kind,openingBalance:Number(a.opening_balance),archived:a.archived})) as Account[];
  const converted: {id:string;rate:number;homeAmount:number;fxDate:string}[]=[];
  const rates=new Map<string,{rate:number;date:string}>();
  for(const raw of rows.data) {
    const row=raw as unknown as ImportRow;
    if(row.decision!=='approved') throw Error('Approve selected rows first');
    const blockers=postingBlockers(row,accs,new Date().toISOString().slice(0,10));
    if(blockers.length) throw Error(blockers[0]);
    let fx=rates.get(row.proposal.date);
    if(!fx) {
      fx={rate:1,date:row.proposal.date};
      if(batch.data.currency!=='INR') {
        const res=await fetch(`https://api.frankfurter.dev/v1/${row.proposal.date}?from=${encodeURIComponent(batch.data.currency)}&to=INR`);
        if(!res.ok) throw Error('Currency conversion unavailable; nothing was posted');
        const json=await res.json() as {date:string;rates:Record<string,number>};
        const rate=json.rates['INR']; if(!rate || rate<=0) throw Error('Currency conversion unavailable');
        fx={rate,date:json.date};
      }
      rates.set(row.proposal.date,fx);
    }
    const proposal=enrichedInput(row.proposal);
    const changed=await db.from('import_rows').update({proposal:{...row.proposal,...proposal} as unknown as Json}).eq('id',row.id).eq('owner_id',context.userId);
    if(changed.error) throw Error('Could not save classifications');
    converted.push({id:row.id,rate:fx.rate,homeAmount:Math.round(row.proposal.amount*fx.rate*100)/100,fxDate:fx.date});
  }
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const posted=await supabaseAdmin.rpc('post_import_rows_secure',{_owner:context.userId,_batch:data.batch,_rows:converted as unknown as Json});
  if(posted.error) throw Error(posted.error.message);
  return {count:posted.data};
});