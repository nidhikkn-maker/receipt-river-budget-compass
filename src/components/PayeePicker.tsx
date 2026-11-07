import { payeeDraft, type Payee } from '@/lib/payees';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
export function PayeePicker({payees,merchant,onSelect}:{payees:Payee[];merchant:string;onSelect:(name:string)=>void}) {
  const active=payees.filter(p=>!p.archived);
  if(!active.length)return null;
  const match=active.find(p=>p.name===merchant);
  return <Select value={match?.id??'manual'} onValueChange={id=>{const p=active.find(p=>p.id===id);if(p)onSelect(payeeDraft(p).merchant);}}><SelectTrigger aria-label="Saved recipient"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="manual">Merchant / payee · enter manually</SelectItem>{active.map(p=><SelectItem key={p.id} value={p.id}>{p.name} · {p.type}</SelectItem>)}</SelectContent></Select>;
}