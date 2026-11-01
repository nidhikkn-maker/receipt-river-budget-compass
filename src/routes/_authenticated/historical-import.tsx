import { confirmAction } from "@/lib/confirm";
import { createFileRoute, Link } from '@tanstack/react-router';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PageTitle } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { ImportUploadManifest, type StatementUpload } from '@/components/ImportUploadManifest';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ReadinessBadge } from '@/components/StatementReconciliationSummary';
import { isLiability } from '@/lib/ledger';
import { money } from '@/lib/expenses';
import { ImportReview } from '@/components/ImportReview';
import { ImportReconciliationHistory } from '@/components/ImportReconciliationHistory';
import { ProcessingPanel, stagesAt } from '@/components/ProcessingPanel';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/lib/store';
import { listImports, listImportRows } from '@/lib/import-repository';
import { processHistoricalImport, resumeHistoricalImport } from '@/lib/historical-import.functions';
import { overlappingStatements } from '@/lib/import-manifest';
import { reconciliationReadiness, coverageMonths, type ImportRow } from '@/lib/historical-import';
import { CURRENCIES } from '@/lib/expenses';
import { importBatchSearch } from '@/lib/import-inbox';

const importsQuery=queryOptions({queryKey:['historical-imports'],queryFn:listImports,refetchInterval:5000});
export const Route=createFileRoute('/_authenticated/historical-import')({
  validateSearch:importBatchSearch,
  head:()=>({meta:[{title:'Historical statement imports — Ledgerline'},{name:'description',content:'Review grouped historical statement transactions, apply classifications and reconcile records from April 2026.'},{property:'og:title',content:'Historical statement imports — Ledgerline'},{property:'og:description',content:'Secure historical statement review, classification and reconciliation.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),
  loader:({context})=>context.queryClient.ensureQueryData(importsQuery),component:HistoricalImports,
});

function HistoricalImports() {
  const search=Route.useSearch();
  const {data:batches,refetch}=useSuspenseQuery(importsQuery);
  const {accounts,userId,refresh}=useStore();
  const process=useServerFn(processHistoricalImport);
  const resume=useServerFn(resumeHistoricalImport);
  const [account,setAccount]=useState(''),[currency,setCurrency]=useState('INR'),[current,setCurrent]=useState<string|null>(search.batch??null),[rows,setRows]=useState<ImportRow[]>([]),[posted,setPosted]=useState<Set<string>>(new Set()),[stage,setStage]=useState<{name:string;at:number}|null>(null);
  const revision=useRef(0);
  const batch=batches.find(b=>b.id===current);
  const reload=async(id=current)=>{
    const latest=await refetch(); if(!id)return;
    const version=++revision.current;const nextRows=await listImportRows(id);
    const b=latest.data?.find(x=>x.id===id);const known=new Set<string>();
    if(b)for(let from=0;;from+=1000){const r=await supabase.from('import_posts').select('fingerprint').eq('account_id',b.account_id).range(from,from+999);if(r.error)throw Error('Could not check posted transactions');r.data.forEach(p=>known.add(p.fingerprint));if(r.data.length<1000)break;}
    if(version!==revision.current)return;setRows(nextRows);setPosted(known);
  };
  useEffect(()=>{if(search.batch)setCurrent(search.batch);},[search.batch]);
  useEffect(()=>{
    if(!current)return;
    setRows([]);setPosted(new Set());
    void reload(current).catch(error=>toast.error(error.message));
    const timer=['queued','processing'].includes(batch?.status??'')?window.setInterval(()=>{if(document.visibilityState==='visible')void reload(current).catch(error=>toast.error(error.message));},5000):null;
    return ()=>{revision.current++;if(timer!==null)window.clearInterval(timer);};
  },[current,batch?.status,batch?.next_page]);
  const upload=async(files:StatementUpload[])=>{
    const completed=new Set<string>();
    const hasPdf=files.some(item=>/\.pdf$/i.test(item.file.name));
    const pdfConsent=!hasPdf||await confirmAction({title:'Read PDF statements with AI?',message:'PDF statements may contain private financial information. AI reading uses workspace credits. Every extracted row stays in review until you confirm it.',confirmLabel:'Allow and process',cancelLabel:'Cancel'});
    if(!pdfConsent){toast.info('Nothing was uploaded. PDF statements need your permission to be read.');return completed;}
    for(const item of files) {
      const {file,accountId:account,currency}=item;
      let stored=false;const id=crypto.randomUUID(),path=`${userId}/statements/${id}-${file.name.replace(/[^\w.-]/g,'_')}`;
      setStage({name:file.name,at:0});
      try {
        if(file.size>15*1024*1024)throw Error('Each statement must be under 15 MB');
        const bytes=await file.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
        const exists=await supabase.from('import_batches').select('id,status').eq('account_id',account).eq('file_hash',hash).maybeSingle();
        if(exists.error)throw Error('Could not check for repeated statements');
        if(exists.data){setCurrent(exists.data.id);await reload(exists.data.id);completed.add(item.id);toast.info(['failed','paused'].includes(exists.data.status)?'This statement is already saved but incomplete. Use Retry processing; no second import was created.':'This statement is already saved. Review posted, duplicate and unresolved counts instead of uploading again.');continue;}
        const up=await supabase.storage.from('receipts').upload(path,file,{contentType:file.type || 'application/octet-stream'});if(up.error)throw Error('Could not upload original statement');
        const ins=await supabase.from('import_batches').insert({id,account_id:account,file_name:file.name,file_path:path,file_hash:hash,currency,allow_ai:/\.pdf$/i.test(file.name),period_from:item.from||null,period_to:item.to||null});if(ins.error)throw Error('Could not queue statement');stored=true;completed.add(item.id);
        const original=await supabase.from('documents').insert({owner_id:userId,title:file.name,doc_type:'statement',file_path:path,file_name:file.name,mime_type:file.type,size_bytes:file.size,account_id:account,currency,notes:'Historical import source statement'});
        if(original.error)throw Error('Statement saved for import but could not be added to the Vault');
        setStage({name:file.name,at:1});
        if(/\.pdf$/i.test(file.name)) {
          setStage({name:file.name,at:2});setCurrent(id);
          let status='queued';
          for(let i=0;i<40&&status==='queued';i++){await process({data:{id}});const st=await supabase.from('import_batches').select('status,error').eq('id',id).single();if(st.error)throw Error('Could not check statement progress');status=st.data.status;if(['failed','paused','refused'].includes(status))throw Error(st.data.error??'Statement reading stopped');await refetch();}
          if(status==='review'){await reload(id);toast.success(`${file.name} ready for review`);}else toast.info('Reading continues — the review opens here once all pages are read');
          continue;
        }
        setStage({name:file.name,at:2});await process({data:{id}});setCurrent(id);await refetch();setRows(await listImportRows(id));const known=await supabase.from('import_posts').select('fingerprint').eq('account_id',account);if(known.error)throw Error('Could not check posted rows');setPosted(new Set(known.data.map(r=>r.fingerprint)));toast.success(`${file.name} ready for review`);
      }catch(e){const message=e instanceof Error?e.message:'Could not upload statement';if(stored)await supabase.from('import_batches').update({status:'failed',error:message}).eq('id',id);else await supabase.storage.from('receipts').remove([path]);toast.error(message);}
    }
    setStage(null);await refetch(); await refresh();return completed;
  };
  const today=new Date().toISOString().slice(0,10);
  return <>
    <PageTitle eyebrow="Statements" title="Historical import" sub="Records from 1 April 2026"/>
    <ol aria-label="Import stages" className="mb-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"><li>1 · Upload</li><li>2 · Review groups</li><li>3 · Confirm import</li><li>4 · Reconcile</li></ol>
    <div className="mb-6 flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/wealth">Configure accounts & opening balances</Link></Button><Button asChild variant="ghost"><Link to="/inbox" search={{ section: "statements" }}>Statement matching</Link></Button></div>
    <section className="mb-6 border-y py-5 space-y-3">
      <h2 className="text-lg font-semibold">Upload statements</h2>
      <div className="flex flex-wrap gap-3"><Select value={account} onValueChange={setAccount}><SelectTrigger className="w-full sm:w-60" aria-label="Historical statement account"><SelectValue placeholder="Confirm account or card"/></SelectTrigger><SelectContent>{accounts.filter(a=>!a.archived).map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><Select value={currency} onValueChange={setCurrency}><SelectTrigger className="w-28" aria-label="Historical statement currency"><SelectValue/></SelectTrigger><SelectContent>{CURRENCIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
      <ImportUploadManifest defaultAccount={account} defaultCurrency={currency} busy={!!stage} onUpload={upload}/>
      {stage&&<ProcessingPanel title={stage.name} stages={stagesAt(['Uploading original statement','Extracting transactions','Finding duplicates and suggesting classifications','Ready for review'],stage.at)}/>}
    </section>
    <section className="mb-6"><h2 className="text-lg font-semibold mb-3">Import coverage</h2><ul className="divide-y">{accounts.filter(a=>!a.archived).map(a=>{const coverage=coverageMonths(batches.filter(b=>b.account_id===a.id&&b.status==='review'),today);return <li key={a.id} className="py-3 text-sm"><span className="font-medium">{a.name}</span> · {coverage.covered.length} months represented<p className="text-xs text-warning">{coverage.missing.length?`Missing statement months: ${coverage.missing.join(', ')}`:'All months represented — verify full statement periods and reconciliation'}</p></li>;})}</ul></section>
    {overlappingStatements(batches).length>0&&<section className="mb-6 border-y py-4"><h2 className="mb-3 text-lg font-semibold">Overlapping statement periods</h2><ul className="space-y-2">{overlappingStatements(batches).map(({first,second})=><li key={`${first.id}-${second.id}`} className="text-sm break-words text-warning">{first.file_name} · {second.file_name}<Button size="sm" variant="ghost" onClick={async()=>{setCurrent(second.id);await reload(second.id);}}>Review overlap</Button></li>)}</ul></section>}
    <section className="mb-6"><h2 className="text-lg font-semibold mb-3">Saved statements</h2><ul className="divide-y">{batches.map(b=><li key={b.id} className="py-3 flex flex-wrap gap-2 items-center"><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{b.file_name}</p><p className="text-xs text-muted-foreground">{accounts.find(a=>a.id===b.account_id)?.name} · {b.status} · {b.period_from ?? 'Period not confirmed'}{b.period_to?` to ${b.period_to}`:''}</p>{b.total_pages!=null&&<p className="text-xs text-muted-foreground">{b.next_page??0} of {b.total_pages} pages extracted</p>}{(()=>{const acc=accounts.find(a=>a.id===b.account_id);return <ReadinessBadge r={reconciliationReadiness(b,b.id===current&&rows.length?rows:null,posted,acc?isLiability(acc.kind):false,n=>money(n,b.currency))}/>;})()}</div><Button size="sm" variant={current===b.id?'default':'outline'} onClick={async()=>{setCurrent(b.id);await reload(b.id);setTimeout(()=>document.getElementById('statement-review')?.scrollIntoView({behavior:'smooth',block:'start'}),50);}}>{b.status==='review'?'Continue review':'Open review'}</Button>{['failed','paused'].includes(b.status)&&<Button size="sm" variant="outline" onClick={async()=>{await resume({data:{id:b.id}});if(!b.allow_ai)await process({data:{id:b.id}});await reload(b.id);}}>Retry processing</Button>}</li>)}</ul>{!batches.length&&<p className="text-sm text-muted-foreground">No statements uploaded yet.</p>}</section>
    <ImportReconciliationHistory batches={batches} onOpen={async id=>{setCurrent(id);await reload(id);}}/>
    {batch&&<section id="statement-review" className="scroll-mt-4 border-t pt-6"><h2 className="mb-4 text-xl font-semibold break-words">{batch.file_name}</h2><ImportReview key={batch.id} batch={batch} rows={rows} posted={posted} onReload={()=>reload()}/></section>}
  </>;
}