import { HistoricalBalanceVerification } from './HistoricalBalanceVerification';
import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { useStore } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';
import { SCOPES, SCOPE_LABEL, money, type Scope } from '@/lib/expenses';
import { TXN_LABEL, TXN_TYPES, isLiability, balanceAsOf } from '@/lib/ledger';
import { classificationStatus, mergeImportPatch, importSelectionSummary, REVIEW_GROUPS, merchantFamily, postingBlockers, orientStatementMove, reconcileStatement, type ImportRow, type ImportBatch, type ImportProposal } from '@/lib/historical-import';
import { reviseRows } from '@/lib/import-repository';
import { postHistoricalImport } from '@/lib/historical-import.functions';
import { downloadBlob, toCsv } from '@/lib/reports';
import { tripTag } from '@/lib/intelligence';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

export function ImportReview({batch,rows,posted,onReload}:{batch:ImportBatch;rows:ImportRow[];posted:Set<string>;onReload:()=>Promise<void>}) {
  const {accounts,preferences,members,transactions,refresh}=useStore();
  const post=useServerFn(postHistoricalImport);
  const [group,setGroup]=useState('All'),[merchant,setMerchant]=useState('All'),[selected,setSelected]=useState<Set<string>>(new Set()),[patch,setPatch]=useState<Partial<ImportProposal>>({}),[from,setFrom]=useState(''),[to,setTo]=useState(''),[expanded,setExpanded]=useState<string|null>(null);
  const [search,setSearch]=useState(''),[view,setView]=useState<'overview'|'groups'|'transactions'>('overview');
  const [preview,setPreview]=useState<{rows:ImportRow[];patch:Partial<ImportProposal>;decision?:ImportRow['decision']}|null>(null),[final,setFinal]=useState(false);
  const currentPosted=new Set(rows.filter(r=>posted.has(r.fingerprint)).map(r=>r.fingerprint));
  const active=rows.filter(r=>!posted.has(r.fingerprint));
  const visible=active.filter(r=>(group==='All'||r.review_group===group)&&(merchant==='All'||merchantFamily(r.line.description)===merchant)&&(!from||r.line.date>=from)&&(!to||r.line.date<=to)&&`${r.proposal.title} ${r.line.description} ${r.proposal.category}`.toLowerCase().includes(search.toLowerCase()));
  const merchants=useMemo(()=>[...new Set(active.map(r=>merchantFamily(r.line.description)))].sort(),[rows,posted]);
  const picked=active.filter(r=>selected.has(r.id)), today=new Date().toISOString().slice(0,10);
  const summary=importSelectionSummary(picked,accounts,today);
  const apply=(decision?:ImportRow['decision'])=>{
    if(!picked.length)return;
    // Uncertain rows need an individual final decision or an explicit replacement category.
    const eligible=picked.filter(r=>decision!=='approved'||classificationStatus(r)!=='Needs review'||!!patch.category||r.proposal.reviewed);
    if(!eligible.length){toast.error('Review uncertain classifications individually or choose a final category');return;}
    const changed={...patch,...(patch.category?{categoryConfirmed:true}:{}),...(decision==='approved'?{reviewed:true}:{})};
    setPreview({rows:eligible,patch:changed,...(decision?{decision}:{})});
  };
  const savePreview=async()=>{
    if(!preview)return;
    if(preview.decision==='approved') {
      const blocked=preview.rows.find(r=>postingBlockers({...r,proposal:mergeImportPatch(r.proposal,preview.patch)},accounts,today).length);
      if(blocked)throw Error(`${blocked.proposal.title}: ${postingBlockers({...blocked,proposal:mergeImportPatch(blocked.proposal,preview.patch)},accounts,today)[0]}`);
    }
    const count=await reviseRows(batch.id,preview.rows,preview.patch,preview.decision);await onReload();setPreview(null);setPatch({});toast.success(`${count} updated`);
  };
  const confirm=async()=>{
    if(!summary.eligible.length)return;
    let count=0;
    try {
      for(let i=0;i<summary.eligible.length;i+=100)count+=(await post({data:{batch:batch.id,ids:summary.eligible.slice(i,i+100).map(r=>r.id)}})).count;
      toast.success(`${count} imported · ${summary.selected-summary.eligible.length} left for review`);setFinal(false);setSelected(new Set());
    } catch(error) {toast.error(`${count} imported before interruption. Remaining records are saved for retry.`);throw error;}
    finally {await onReload();await refresh();}
  };
  const selectRows=(items:ImportRow[])=>setSelected(s=>new Set([...s,...items.filter(r=>r.duplicate_kind!=='exact'&&r.decision!=='excluded').map(r=>r.id)]));
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center gap-2"><Button variant="outline" onClick={async()=>{const result=await supabase.storage.from('receipts').createSignedUrl(batch.file_path,60);if(result.error)throw Error('Original unavailable');window.open(result.data.signedUrl,'_blank','noopener,noreferrer');}}>Original statement</Button><Button variant="ghost" onClick={()=>downloadBlob(new Blob([toCsv({title:'Import audit',headers:['Date','Description','Reference','Amount','Direction','Category','Workspace','Decision','Duplicate'],rows:rows.map(r=>[r.line.date,r.line.description,r.line.ref,r.line.amount,r.line.direction ?? 'debit',r.proposal.category,r.proposal.scope,posted.has(r.fingerprint)?'posted':r.decision,r.duplicate_kind])})],{type:'text/csv'}),`import-audit-${batch.id}.csv`)}>Export review audit</Button><Button asChild variant="ghost"><Link to="/settings" hash="import-rules">Import rules</Link></Button></div>
    <div className="flex gap-2 border-b pb-3">{(['overview','groups','transactions'] as const).map(v=><Button key={v} size="sm" variant={view===v?'default':'ghost'} onClick={()=>setView(v)}>{v==='overview'?'Overview':v==='groups'?'Groups':'Transactions'}</Button>)}</div>
    {view==='overview'&&<><div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{[['Extracted',rows.length],['Verified',active.filter(r=>classificationStatus(r)==='Verified').length],['Suggested',active.filter(r=>classificationStatus(r)==='Suggested').length],['Needs review',active.filter(r=>classificationStatus(r)==='Needs review').length],['Duplicates',active.filter(r=>r.duplicate_kind!=='new').length],['Already recorded',currentPosted.size]].map(([label,count])=><div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{count}</p></div>)}</div><p className="text-sm text-muted-foreground">{accounts.find(a=>a.id===batch.account_id)?.name} · {batch.period_from ?? 'Period not confirmed'} {batch.period_to?`– ${batch.period_to}`:''}</p><Button onClick={()=>setView('groups')}>Review transaction groups</Button></>}
    {view!=='overview'&&<>
    <Input aria-label="Search imported transactions" placeholder="Search merchant or classification" value={search} onChange={e=>setSearch(e.target.value)}/>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{REVIEW_GROUPS.map(g=><Button key={g} variant={group===g?'default':'outline'} className="h-auto min-h-12 whitespace-normal justify-between text-left text-xs" onClick={()=>setGroup(group===g?'All':g)}><span>{g}</span><span className="ml-2">{active.filter(r=>r.review_group===g).length}</span></Button>)}</div>
    <div className="grid grid-cols-2 gap-2"><Select value={merchant} onValueChange={setMerchant}><SelectTrigger className="col-span-2" aria-label="Merchant group"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="All">All merchants</SelectItem>{merchants.map(m=><SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select><Input className="min-w-0" type="date" aria-label="Review from date" value={from} onChange={e=>setFrom(e.target.value)}/><Input className="min-w-0" type="date" aria-label="Review to date" value={to} onChange={e=>setTo(e.target.value)}/></div>
    <div className="border-y py-3 space-y-3">
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>selectRows(visible)}>Select all matching filters</Button><Button size="sm" variant="outline" onClick={()=>selectRows(visible.slice(0,50))}>Select visible</Button><Button size="sm" variant="ghost" onClick={()=>setSelected(new Set())}>Cancel selection</Button><span className="self-center text-sm">{picked.length} selected</span></div>
      {picked.length>0&&<><ClassificationFields patch={patch} setPatch={setPatch}/><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>apply()}>Preview classification</Button><Button variant="outline" onClick={()=>apply('excluded')}>Exclude selected</Button><Button onClick={()=>apply('approved')}>Confirm classifications</Button></div><label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={!!patch.reimbursable} onChange={e=>setPatch({...patch,reimbursable:e.target.checked})}/>Mark reimbursable</label><Button size="sm" variant="ghost" disabled={merchant==='All'||!patch.category} onClick={async()=>{if(!window.confirm(`Remember ${merchant} classification for future imports on this account?`))return;const r=await supabase.from('import_rules').insert({merchant,account_id:batch.account_id,mappings:{...patch,reviewed:false,categoryConfirmed:false} as never});if(r.error)throw Error('Could not save rule');toast.success('Rule remembered');}}>Remember merchant rule</Button></>}
    </div>
    {view==='groups'?<ul className="divide-y">{merchants.map(m=>{const items=visible.filter(r=>merchantFamily(r.line.description)===m);if(!items.length)return null;return <li key={m} className="py-3"><div className="flex gap-3 justify-between"><span className="min-w-0 break-words font-medium">{m}</span><span className="shrink-0 whitespace-nowrap tabular-nums">{money(items.reduce((s,r)=>s+r.line.amount,0),batch.currency)}</span></div><p className="text-xs text-muted-foreground">{items.length} transactions · {[...new Set(items.map(r=>classificationStatus(r)))].join(', ')}</p><div className="flex gap-2 mt-2"><Button size="sm" variant="outline" onClick={()=>selectRows(items)}>Select group</Button><Button size="sm" variant="ghost" onClick={()=>{setMerchant(m);setView('transactions');}}>Review group</Button></div></li>;})}</ul>:<ul className="divide-y">{visible.slice(0,50).map(row=><li key={row.id} className="py-3">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3"><input className="mt-2 h-5 w-5" type="checkbox" checked={selected.has(row.id)} disabled={row.duplicate_kind==='exact'} aria-label={`Select ${row.proposal.title} ${row.line.ref}`} onChange={e=>setSelected(s=>{const next=new Set(s);if(e.target.checked)next.add(row.id);else next.delete(row.id);return next;})}/><div className="min-w-0"><div className="flex flex-wrap justify-between gap-x-3 gap-y-1"><Button variant="link" className="p-0 h-auto text-left min-w-0 max-w-full justify-start" onClick={()=>setExpanded(row.id)}><span className="truncate">{row.proposal.merchant||row.proposal.title}</span></Button><span className="text-sm font-semibold whitespace-nowrap tabular-nums">{row.line.direction==='credit'?'+':'−'}{money(row.line.amount,batch.currency)}</span></div><p className="text-xs text-muted-foreground break-words">{row.line.date} · {row.proposal.category} · {SCOPE_LABEL[row.proposal.scope]}</p><p className="text-xs">{classificationStatus(row)}{row.decision==='approved'?' · Approved':''}{row.duplicate_kind!=='new'?` · ${row.duplicate_kind} duplicate`:''}</p></div></div>
    </li>)}</ul>}
    {view==='transactions'&&visible.length>50&&<p className="text-sm text-muted-foreground">Showing 50 of {visible.length}; narrow filters or select all matching.</p>}
    {!visible.length&&<p className="text-sm text-muted-foreground">No transactions in this group.</p>}
    <div className="border-t py-4 flex flex-wrap gap-3 items-center"><Button disabled={!picked.length} onClick={()=>setFinal(true)}>Review selected import</Button><span className="text-sm text-muted-foreground">{summary.eligible.length} eligible · {summary.requiresReview} requiring review</span></div>
    </>}
    <Sheet open={!!expanded} onOpenChange={open=>{if(!open)setExpanded(null);}}><SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto"><SheetHeader><SheetTitle>Transaction review</SheetTitle></SheetHeader>{rows.filter(r=>r.id===expanded).map(row=><div key={row.id} className="p-4"><p className="whitespace-pre-wrap break-words text-sm">{row.line.description}</p><p className="text-sm text-muted-foreground my-3">{row.line.date} · {row.line.direction ?? 'debit'} · {row.line.ref} · {money(row.line.amount,batch.currency)} · {batch.file_name}</p><IndividualReview row={row} onSave={async p=>{setExpanded(null);setPreview({rows:[row],patch:p});}}/></div>)}</SheetContent></Sheet>
    <Sheet open={!!preview} onOpenChange={open=>{if(!open)setPreview(null);}}><SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto"><SheetHeader><SheetTitle>Review classification changes</SheetTitle></SheetHeader>{preview&&<div className="p-4 space-y-4"><p>{preview.rows.length} affected · {Math.max(0,picked.length-preview.rows.length)} excluded from this action</p><ul className="divide-y">{preview.rows.map(row=>{const next=mergeImportPatch(row.proposal,preview.patch);return <li className="py-3 text-sm break-words" key={row.id}><p className="font-medium">{row.proposal.title}</p><p>{row.proposal.category} / {SCOPE_LABEL[row.proposal.scope]} → {next.category} / {SCOPE_LABEL[next.scope]}</p><p className="text-muted-foreground">{next.tags?.join(', ')} · {preview.decision ?? 'Review'}</p>{preview.decision==='approved'&&postingBlockers({...row,proposal:next},accounts,today).map(reason=><p key={reason} className="text-destructive">{reason}</p>)}</li>;})}</ul><Button onClick={savePreview}>Apply reviewed changes</Button></div>}</SheetContent></Sheet>
    <Sheet open={final} onOpenChange={setFinal}><SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto"><SheetHeader><SheetTitle>Confirm selected import</SheetTitle></SheetHeader><div className="p-4 space-y-4"><p>{summary.selected} selected · {summary.eligible.length} eligible · {summary.requiresReview} requiring review · {summary.duplicates} duplicates excluded</p><ul className="divide-y">{summary.types.map(t=><li key={t.type} className="py-2 flex flex-wrap justify-between gap-2"><span>{TXN_LABEL[t.type as keyof typeof TXN_LABEL] ?? t.type} · {t.count}</span><span className="whitespace-nowrap tabular-nums">{money(t.amount,batch.currency)}</span></li>)}</ul><Button disabled={!summary.eligible.length} className="h-auto whitespace-normal min-h-12" onClick={confirm}>Confirm &amp; Import Selected Transactions</Button></div></SheetContent></Sheet>
    <HistoricalBalanceVerification batch={batch} rows={rows} posted={posted} onReload={onReload}/>
  </div>;
}

