import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/lib/store';
import { listImportRules } from '@/lib/import-repository';
import { merchantFamily, type ImportRule } from '@/lib/historical-import';
import { SCOPES, SCOPE_LABEL, type Scope } from '@/lib/expenses';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

export function ImportRules() {
  const {preferences,accounts}=useStore();
  const [rules,setRules]=useState<ImportRule[]>([]),[merchant,setMerchant]=useState(''),[category,setCategory]=useState(''),[workspace,setWorkspace]=useState<Scope>('personal'),[account,setAccount]=useState('all');
  const [editing,setEditing]=useState<string|null>(null);
  const load=async()=>setRules(await listImportRules());
  useEffect(()=>{void load().catch(e=>toast.error(e.message));},[]);
  const save=async()=>{
    if(!merchant.trim() || !category) return;
    const payload={merchant:merchantFamily(merchant),account_id:account==='all'?null:account,mappings:{category,scope:workspace}};
    const r=editing?await supabase.from('import_rules').update(payload).eq('id',editing):await supabase.from('import_rules').insert(payload);
    if(r.error) throw Error('Could not save import rule'); setMerchant('');setEditing(null); await load(); toast.success('Import rule saved');
  };
  return <section id="import-rules" className="mb-8 scroll-mt-20 border-t pt-6">
    <h2 className="mb-4 text-xl font-semibold">Financial automation · Import rules</h2>
    <div className="grid gap-3 sm:grid-cols-2">
      <Input aria-label="Rule merchant" placeholder="Merchant family" value={merchant} onChange={e=>setMerchant(e.target.value)}/>
      <Select value={category} onValueChange={setCategory}><SelectTrigger aria-label="Rule category"><SelectValue placeholder="Category"/></SelectTrigger><SelectContent>{preferences.categories.filter(c=>!c.archived).map(c=><SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent></Select>
      <Select value={workspace} onValueChange={v=>setWorkspace(v as Scope)}><SelectTrigger aria-label="Rule workspace"><SelectValue/></SelectTrigger><SelectContent>{SCOPES.map(s=><SelectItem key={s} value={s}>{SCOPE_LABEL[s]}</SelectItem>)}</SelectContent></Select>
      <Select value={account} onValueChange={setAccount}><SelectTrigger aria-label="Rule account"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All accounts</SelectItem>{accounts.map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
    </div>
    <Button className="my-3" disabled={!merchant.trim() || !category} onClick={save}>{editing?'Save rule changes':'Create confirmed rule'}</Button>
    <ul className="divide-y">{rules.map(r=><li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
      <input type="checkbox" aria-label={`Enable ${r.merchant} rule`} checked={r.enabled} onChange={async e=>{const result=await supabase.from('import_rules').update({enabled:e.target.checked}).eq('id',r.id);if(result.error) toast.error('Could not update rule');else await load();}}/>
      <span className="min-w-0 flex-1 text-sm"><strong>{r.merchant}</strong> · {r.mappings.category} · {SCOPE_LABEL[r.mappings.scope ?? 'personal']}{rules.some(x=>x.id!==r.id&&x.enabled&&r.enabled&&x.merchant===r.merchant&&x.account_id===r.account_id&&JSON.stringify(x.mappings)!==JSON.stringify(r.mappings))&&<span className="block text-warning">Conflicting rules — requires review</span>}</span>
      <Button size="sm" variant="outline" onClick={()=>{setEditing(r.id);setMerchant(r.merchant);setCategory(r.mappings.category ?? '');setWorkspace(r.mappings.scope ?? 'personal');setAccount(r.account_id ?? 'all');}}>Edit rule</Button>
      <Button size="icon" variant="ghost" aria-label={`Delete ${r.merchant} rule`} onClick={async()=>{if(!window.confirm(`Delete the ${r.merchant} rule?`))return;const result=await supabase.from('import_rules').delete().eq('id',r.id);if(result.error)throw Error('Could not delete rule');await load();}}><Trash2 className="h-4 w-4"/></Button>
    </li>)}</ul>
  </section>;
}