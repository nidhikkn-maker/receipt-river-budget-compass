import { createFileRoute, Link } from '@tanstack/react-router';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { PageTitle } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImportReview } from '@/components/ImportReview';
import { ProcessingPanel, stagesAt } from '@/components/ProcessingPanel';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/lib/store';
import { listImports, listImportRows } from '@/lib/import-repository';
import { processHistoricalImport } from '@/lib/historical-import.functions';
import { readStatement } from '@/lib/statement-import';
import { coverageMonths, type ImportRow } from '@/lib/historical-import';
import { CURRENCIES } from '@/lib/expenses';
import type { Json } from '@/integrations/supabase/types';

const importsQuery=queryOptions({queryKey:['historical-imports'],queryFn:listImports});
export const Route=createFileRoute('/_authenticated/historical-import')({
  head:()=>({meta:[{title:'Historical statement imports — Ledgerline'},{name:'description',content:'Review grouped historical statement transactions, apply classifications and reconcile records from April 2026.'},{property:'og:title',content:'Historical statement imports — Ledgerline'},{property:'og:description',content:'Secure historical statement review, classification and reconciliation.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),
  loader:({context})=>context.queryClient.ensureQueryData(importsQuery),component:HistoricalImports,
});

function HistoricalImports() {
  const {data:batches,refetch}=useSuspenseQuery(importsQuery);
  const {accounts,userId,refresh}=useStore();
  const process=useServerFn(processHistoricalImport);
  const [account,setAccount]=useState(''),[currency,setCurrency]=useState('INR'),[current,setCurrent]=useState<string|null>(null),[rows,setRows]=useState<ImportRow[]>([]),[posted,setPosted]=useState<Set<string>>(new Set()),[stage,setStage]=useState<{name:string;at:number}|null>(null);
  const batch=batches.find(b=>b.id===current);
  const reload=async(id=current)=>{
    await refetch(); if(!id)return;
    setRows(await listImportRows(id));
    const b=batches.find(x=>x.id===id);const known=new Set<string>();
    if(b)for(let from=0;;from+=1000){const r=await supabase.from('import_posts').select('fingerprint').eq('account_id',b.account_id).range(from,from+999);if(r.error)throw Error('Could not check posted transactions');r.data.forEach(p=>known.add(p.fingerprint));if(r.data.length<1000)break;}
    setPosted(known);
  };
  const upload=async(files:FileList|null)=>{
    if(!files?.length)return; if(!account)throw Error('Confirm the statement account first');
    for(const file of Array.from(files)) {
      let stored=false;const id=crypto.randomUUID(),path=`${userId}/statements/${id}-${file.name.replace(/[^\w.-]/g,'_')}`;
      setStage({name:file.name,at:0});
      try {
        if(file.size>15*1024*1024)throw Error('Each statement must be under 15 MB');
        const bytes=await file.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
        const exists=await supabase.from('import_batches').select('id').eq('account_id',account).eq('file_hash',hash).maybeSingle();
        if(exists.error)throw Error('Could not check for repeated statements');
        if(exists.data){setCurrent(exists.data.id);await reload(exists.data.id);toast.info('This statement is already saved');continue;}
        const up=await supabase.storage.from('receipts').upload(path,file,{contentType:file.type || 'application/octet-stream'});if(up.error)throw Error('Could not upload original statement');
        const ins=await supabase.from('import_batches').insert({id,account_id:account,file_name:file.name,file_path:path,file_hash:hash,currency});if(ins.error)throw Error('Could not queue statement');stored=true;
        setStage({name:file.name,at:1});
        if(/\.pdf$/i.test(file.name)) {
          // Text PDF extraction depends on browser PDF worker; save results before classification.
          const parsed=await readStatement(file);
          const saved=await supabase.from('import_batches').update({raw_lines:parsed as unknown as Json}).eq('id',id);
          if(saved.error)throw Error('Could not save PDF extraction');
        }
        setStage({name:file.name,at:2});await process({data:{id}});setCurrent(id);await refetch();setRows(await listImportRows(id));setPosted(new Set());toast.success(`${file.name} ready for review`);
      }catch(e){const message=e instanceof Error?e.message:'Could not upload statement';if(stored)await supabase.from('import_batches').update({status:'failed',error:message}).eq('id',id);else await supabase.storage.from('receipts').remove([path]);toast.error(message);}finally{setStage(null);}
    }
    await refetch(); await refresh();
  };
  const today=new Date().toISOString().slice(0,10);
  return <>
    <PageTitle eyebrow="Statements" title="Historical import" sub="Records from 1 April 2026"/>
    <div className="mb-6 flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/wealth">Configure accounts & opening balances</Link></Button><Button asChild variant="ghost"><Link to="/reconcile">Statement matching</Link></Button></div>
    <section className="mb-6 border-y py-5 space-y-3">
      <h2 className="text-lg font-semibold">Upload statements</h2>
      <div className="flex flex-wrap gap-3"><Select value={account} onValueChange={setAccount}><SelectTrigger className="w-full sm:w-60" aria-label="Historical statement account"><SelectValue placeholder="Confirm account or card"/></SelectTrigger><SelectContent>{accounts.filter(a=>!a.archived).map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><Select value={currency} onValueChange={setCurrency}><SelectTrigger className="w-28" aria-label="Historical statement currency"><SelectValue/></SelectTrigger><SelectContent>{CURRENCIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
      <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer text-primary"><Upload className="h-4 w-4"/>Choose statements<input type="file" multiple disabled={!!stage||!account} accept=".csv,.xls,.xlsx,.pdf" className="sr-only" aria-label="Historical statement files" onChange={e=>{void upload(e.target.files).catch(error=>toast.error(error.message));e.target.value='';}}/></label>
      {stage&&<ProcessingPanel title={stage.name} stages={stagesAt(['Uploading original statement','Extracting transactions','Finding duplicates and suggesting classifications','Ready for review'],stage.at)}/>}
    </section>
    <section className="mb-6"><h2 className="text-lg font-semibold mb-3">Import coverage</h2><ul className="divide-y">{accounts.filter(a=>!a.archived).map(a=>{const coverage=coverageMonths(batches.filter(b=>b.account_id===a.id&&b.status==='review'),today);return <li key={a.id} className="py-3 text-sm"><span className="font-medium">{a.name}</span> · {coverage.covered.length} months represented<p className="text-xs text-warning">{coverage.missing.length?`Missing statement months: ${coverage.missing.join(', ')}`:'All months represented — verify full statement periods and reconciliation'}</p></li>;})}</ul></section>
    <section className="mb-6"><h2 className="text-lg font-semibold mb-3">Saved statements</h2><ul className="divide-y">{batches.map(b=><li key={b.id} className="py-3 flex flex-wrap gap-2 items-center"><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{b.file_name}</p><p className="text-xs text-muted-foreground">{accounts.find(a=>a.id===b.account_id)?.name} · {b.status} · {b.period_from ?? 'Period not confirmed'}{b.period_to?` to ${b.period_to}`:''}</p>{b.error&&<p className="text-xs text-destructive">{b.error}</p>}</div><Button size="sm" variant={current===b.id?'default':'outline'} onClick={async()=>{setCurrent(b.id);await reload(b.id);}}>Open review</Button>{b.status!=='review'&&<Button size="sm" variant="outline" onClick={async()=>{await supabase.from('import_batches').update({status:'queued',attempts:0,error:null}).eq('id',b.id);await process({data:{id:b.id}});await reload(b.id);}}>Retry processing</Button>}</li>)}</ul>{!batches.length&&<p className="text-sm text-muted-foreground">No statements uploaded yet.</p>}</section>
    {batch&&<section className="border-t pt-6"><h2 className="mb-4 text-xl font-semibold break-words">{batch.file_name}</h2><ImportReview key={batch.id} batch={batch} rows={rows} posted={posted} onReload={()=>reload()}/></section>}
  </>;
}