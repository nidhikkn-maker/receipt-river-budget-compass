import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import type { FinancialReview } from '@/lib/financial-review';
import { metadataPreview, metadataStillCurrent, type MetadataPatch, type MetadataPreview } from '@/lib/review-metadata';
import { verifiedRecovery } from '@/lib/review-recovery';
import { money, SCOPE_LABEL, type Scope } from '@/lib/expenses';
import { Button } from './ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { Undo2 } from 'lucide-react';
export function ReviewMetadataPanel({rows,onSaved}:{rows:FinancialReview[];onSaved:(excluded:string[])=>void}) {
 const store=useStore();
 const [mode,setMode]=useState('organisation'),[value,setValue]=useState(''),[error,setError]=useState('');
 const [preview,setPreview]=useState<MetadataPreview|null>(null),[restore,setRestore]=useState<string|null>(null);
 const [history,setHistory]=useState<{id:string;createdAt:string;entries:{before:Record<string,unknown>;after:Record<string,unknown>}[]}[]>([]);
 const id=useRef<string|null>(null);
 const load=async()=>{try {setHistory(await store.reviewMetadataHistory());}catch {setError('Mapping history could not load. Retry to check saved changes.');}};
 useEffect(()=>{void load();},[]);
 const options= mode==='organisation' ? store.preferences.tags.filter(t=>t.group==='Organisation').map(t=>[t.name,t.name]) : mode==='scope'?Object.entries(SCOPE_LABEL):mode==='paymentInstrumentId'?store.preferences.paymentInstruments.filter(p=>!p.archived).map(p=>[p.id,p.nickname]):mode==='category'?store.preferences.categories.filter(c=>!c.archived).map(c=>[c.name,c.name]):store.preferences.tags.filter(t=>['Project','Event','Purpose','Client'].includes(t.group)).map(t=>[`${t.group}: ${t.name}`,t.name]);
 const prepare=()=>{try {
  const patches=new Map<string,MetadataPatch>();
  for(const r of rows) {
   const e=r.transaction;
   if(mode==='suggested') {if(r.suggestedCategory&&(r.group==='ready'||r.group==='category')) patches.set(e.id,{category:r.suggestedCategory});}
   else if(mode==='recovery') {const recovery=verifiedRecovery(e,store.accounts,store.preferences);const patch:MetadataPatch={};if(!e.department&&recovery.organisation)patch.organisation=recovery.organisation;if(e.paymentInstrumentId&&recovery.paymentMethod&&e.paymentMethod!==recovery.paymentMethod)patch.paymentInstrumentId=e.paymentInstrumentId;patches.set(e.id,patch);}
   else {if(!value)throw Error('Choose a mapping value.');patches.set(e.id,{[mode]:value} as MetadataPatch);}
  }
  setPreview(metadataPreview(rows,patches,store.preferences,store.accounts));id.current=crypto.randomUUID();setError('');
 }catch(e){setError(e instanceof Error?e.message:'Unable to prepare mapping');}};
 const apply=async()=>{if(!preview||!id.current)return;try{
  if(!metadataStillCurrent(preview,store.transactions,store.preferences,store.accounts))throw Error('Records or configuration changed. Prepare a new preview.');
  await store.applyReviewMetadata(preview,id.current);setPreview(null);setError('');await load();onSaved(preview.excluded.map(e=>e.id));
 }catch(e){setError(e instanceof Error?e.message:'Unable to save mapping');}};
 const fields=['department','scope','category','payment_instrument_id','payment_method','tags'];
 return <div className="space-y-3">
 {!preview ? <><Select value={mode} onValueChange={v=>{setMode(v);setValue('');}}><SelectTrigger aria-label="Bulk mapping field"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="organisation">Organisation</SelectItem><SelectItem value="scope">Workspace</SelectItem><SelectItem value="paymentInstrumentId">Saved payment method</SelectItem><SelectItem value="category">Category</SelectItem><SelectItem value="tag">Project or activity</SelectItem><SelectItem value="suggested">Each verified category suggestion</SelectItem><SelectItem value="recovery">Available verified missing details</SelectItem></SelectContent></Select>
 {!['suggested','recovery'].includes(mode)&&<Select value={value} onValueChange={setValue}><SelectTrigger aria-label="Bulk mapping value"><SelectValue placeholder="Choose value"/></SelectTrigger><SelectContent>{options.map(([key,label])=><SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>}
 <Button onClick={prepare}>Preview bulk mapping</Button></> : <><h3 className="font-semibold">Confirm bulk mapping</h3><p className="text-sm">{preview.selected} selected · {preview.records.length} included · {preview.excluded.length} excluded</p><p className="text-sm text-muted-foreground">Account balances, total income and spending, original amounts, narration, exchange rates and statement matching stay unchanged. Category, workspace and organisation reports may change. Claims are not granted.</p>
 <ul className="max-h-64 divide-y overflow-y-auto text-sm">{preview.records.map((e,index)=>{const next=preview.after[index];return <li key={e.id} className="space-y-1 py-2"><p className="break-words font-medium">{e.title} · {money(e.amount)}</p>{next&&(['department','scope','category','paymentInstrumentId','paymentMethod','tags'] as const).filter(k=>JSON.stringify(e[k])!==JSON.stringify(next[k])).map(k=><p key={k} className="break-words text-xs">{k==='department'?'Organisation':k==='paymentInstrumentId'?'Saved payment method':k==='paymentMethod'?'Payment type':k==='scope'?'Workspace':k==='tags'?'Activity':'Category'}: {String(e[k]??'Unknown')} → {String(next[k])}</p>)}</li>;})}</ul>
 {!!preview.excluded.length&&<details><summary>Excluded transactions</summary><ul className="text-xs">{preview.excluded.map(e=><li key={e.id}>{e.title}: {e.reason}</li>)}</ul></details>}
 <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>{setPreview(null);setError('');}}>Cancel</Button><Button onClick={apply}>{error?'Unable to Save — Retry':'Confirm & Save Mapping'}</Button></div></>}
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 <Button size="sm" variant="ghost" onClick={load}>Refresh mapping history</Button>
 {!!history.length&&<details><summary>Saved mapping history ({history.length})</summary><ul className="divide-y">{history.map(h=><li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span>{h.createdAt.slice(0,10)} · {h.entries.length} transactions</span><Button size="sm" variant="outline" onClick={()=>setRestore(h.id)}><Undo2/>Review undo</Button></li>)}</ul></details>}
 {restore&&<div className="space-y-2 border-t pt-2"><h3 className="font-semibold">Confirm mapping restoration</h3><p className="text-xs text-muted-foreground">Any later transaction edit blocks the entire restoration.</p><ul className="max-h-48 overflow-y-auto text-xs">{history.find(h=>h.id===restore)?.entries.map((e,i)=><li key={i} className="py-2"><strong>{String(e.before.title)}</strong>{fields.filter(k=>JSON.stringify(e.before[k])!==JSON.stringify(e.after[k])).map(k=><p key={k}>{k.replaceAll('_',' ')}: {String(e.after[k]??'Unknown')} → {String(e.before[k]??'Unknown')}</p>)}</li>)}</ul><Button variant="outline" onClick={()=>setRestore(null)}>Cancel</Button><Button onClick={async()=>{try{await store.undoReviewMetadata(restore);setRestore(null);setError('');await load();}catch(e){setError(e instanceof Error?e.message:'Unable to restore mapping');}}}>Confirm undo mapping</Button></div>}
 </div>;
}