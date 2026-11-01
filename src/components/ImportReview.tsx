import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { useStore } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';
import { SCOPES, SCOPE_LABEL, money, type Scope } from '@/lib/expenses';
import { TXN_LABEL, TXN_TYPES, isLiability, balanceAsOf } from '@/lib/ledger';
import { REVIEW_GROUPS, merchantFamily, postingBlockers, orientStatementMove, reconcileStatement, type ImportRow, type ImportBatch, type ImportProposal } from '@/lib/historical-import';
import { reviseRows } from '@/lib/import-repository';
import { postHistoricalImport } from '@/lib/historical-import.functions';
import { downloadBlob, toCsv } from '@/lib/reports';
import { tripTag } from '@/lib/intelligence';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

export function ImportReview({batch,rows,posted,onReload}:{batch:ImportBatch;rows:ImportRow[];posted:Set<string>;onReload:()=>Promise<void>}) {
  const {accounts,preferences,members,transactions,refresh}=useStore();
  const post=useServerFn(postHistoricalImport);
  const [group,setGroup]=useState('All'),[merchant,setMerchant]=useState('All'),[selected,setSelected]=useState<Set<string>>(new Set()),[patch,setPatch]=useState<Partial<ImportProposal>>({}),[from,setFrom]=useState(''),[to,setTo]=useState(''),[expanded,setExpanded]=useState<string|null>(null);
  const [opening,setOpening]=useState(batch.opening_balance==null?'':String(batch.opening_balance)),[closing,setClosing]=useState(batch.closing_balance==null?'':String(batch.closing_balance));
  const [periodFrom,setPeriodFrom]=useState(batch.period_from ?? ''),[periodTo,setPeriodTo]=useState(batch.period_to ?? '');
  const currentPosted=new Set(rows.filter(r=>posted.has(r.fingerprint)).map(r=>r.fingerprint));
  const active=rows.filter(r=>!posted.has(r.fingerprint));
  const visible=active.filter(r=>(group==='All'||r.review_group===group)&&(merchant==='All'||merchantFamily(r.line.description)===merchant)&&(!from||r.line.date>=from)&&(!to||r.line.date<=to));
  const merchants=useMemo(()=>[...new Set(active.map(r=>merchantFamily(r.line.description)))].sort(),[rows,posted]);
  const picked=active.filter(r=>selected.has(r.id)), today=new Date().toISOString().slice(0,10);
  const account=accounts.find(a=>a.id===batch.account_id);
  const reconciliation=reconcileStatement(opening===''?null:Number(opening),closing===''?null:Number(closing),rows.map(r=>r.line),account?isLiability(account.kind):false);
  const apply=async(decision?:ImportRow['decision'])=>{
    if(!picked.length)return;
    const changed={...patch,...(decision==='approved'?{reviewed:true}:{})};
    if(decision==='approved') {
      const blocked=picked.find(r=>postingBlockers({...r,proposal:{...r.proposal,...changed}},accounts,today).length);
      if(blocked) throw Error(`${blocked.proposal.title}: ${postingBlockers({...blocked,proposal:{...blocked.proposal,...changed}},accounts,today)[0]}`);
    }
    await reviseRows(batch.id,picked.map(r=>r.id),changed,decision); await onReload(); toast.success(`${picked.length} proposals ${decision ?? 'updated'}`);setPatch({});
  };
  const approved=active.filter(r=>r.decision==='approved');
  const confirm=async()=>{
    if(!approved.length || !window.confirm(`Post ${approved.length} approved transactions to your ledger? Existing records will not be changed.`))return;
    let count=0;
    for(let i=0;i<approved.length;i+=100) count+=(await post({data:{batch:batch.id,ids:approved.slice(i,i+100).map(r=>r.id)}})).count;
    await onReload();await refresh();setSelected(new Set());toast.success(`${count} transactions posted`);
  };
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center gap-2"><Button variant="outline" onClick={async()=>{const result=await supabase.storage.from('receipts').createSignedUrl(batch.file_path,60);if(result.error)throw Error('Original unavailable');window.open(result.data.signedUrl,'_blank','noopener,noreferrer');}}>Original statement</Button><Button variant="ghost" onClick={()=>downloadBlob(new Blob([toCsv({title:'Import audit',headers:['Date','Description','Reference','Amount','Direction','Category','Workspace','Decision','Duplicate'],rows:rows.map(r=>[r.line.date,r.line.description,r.line.ref,r.line.amount,r.line.direction ?? 'debit',r.proposal.category,r.proposal.scope,posted.has(r.fingerprint)?'posted':r.decision,r.duplicate_kind])})],{type:'text/csv'}),`import-audit-${batch.id}.csv`)}>Export review audit</Button><Button asChild variant="ghost"><Link to="/settings" hash="import-rules">Import rules</Link></Button></div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{REVIEW_GROUPS.map(g=><Button key={g} variant={group===g?'default':'outline'} className="h-auto min-h-12 whitespace-normal justify-between text-left text-xs" onClick={()=>{setGroup(group===g?'All':g);setSelected(new Set());}}><span>{g}</span><span className="ml-2">{active.filter(r=>r.review_group===g).length}</span></Button>)}</div>
    <div className="flex flex-wrap items-center gap-2"><span className="text-sm">{rows.length} extracted · {currentPosted.size} posted · {active.filter(r=>r.decision==='review').length} awaiting review</span><Select value={merchant} onValueChange={setMerchant}><SelectTrigger className="w-full sm:w-56" aria-label="Merchant group"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="All">All merchants</SelectItem>{merchants.map(m=><SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select><Input className="w-40" type="date" aria-label="Review from date" value={from} onChange={e=>setFrom(e.target.value)}/><Input className="w-40" type="date" aria-label="Review to date" value={to} onChange={e=>setTo(e.target.value)}/></div>
    <div className="border-y py-4 space-y-3">
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>setSelected(new Set(visible.filter(r=>r.decision!=='excluded'&&r.duplicate_kind!=='exact').map(r=>r.id)))}>Select eligible group</Button><Button size="sm" variant="ghost" onClick={()=>setSelected(new Set())}>Clear selection</Button><span className="self-center text-sm">{selected.size} selected</span></div>
      {selected.size>0&&<><ClassificationFields patch={patch} setPatch={setPatch}/><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>apply()}>Apply classification</Button><Button variant="outline" onClick={()=>apply('review')}>Individual review</Button><Button variant="outline" onClick={()=>apply('excluded')}>Exclude selected</Button><Button onClick={()=>apply('approved')}>Approve selected</Button></div><label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={!!patch.reimbursable} onChange={e=>setPatch({...patch,reimbursable:e.target.checked})}/>Mark reimbursable</label><Button size="sm" variant="ghost" disabled={merchant==='All'||!patch.category} onClick={async()=>{if(!window.confirm(`Remember ${merchant} classification for future imports on this account?`))return;const r=await supabase.from('import_rules').insert({merchant,account_id:batch.account_id,mappings:patch as never});if(r.error)throw Error('Could not save rule');toast.success('Rule remembered');}}>Remember merchant rule</Button></>}
    </div>
    <ul className="divide-y">{visible.map(row=><li key={row.id} className="py-3">
      <div className="flex items-start gap-3"><input className="mt-1 shrink-0" type="checkbox" checked={selected.has(row.id)} disabled={row.duplicate_kind==='exact'} aria-label={`Select ${row.proposal.title} ${row.line.ref}`} onChange={e=>setSelected(s=>{const next=new Set(s);if(e.target.checked)next.add(row.id);else next.delete(row.id);return next;})}/><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{row.line.description}</p><p className="text-xs text-muted-foreground">{row.line.date} · {row.proposal.category} · {SCOPE_LABEL[row.proposal.scope]} · {row.confidence} confidence</p><p className="text-xs text-muted-foreground">{row.line.ref} · {row.decision}{row.duplicate_kind!=='new'?` · ${row.duplicate_kind} duplicate`:''}</p></div><span className="font-mono text-xs shrink-0">{row.line.direction==='credit'?'+':'−'}{money(row.line.amount,batch.currency)}</span></div>
      <Button variant="ghost" size="sm" onClick={()=>setExpanded(expanded===row.id?null:row.id)}>Review individually</Button>
      {expanded===row.id&&<IndividualReview row={row} onSave={async p=>{await reviseRows(batch.id,[row.id],p);await onReload();setExpanded(null);}}/>}
    </li>)}</ul>
    {!visible.length&&<p className="text-sm text-muted-foreground">No transactions in this group.</p>}
    <div className="border-t py-4 flex flex-wrap gap-3 items-center"><Button disabled={!approved.length} onClick={confirm}>Confirm import · {approved.length} approved</Button><span className="text-sm text-muted-foreground">{active.filter(r=>r.decision==='excluded').length} excluded</span></div>
    <section className="border-t pt-5 space-y-3"><h3 className="text-lg font-semibold">Statement reconciliation</h3><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs">Statement starts<Input aria-label="Statement period start" type="date" value={periodFrom} onChange={e=>setPeriodFrom(e.target.value)}/></label><label className="text-xs">Statement ends<Input aria-label="Statement period end" type="date" value={periodTo} onChange={e=>setPeriodTo(e.target.value)}/></label><label className="text-xs">Opening balance before this period<Input type="number" aria-label="Statement opening balance" value={opening} onChange={e=>setOpening(e.target.value)}/></label><label className="text-xs">Statement closing balance<Input type="number" aria-label="Statement closing balance" value={closing} onChange={e=>setClosing(e.target.value)}/></label></div><p className="text-sm">Imported movement: {money(reconciliation.movement,batch.currency)} · Calculated closing: {reconciliation.importedBalance==null?'Not supplied':money(reconciliation.importedBalance,batch.currency)}</p><p className={reconciliation.verified?'text-sm text-success':'text-sm text-warning'}>{reconciliation.difference==null?'Unverified — opening and closing balances needed':reconciliation.verified?'Statement arithmetic matches — ledger coverage still requires review':`Unreconciled difference: ${money(reconciliation.difference,batch.currency)}`}</p>{account&&batch.currency==='INR'&&periodTo&&<p className="text-sm">Existing ledger balance at period end: {money(balanceAsOf(account,transactions,periodTo))}</p>}<Button variant="outline" onClick={async()=>{if(!periodFrom||!periodTo||periodFrom>periodTo||periodFrom<'2026-04-01'||periodTo>today)throw Error('Confirm a valid statement period from April 2026 through today');if(rows.some(r=>r.line.date<periodFrom||r.line.date>periodTo))throw Error('Statement period must include every extracted transaction');const r=await supabase.from('import_batches').update({opening_balance:opening===''?null:Number(opening),closing_balance:closing===''?null:Number(closing),period_from:periodFrom,period_to:periodTo}).eq('id',batch.id);if(r.error)throw Error('Could not save reconciliation');await onReload();toast.success('Reconciliation saved; account funds unchanged');}}>Save reconciliation</Button></section>
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
  return <div className="space-y-3 py-3"><ClassificationFields patch={p} setPatch={patch=>setP({...p,...patch})}/><div className="grid gap-2 sm:grid-cols-2"><Select value={p.txnType ?? 'expense'} onValueChange={v=>setP({...p,txnType:v as NonNullable<ImportProposal['txnType']>})}><SelectTrigger aria-label="Review transaction type"><SelectValue/></SelectTrigger><SelectContent>{TXN_TYPES.filter(t=>t!=='adjustment').map(t=><SelectItem key={t} value={t}>{TXN_LABEL[t]}</SelectItem>)}</SelectContent></Select><Select value={p.toAccountId ?? 'none'} onValueChange={v=>setP({...p,toAccountId:v==='none'?null:v})}><SelectTrigger aria-label="Review destination account"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Destination account</SelectItem>{accounts.filter(a=>a.id!==p.accountId&&!a.archived).map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>{['likely','possible'].includes(row.duplicate_kind)&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={!!p.duplicateOverride} onChange={e=>setP({...p,duplicateOverride:e.target.checked})}/>This is a separate, legitimate payment</label>}<Button onClick={()=>onSave({...orientStatementMove(p,row.line.direction,row.proposal.accountId ?? ''),reviewed:true})}>Save reviewed classification</Button></div>;
}