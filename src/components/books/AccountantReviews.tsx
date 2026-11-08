import {useEffect,useState} from 'react';
import {toast} from 'sonner';
import {useStore} from '@/lib/store';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import type {AccountingJournal} from '@/lib/books/accounting-journal';
export interface AccountantData {grants:{owner_id:string;accountant_id:string;entity_id:string;revoked_at:string|null}[];evidence:{id:string;owner_id:string;entity_id:string;journal:AccountingJournal}[];reviews:{id:string;journal_id:string;finding:string;note:string;actor_id:string;created_at:string}[];}
export function AccountantReviews({entityId}:{entityId?:string}){
 const store=useStore();const [data,setData]=useState<AccountantData|null>(null),[error,setError]=useState(''),[accountant,setAccountant]=useState('');
 const [notes,setNotes]=useState<Record<string,string>>({});const [ids,setIds]=useState<Record<string,string>>({});
 const load=async()=>{try{setData(await store.accountantData());setError('');}catch(e){setError((e as Error).message);}};
 useEffect(()=>{void load();},[store.userId,entityId]);
 return <details className="border-b py-3"><summary className="cursor-pointer text-sm font-semibold">Accountant review & access</summary><div className="space-y-3 pt-3">
 {error&&<p className="text-sm text-muted-foreground">{error}</p>}
 {data&&<>{entityId&&<div className="flex flex-wrap gap-2"><Input aria-label="Accountant account ID" placeholder="Verified accountant account ID" value={accountant} onChange={e=>setAccountant(e.target.value)}/><Button variant="outline" disabled={!/^[0-9a-f-]{36}$/i.test(accountant)} onClick={async()=>{try{await store.setAccountantGrant(entityId,accountant,false);await load();}catch(e){toast.error((e as Error).message);}}}>Grant review access</Button></div>}
 {data.grants.filter(g=>g.owner_id===store.userId&&g.entity_id===entityId).map(g=><div key={g.accountant_id} className="flex flex-wrap items-center gap-2 text-sm"><span>{g.accountant_id} · {g.revoked_at?'Revoked':'Review only'}</span><Button size="sm" variant="outline" onClick={async()=>{try{await store.setAccountantGrant(g.entity_id,g.accountant_id,!g.revoked_at);await load();}catch(e){toast.error((e as Error).message);}}}>{g.revoked_at?'Restore access':'Revoke access'}</Button></div>)}
 {data.evidence.filter(r=>!entityId||r.entity_id===entityId).map(r=><details key={r.id} className="border-b py-2"><summary className="cursor-pointer text-sm">{r.journal.date} · {r.journal.kind} · {r.journal.description}</summary><div className="space-y-2 py-2 text-sm">{r.journal.legs.map(l=><p key={l.code}>{l.label} · Dr {l.debit.toFixed(2)} · Cr {l.credit.toFixed(2)}</p>)}<p className="break-all text-muted-foreground">Originals: {r.journal.documentIds.join(', ')}</p>{r.journal.reversesId&&<p>Reversal of {r.journal.reversesId}</p>}{r.journal.settlement&&<p>Bank transaction {r.journal.settlement.entryId} · accrual {r.journal.settlement.journalId}</p>}{data.reviews.filter(n=>n.journal_id===r.id).map(n=><p key={n.id}>{n.created_at} · {n.finding}: {n.note} · {n.actor_id}</p>)}<Input aria-label={`Review note ${r.id}`} value={notes[r.id]??''} disabled={!!ids[r.id]} onChange={e=>setNotes({...notes,[r.id]:e.target.value})}/><Button size="sm" variant="outline" disabled={(notes[r.id]??'').trim().length<5} onClick={async()=>{const id=ids[r.id]??crypto.randomUUID();setIds({...ids,[r.id]:id});try{await store.reviewAccounting({id,owner:r.owner_id,journal:r.id,finding:'Accountant observation',note:notes[r.id]??''});setNotes({...notes,[r.id]:''});setIds({...ids,[r.id]:''});await load();}catch(e){toast.error((e as Error).message);}}}>{ids[r.id]?'Retry same review':'Save review note'}</Button></div></details>)}
 </>}
 </div></details>;
}