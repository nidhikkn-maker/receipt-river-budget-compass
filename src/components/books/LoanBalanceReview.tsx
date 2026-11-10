import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStore } from '@/lib/store';
import { useBooks } from './useBooks';
import { proposePrintedBalance, standaloneLoanBalances, validateLoanBalance, withConfirmedBalance, type LoanBalanceEvidence } from '@/lib/books/loan-balances';
import { archiveInList, restoreInList } from '@/lib/archive';
import { recordIsArchived, type Archivable } from '@/lib/records-archive';
import { ArchivedRecords, useArchiveFlow } from '@/components/ArchivedRecords';
import { money } from '@/lib/expenses';
export function LoanBalanceReview({ loan }: { loan: { id: string; name: string; accountId: string | null; status: string } }) {
 const { documents }=useStore(); const { books,save }=useBooks();
 const [docId,setDocId]=useState(''); const [amount,setAmount]=useState(''); const [asOf,setAsOf]=useState(''); const [quote,setQuote]=useState(''); const [confirmed,setConfirmed]=useState(false);
 const today=new Date().toISOString().slice(0,10);
 // No delete (P0-014): an observation is archived (still used, kept with who/when/why); a same-date confirmation supersedes it.
 const all: Archivable<LoanBalanceEvidence>[] = books.loanBalances ?? [];
 const flow = useArchiveFlow(async (req, who) => { await save({ loanBalances: req.mode === 'archive' ? archiveInList(all, req.id, who) : restoreInList(all, req.id, who) }); });
 const row=standaloneLoanBalances([loan],books.loanBalances??[],documents,today).rows[0];
 if(loan.accountId || loan.status==='closed') return null;
 const sources=documents.filter(d=>d.loanId===loan.id && d.docType==='loan_statement');
 return <details className="mt-3 border-t pt-3 text-xs"><summary className="cursor-pointer font-medium">Lender balance · {row?.evidence?`${money(row.evidence.amount)} as of ${row.evidence.asOf}`:row?.conflict?'Conflicting source balances':'Needs dated statement evidence'}</summary>
  {!row?.evidence && <p className="py-2 text-destructive">Not included in net worth until a dated lender balance is confirmed.</p>}
  <div className="mt-2 grid gap-2">
   <label>Lender statement<select aria-label={`Lender statement for ${loan.name}`} className="mt-1 w-full rounded-md border bg-background p-2" value={docId} onChange={e=>{const id=e.target.value;setDocId(id);setConfirmed(false);const d=documents.find(x=>x.id===id);const p=d?proposePrintedBalance(d):null;if(p&&!p.ambiguous){setAmount(String(p.amount));if(p.asOf)setAsOf(p.asOf);setQuote(p.sourceQuote);toast.message('Printed outstanding filled in — check it before confirming');}else if(p?.ambiguous)toast.warning(p.reason);}}><option value="">Choose linked statement</option>{sources.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
   <div className="grid grid-cols-2 gap-2"><label>Outstanding (₹)<Input aria-label={`Lender outstanding for ${loan.name}`} type="number" min="0" value={amount} onChange={e=>{setAmount(e.target.value);setConfirmed(false);}}/></label><label>Balance date<Input aria-label={`Lender balance date for ${loan.name}`} type="date" max={today} value={asOf} onChange={e=>{setAsOf(e.target.value);setConfirmed(false);}}/></label></div>
   <label>Printed balance line / page<Input aria-label={`Balance source for ${loan.name}`} value={quote} onChange={e=>{setQuote(e.target.value);setConfirmed(false);}}/></label>
   <label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I checked this outstanding balance and date against the lender statement.</label>
   <Button size="sm" variant="outline" disabled={!confirmed||amount.trim()===''} onClick={async()=>{
    try{const e={id:crypto.randomUUID(),loanId:loan.id,amount:Number(amount),asOf,docId,sourceQuote:quote,confirmedAt:new Date().toISOString()};validateLoanBalance(e,loan.id,documents,today);await save({loanBalances:withConfirmedBalance(all,e)});setConfirmed(false);toast.success('Dated lender balance saved');}catch(e){toast.error((e as Error).message);}
   }}>Confirm lender balance</Button>
  </div>
  {all.filter(e=>e.loanId===loan.id && !recordIsArchived(e)).map(e=><div className="flex items-center justify-between gap-2 border-b py-2" key={e.id}><span>{money(e.amount)} · {e.asOf}{e.supersededBy?' · replaced by a later confirmation':''}<span className="block text-muted-foreground">{e.sourceQuote}</span></span><Button size="sm" variant="ghost" aria-label={`Archive lender balance ${e.asOf}`} onClick={()=>flow.ask({mode:'archive',id:e.id,name:`${loan.name} · ${money(e.amount)} as of ${e.asOf}`,noun:'lender balance'})}>Archive</Button></div>)}
  <ArchivedRecords plain title="Archived lender balances · still used for what you owe" noun="lender balance" userId={flow.userId}
   items={all.filter(e=>e.loanId===loan.id && recordIsArchived(e)).map(e=>({id:e.id,name:`${loan.name} · ${money(e.amount)} as of ${e.asOf}`,detail:e.sourceQuote,state:e}))}
   onRestore={(it)=>flow.ask({mode:'restore',id:it.id,name:it.name,noun:'lender balance'})} />
  {flow.dialog}
 </details>;
}