import { useState } from 'react';
import { Pencil, Plus, Archive, RotateCcw } from 'lucide-react';
import { useStore } from '@/lib/store';
import { PAYEE_TYPES, validatePayee, recipientAccount, recipientBalances, type Payee } from '@/lib/payees';
import { money } from '@/lib/expenses';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

export function PayeeDirectory() {
  const { preferences, savePreferences, accounts = [], transactions = [], addAccount } = useStore();
  const [track,setTrack] = useState<{payee:Payee;direction:'lent'|'borrowed'}|null>(null);
  const [tracking,setTracking] = useState(false);
  const startTracking = async () => {
    if (!track) return; setTracking(true);
    try { const a=recipientAccount(track.payee,track.direction); if (accounts.some(x=>!x.archived&&x.details?.payeeId===track.payee.id&&x.kind===a.kind)) throw Error('This is already being tracked.'); await addAccount(a); setTrack(null); setError(''); }
    catch(e) { setError(e instanceof Error?e.message:'Could not start tracking. Retry.'); } finally { setTracking(false); }
  };
  const payees = preferences.payees ?? [];
  const [query,setQuery] = useState('');
  const [draft,setDraft] = useState<Payee|null>(null);
  const [preview,setPreview] = useState<Payee|null>(null);
  const [error,setError] = useState('');
  const [saving,setSaving] = useState(false);
  const [expected,setExpected] = useState('');
  const begin = (value:Payee) => {setDraft(value);setPreview(null);setError('');setExpected(JSON.stringify(payees));};
  const save = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      if (JSON.stringify(payees)!==expected) throw Error('The recipient directory changed. Reopen this recipient before saving.');
      const next=validatePayee(preview,payees);
      await savePreferences({...preferences,payees:payees.some(p=>p.id===next.id)?payees.map(p=>p.id===next.id?next:p):[...payees,next]});
      setDraft(null);setPreview(null);setError('');
    } catch(e) {setError(e instanceof Error?e.message:'Recipient could not be saved. Retry.');}
    finally {setSaving(false);}
  };
  const update = (patch:Partial<Payee>) => {if(draft)setDraft({...draft,...patch});};
  const matches=payees.filter(p=>`${p.name} ${p.type} ${p.organisation} ${p.identifiers.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section id="payees" className="scroll-mt-20 space-y-3 border-y py-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Recipients & payees</h2><Button size="sm" onClick={()=>begin({id:crypto.randomUUID(),name:'',type:'individual',identifiers:[],accountDetails:'',accountVerified:false,organisation:'',preferredCategory:'',archived:false})}><Plus className="size-4"/>Add recipient</Button></div>
    <Input type="search" aria-label="Search recipients" placeholder="Search recipients" value={query} onChange={e=>setQuery(e.target.value)}/>
    <ul className="divide-y">{matches.map(p=><li key={p.id} className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{p.name}{p.archived?' · Archived':''}</p><p className="break-words text-xs text-muted-foreground">{p.type}{p.organisation?` · ${p.organisation}`:''}</p>{(()=>{const b=recipientBalances(p.id,accounts,transactions);return <>{b.accounts.length>0&&<p className="text-xs">{b.accounts.some(a=>a.kind==='other_asset')&&<>Owes you {money(b.owedToYou)} </>}{b.accounts.some(a=>a.kind==='other_liability')&&<>· You owe {money(b.youOwe)}</>}</p>}{!p.archived&&<div className="mt-1 flex flex-wrap gap-1">{!b.accounts.some(a=>a.kind==='other_asset')&&<Button size="sm" variant="outline" onClick={()=>setTrack({payee:p,direction:'lent'})}>Track money lent</Button>}{!b.accounts.some(a=>a.kind==='other_liability')&&<Button size="sm" variant="outline" onClick={()=>setTrack({payee:p,direction:'borrowed'})}>Track money borrowed</Button>}</div>}</>;})()}</div><Button size="icon" variant="ghost" aria-label={`Edit ${p.name}`} title={`Edit ${p.name}`} onClick={()=>begin({...p})}><Pencil className="size-4"/></Button><Button size="icon" variant="ghost" aria-label={`${p.archived?'Restore':'Archive'} ${p.name}`} title={p.archived?'Restore recipient':'Archive recipient'} onClick={()=>{begin({...p,archived:!p.archived});setPreview({...p,archived:!p.archived});}}>{p.archived?<RotateCcw className="size-4"/>:<Archive className="size-4"/>}</Button></li>)}</ul>
    {!matches.length&&<p className="text-sm text-muted-foreground">{payees.length?'No matching recipients.':'No recipients saved.'}</p>}
    <Dialog open={!!track} onOpenChange={o=>{if(!o&&!tracking)setTrack(null);}}><DialogContent><DialogHeader><DialogTitle>{track?.direction==='lent'?'Track money lent':'Track money borrowed'}</DialogTitle><DialogDescription>Creates an account named “{track?recipientAccount(track.payee,track.direction).name:''}” starting at ₹0. Record each amount you {track?.direction==='lent'?'lend or get back':'borrow or repay'} as a transfer to or from it, so it is never counted as spending or income. Nothing else changes.</DialogDescription></DialogHeader><div className="flex gap-2"><Button variant="outline" disabled={tracking} onClick={()=>setTrack(null)}>Cancel</Button><Button loading={tracking} onClick={startTracking}>Confirm</Button></div>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}</DialogContent></Dialog>
    <Dialog open={!!draft} onOpenChange={open=>{if(!open&&!saving){setDraft(null);setPreview(null);setError('');}}}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{preview?'Confirm recipient':'Recipient details'}</DialogTitle><DialogDescription>{preview?'Only the recipient directory changes. Existing transactions, balances and categorisation rules remain unchanged.':'Bank details are optional. Leave unknown information blank.'}</DialogDescription></DialogHeader>
      {draft&&!preview&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();try{setPreview(validatePayee(draft,payees));setError('');}catch(error){setError(error instanceof Error?error.message:'Check recipient details.');}}}>
        <Label htmlFor="payee-name">Display name</Label><Input id="payee-name" value={draft.name} maxLength={120} onChange={e=>update({name:e.target.value})}/>
        <Select value={draft.type} onValueChange={v=>update({type:v as Payee['type']})}><SelectTrigger aria-label="Recipient type"><SelectValue/></SelectTrigger><SelectContent>{PAYEE_TYPES.map(t=><SelectItem key={t} value={t}>{t[0]?.toUpperCase()}{t.slice(1)}</SelectItem>)}</SelectContent></Select>
        <Label htmlFor="payee-identifiers">Payment identifiers · optional</Label><Textarea id="payee-identifiers" value={draft.identifiers.join('\n')} onChange={e=>update({identifiers:e.target.value.split('\n')})}/>
        <Label htmlFor="payee-account">Account details · optional</Label><Textarea id="payee-account" value={draft.accountDetails} maxLength={500} onChange={e=>update({accountDetails:e.target.value,accountVerified:false})}/>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.accountVerified} onChange={e=>update({accountVerified:e.target.checked})}/>I verified these account details</label>
        <Select value={draft.organisation||'none'} onValueChange={v=>update({organisation:v==='none'?'':v})}><SelectTrigger aria-label="Recipient organisation"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">No related organisation</SelectItem>{preferences.tags.filter(t=>t.group==='Organisation').map(t=><SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>)}</SelectContent></Select>
        <Select value={draft.preferredCategory||'none'} onValueChange={v=>update({preferredCategory:v==='none'?'':v})}><SelectTrigger aria-label="Preferred recipient category"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">No preferred category</SelectItem>{preferences.categories.filter(c=>!c.archived).map(c=><SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent></Select>
        <div className="flex gap-2"><Button type="button" variant="outline" onClick={()=>setDraft(null)}>Cancel</Button><Button type="submit">Review recipient</Button></div>
      </form>}
      {preview&&<><dl className="space-y-2 text-sm"><dt>Name</dt><dd className="break-words font-medium">{preview.name}</dd><dt>Type</dt><dd>{preview.type}</dd><dt>Payment identifiers</dt><dd className="break-all">{preview.identifiers.join(', ')||'Not recorded'}</dd><dt>Account details</dt><dd className="break-all">{preview.accountDetails||'Not recorded'}{preview.accountVerified?' · Verified by you':''}</dd><dt>Organisation / preferred category</dt><dd>{preview.organisation||'None'} / {preview.preferredCategory||'None'}</dd><dt>Status</dt><dd>{preview.archived?'Archived':'Active'}</dd></dl><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={saving} onClick={()=>setPreview(null)}>Back</Button><Button variant="outline" disabled={saving} onClick={()=>{setDraft(null);setPreview(null);}}>Cancel</Button><Button loading={saving} onClick={save}>Confirm recipient</Button></div></>}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    </DialogContent></Dialog>
  </section>;
}