function ClassificationFields({patch,setPatch}:{patch:Partial<ImportProposal>;setPatch:(p:Partial<ImportProposal>)=>void}) {
  const {preferences,accounts,members}=useStore();
  return <div className="grid gap-2 sm:grid-cols-2">
    <Select value={patch.category ?? ''} onValueChange={v=>setPatch({...patch,category:v})}><SelectTrigger aria-label="Bulk category"><SelectValue placeholder="Set category"/></SelectTrigger><SelectContent>{preferences.categories.filter(c=>!c.archived).map(c=><SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent></Select>
    <Select value={patch.scope ?? ''} onValueChange={v=>setPatch({...patch,scope:v as Scope})}><SelectTrigger aria-label="Bulk workspace"><SelectValue placeholder="Assign workspace"/></SelectTrigger><SelectContent>{SCOPES.map(s=><SelectItem key={s} value={s}>{SCOPE_LABEL[s]}</SelectItem>)}</SelectContent></Select>
    <Select value={patch.accountId ?? ''} onValueChange={v=>setPatch({...patch,accountId:v})}><SelectTrigger aria-label="Bulk payment account"><SelectValue placeholder="Confirm payment account"/></SelectTrigger><SelectContent>{accounts.filter(a=>!a.archived).map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
    <Select value={patch.memberId ?? ''} onValueChange={v=>setPatch({...patch,memberId:v==='me'?null:v})}><SelectTrigger aria-label="Bulk person"><SelectValue placeholder="Assign person"/></SelectTrigger><SelectContent><SelectItem value="me">Me</SelectItem>{members.map(m=><SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select>
    <Input placeholder="Subcategory" aria-label="Bulk subcategory" value={patch.subcategory ?? ''} onChange={e=>setPatch({...patch,subcategory:e.target.value})}/><Input placeholder="Organisation" aria-label="Bulk organisation" value={patch.organisation ?? ''} onChange={e=>setPatch({...patch,organisation:e.target.value})}/>
    <Input placeholder="Tags, separated by commas" aria-label="Bulk tags" value={patch.tags?.join(', ') ?? ''} onChange={e=>setPatch({...patch,tags:e.target.value.split(',').map(t=>t.trim()).filter(Boolean)})}/><Input placeholder="Reimbursement organisation" aria-label="Bulk reimbursement organisation" value={patch.reimbursementOrganisation ?? ''} onChange={e=>setPatch({...patch,reimbursementOrganisation:e.target.value})}/>
    <Select value="" onValueChange={id=>{const trip=preferences.trips.find(t=>t.id===id);if(trip)setPatch({...patch,tags:[...(patch.tags ?? []),tripTag(trip)]});}}><SelectTrigger aria-label="Bulk trip"><SelectValue placeholder="Link trip"/></SelectTrigger><SelectContent>{preferences.trips.map(t=><SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
  </div>;
}
function IndividualReview({row,onSave}:{row:ImportRow;onSave:(p:ImportProposal)=>Promise<void>}) {
  const {accounts}=useStore(); const [p,setP]=useState<ImportProposal>(row.proposal);
  return <div className="space-y-3 py-3"><ClassificationFields patch={p} setPatch={patch=>setP({...p,...patch})}/><div className="grid gap-2 sm:grid-cols-2"><Select value={p.txnType ?? 'expense'} onValueChange={v=>setP({...p,txnType:v as NonNullable<ImportProposal['txnType']>})}><SelectTrigger aria-label="Review transaction type"><SelectValue/></SelectTrigger><SelectContent>{TXN_TYPES.filter(t=>t!=='adjustment').map(t=><SelectItem key={t} value={t}>{TXN_LABEL[t]}</SelectItem>)}</SelectContent></Select><Select value={p.toAccountId ?? 'none'} onValueChange={v=>setP({...p,toAccountId:v==='none'?null:v})}><SelectTrigger aria-label="Review destination account"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Destination account</SelectItem>{accounts.filter(a=>a.id!==p.accountId&&!a.archived).map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>{['likely','possible'].includes(row.duplicate_kind)&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={!!p.duplicateOverride} onChange={e=>setP({...p,duplicateOverride:e.target.checked})}/>This is a separate, legitimate payment</label>}<Button onClick={()=>onSave({...orientStatementMove(p,row.line.direction,row.proposal.accountId ?? ''),reviewed:true,categoryConfirmed:true})}>Preview reviewed classification</Button></div>;
}