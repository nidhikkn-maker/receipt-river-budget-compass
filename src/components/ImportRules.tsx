import { confirmAction } from "@/lib/confirm";
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Trash2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useStore } from '@/lib/store';
import { listImportRules, listImports, listImportRows } from '@/lib/import-repository';
import { merchantFamily, importRuleMatches, matchingImportRules, safeImportRuleMappings, type ImportRule, type ImportRow, type ImportRuleConditions } from '@/lib/historical-import';
import { SCOPES, SCOPE_LABEL, type Scope } from '@/lib/expenses';
import { TXN_TYPES, TXN_LABEL, type TxnType } from '@/lib/ledger';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';

export function ImportRules({ seed }: { seed?: ImportRule | undefined } = {}) {
  const {preferences,accounts}=useStore();
  const [rules,setRules]=useState<ImportRule[]>([]),[merchant,setMerchant]=useState(''),[category,setCategory]=useState(''),[workspace,setWorkspace]=useState<Scope>('personal'),[account,setAccount]=useState('all');
  const [editing,setEditing]=useState<string|null>(null),[description,setDescription]=useState(''),[direction,setDirection]=useState('all'),[currency,setCurrency]=useState(''),[min,setMin]=useState(''),[max,setMax]=useState(''),[priority,setPriority]=useState('0'),[organisation,setOrganisation]=useState(''),[tags,setTags]=useState(''),[type,setType]=useState('unchanged'),[reimbursable,setReimbursable]=useState(false);
  const [preview,setPreview]=useState<{rule:ImportRule;rows:{row:ImportRow;file:string;currency:string;conflict:boolean}[]}|null>(null);
  const load=async()=>setRules(await listImportRules());
  useEffect(()=>{void load().catch(e=>toast.error(e.message));},[]);
  const reset=()=>{setEditing(null);setMerchant('');setCategory('');setWorkspace('personal');setAccount('all');setDescription('');setDirection('all');setCurrency('');setMin('');setMax('');setPriority('0');setOrganisation('');setTags('');setType('unchanged');setReimbursable(false);};
  const draft=():ImportRule=>({id:editing??'preview',enabled:rules.find(r=>r.id===editing)?.enabled??true,merchant:merchantFamily(merchant),account_id:account==='all'?null:account,priority:Number(priority),conditions:{...(description.trim()?{description:description.trim()}:{}),...(direction!=='all'?{direction:direction as 'debit'|'credit'}:{}),...(currency.trim()?{currency:currency.trim().toUpperCase()}:{}),...(min!==''?{minAmount:Number(min)}:{}),...(max!==''?{maxAmount:Number(max)}:{})},mappings:safeImportRuleMappings({category,scope:workspace,organisation:organisation.trim(),tags:tags.split(',').map(t=>t.trim()).filter(Boolean),...(type!=='unchanged'?{txnType:type as TxnType}:{}),reimbursable})});
  const validate=()=>{
    if(!merchant.trim()||!category)throw Error('Choose a merchant and category');
    if(!Number.isInteger(Number(priority))||Number(priority)<0||Number(priority)>100)throw Error('Priority must be from 0 to 100');
    if((min!==''&&(!Number.isFinite(Number(min))||Number(min)<0))||(max!==''&&(!Number.isFinite(Number(max))||Number(max)<0))||(min!==''&&max!==''&&Number(min)>Number(max)))throw Error('Enter a valid amount range');
    if((min!==''||max!=='')&&!/^[A-Z]{3}$/.test(currency.trim().toUpperCase()))throw Error('Choose the statement currency for amount conditions');
    if(currency.trim()&&!/^[A-Z]{3}$/.test(currency.trim().toUpperCase()))throw Error('Enter a three-letter currency');
  };
  const affected=async(rule:ImportRule)=>{
    const batches=await listImports();
    const candidateRules=[...rules.filter(r=>r.id!==rule.id),rule];
    const groups=await Promise.all(batches.filter(b=>!rule.account_id||b.account_id===rule.account_id).map(async b=>(await listImportRows(b.id)).filter(row=>importRuleMatches({...rule,enabled:true},row.line,b.account_id,b.currency)).map(row=>({row,file:b.file_name,currency:b.currency,conflict:matchingImportRules(candidateRules,row.line,b.account_id,b.currency).conflict}))));
    setPreview({rule,rows:groups.flat()});
  };
  const save=async()=>{
    validate();const rule=draft();
    const payload={merchant:rule.merchant,account_id:rule.account_id,mappings:rule.mappings as Json,conditions:(rule.conditions??{}) as Json,priority:rule.priority??0};
    const r=editing?await supabase.from('import_rules').update(payload).eq('id',editing):await supabase.from('import_rules').insert(payload);
    if(r.error)throw Error('Could not save import rule');reset();setPreview(null);await load();toast.success('Import rule saved');
  };
  const edit=(r:ImportRule)=>{const c:ImportRuleConditions=r.conditions??{};setEditing(r.id);setMerchant(r.merchant);setCategory(r.mappings.category??'');setWorkspace(r.mappings.scope??'personal');setAccount(r.account_id??'all');setDescription(c.description??'');setDirection(c.direction??'all');setCurrency(c.currency??'');setMin(c.minAmount===undefined?'':String(c.minAmount));setMax(c.maxAmount===undefined?'':String(c.maxAmount));setPriority(String(r.priority??0));setOrganisation(r.mappings.organisation??'');setTags((r.mappings.tags??[]).join(', '));setType(r.mappings.txnType??'unchanged');setReimbursable(!!r.mappings.reimbursable);};
  useEffect(()=>{if(seed){edit(seed);setEditing(null);}},[seed]);
  return <section id="import-rules" className="mb-8 scroll-mt-20 border-t pt-6">
    <h2 className="mb-4 text-xl font-semibold">Financial automation · Import rules</h2>
    <div className="grid gap-3 sm:grid-cols-2">
      <Label className="grid gap-2">Merchant<Input aria-label="Rule merchant" placeholder="Merchant family" value={merchant} onChange={e=>setMerchant(e.target.value)}/></Label>
      <Label className="grid gap-2">Description contains<Input aria-label="Rule description contains" value={description} onChange={e=>setDescription(e.target.value)}/></Label>
      <Select value={account} onValueChange={setAccount}><SelectTrigger aria-label="Rule account"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All accounts</SelectItem>{accounts.filter(a=>!a.archived).map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
      <Select value={direction} onValueChange={setDirection}><SelectTrigger aria-label="Rule direction"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Money in and out</SelectItem><SelectItem value="debit">Money out</SelectItem><SelectItem value="credit">Money in</SelectItem></SelectContent></Select>
      <Label className="grid gap-2">Statement currency<Input aria-label="Rule currency" placeholder="INR" maxLength={3} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())}/></Label>
      <Label className="grid gap-2">Priority<Input aria-label="Rule priority" type="number" min={0} max={100} step={1} value={priority} onChange={e=>setPriority(e.target.value)}/></Label>
      <Label className="grid gap-2">Minimum original amount<Input aria-label="Rule minimum amount" type="number" min={0} step="0.01" value={min} onChange={e=>setMin(e.target.value)}/></Label>
      <Label className="grid gap-2">Maximum original amount<Input aria-label="Rule maximum amount" type="number" min={0} step="0.01" value={max} onChange={e=>setMax(e.target.value)}/></Label>
      <Select value={category} onValueChange={setCategory}><SelectTrigger aria-label="Rule category"><SelectValue placeholder="Category"/></SelectTrigger><SelectContent>{preferences.categories.filter(c=>!c.archived&&!/miscellaneous\s*[—–-]\s*check/i.test(c.name)).map(c=><SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent></Select>
      <Select value={workspace} onValueChange={v=>setWorkspace(v as Scope)}><SelectTrigger aria-label="Rule workspace"><SelectValue/></SelectTrigger><SelectContent>{SCOPES.map(s=><SelectItem key={s} value={s}>{SCOPE_LABEL[s]}</SelectItem>)}</SelectContent></Select>
      <Input aria-label="Rule organisation" placeholder="Organisation" value={organisation} onChange={e=>setOrganisation(e.target.value)}/>
      <Input aria-label="Rule tags" placeholder="Tags, separated by commas" value={tags} onChange={e=>setTags(e.target.value)}/>
      <Select value={type} onValueChange={setType}><SelectTrigger aria-label="Rule transaction type"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="unchanged">Keep suggested transaction type</SelectItem>{TXN_TYPES.filter(t=>t!=='adjustment').map(t=><SelectItem key={t} value={t}>{TXN_LABEL[t]}</SelectItem>)}</SelectContent></Select>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reimbursable} onChange={e=>setReimbursable(e.target.checked)}/>Reimbursable</label>
    </div>
    <div className="my-3 flex flex-wrap gap-2"><Button disabled={!merchant.trim()||!category} onClick={async()=>{validate();await affected(draft());}}>Preview rule</Button>{editing&&<Button variant="ghost" onClick={reset}><X className="size-4"/>Cancel edit</Button>}</div>
    <ul className="divide-y">{rules.map(r=><li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
      <input type="checkbox" aria-label={`Enable ${r.merchant} rule`} checked={r.enabled} onChange={async e=>{const result=await supabase.from('import_rules').update({enabled:e.target.checked}).eq('id',r.id);if(result.error)toast.error('Could not update rule');else await load();}}/>
      <span className="min-w-0 flex-1 break-words text-sm"><strong>{r.merchant}</strong> · {r.mappings.category} · {SCOPE_LABEL[r.mappings.scope??'personal']}<span className="block text-xs text-muted-foreground">Priority {r.priority??0} · {r.conditions?.direction==='credit'?'Money in':r.conditions?.direction==='debit'?'Money out':'In and out'}{r.conditions?.description?` · Contains “${r.conditions.description}”`:''}{r.conditions?.currency?` · ${r.conditions.currency}`:''}</span></span>
      <Button size="sm" variant="outline" onClick={()=>edit(r)}>Edit rule</Button><Button size="sm" variant="ghost" onClick={()=>affected(r)}>Affected transactions</Button>
      <Button size="icon" variant="ghost" aria-label={`Delete ${r.merchant} rule`} onClick={async()=>{if(!await confirmAction(`Delete the ${r.merchant} rule?`))return;const result=await supabase.from('import_rules').delete().eq('id',r.id);if(result.error)throw Error('Could not delete rule');await load();}}><Trash2 className="size-4"/></Button>
    </li>)}</ul>
    <Sheet open={!!preview} onOpenChange={open=>{if(!open)setPreview(null);}}><SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto"><SheetHeader><SheetTitle>Import rule preview</SheetTitle></SheetHeader>{preview&&<div className="space-y-4 p-4"><p className="break-words font-medium">{preview.rule.merchant} → {preview.rule.mappings.category} · {SCOPE_LABEL[preview.rule.mappings.scope??'personal']}</p><p className="text-sm">{preview.rows.length} matching statement transactions · {preview.rows.filter(r=>r.conflict).length} equal-priority conflicts</p><p className="text-sm text-muted-foreground">Existing records stay unchanged. Future suggestions still need review and approval. Higher priority wins; conflicting rules at the same priority require your decision.</p>{preview.rule.mappings.txnType&&<p className="text-sm text-warning">Transaction type: {TXN_LABEL[preview.rule.mappings.txnType]}. Transfers and settlements still need two reviewed accounts.</p>}<ul className="max-h-64 overflow-y-auto divide-y">{preview.rows.map(({row,file,currency,conflict})=><li key={row.id} className="py-2 text-sm"><p className="break-words">{row.line.description}</p><p>{row.line.date} · {row.line.amount.toLocaleString('en-IN')} {currency} · {row.decision}{conflict?' · Conflicting rules':''}</p><p className="break-words text-xs text-muted-foreground">{file}</p></li>)}</ul>{preview.rule.id===(editing??'preview')&&<Button onClick={save}>{editing?'Confirm rule changes':'Create confirmed rule'}</Button>}</div>}</SheetContent></Sheet>
  </section>;
}
