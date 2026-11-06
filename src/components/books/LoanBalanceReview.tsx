import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStore } from '@/lib/store';
import { useBooks } from './useBooks';
import { standaloneLoanBalances, validateLoanBalance } from '@/lib/books/loan-balances';
import { money } from '@/lib/expenses';
export function LoanBalanceReview({ loan }: { loan: { id: string; name: string; accountId: string | null; status: string } }) {
 const { documents }=useStore(); const { books,save }=useBooks();
 const [docId,setDocId]=useState(''); const [amount,setAmount]=useState(''); const [asOf,setAsOf]=useState(''); const [quote,setQuote]=useState(''); const [confirmed,setConfirmed]=useState(false);
 const today=new Date().toISOString().slice(0,10);
 const row=standaloneLoanBalances([loan],books.loanBalances??[],documents,today).rows[0];
 if(loan.accountId || loan.status==='closed') return null;
 const sources=documents.filter(d=>d.loanId===loan.id && d.docType==='loan_statement');
 return <details className="mt-3 border-t pt-3 text-xs"><summary className="cursor-pointer font-medium">Lender balance · {row?.evidence?`${money(row.evidence.amount)} as of ${row.evidence.asOf}`:row?.conflict?'Conflicting source balances':'Needs dated statement evidence'}</summary>
  {!row?.evidence && <p className="py-2 text-destructive">Not included in net worth until a dated lender balance is confirmed.</p>}
  <div className="mt-2 grid gap-2">
   <label>Lender statement<select aria-label={`Lender statement for ${loan.name}`} className="mt-1 w-full rounded-md border bg-background p-2" value={docId} onChange={e=>{setDocId(e.target.value);setConfirmed(false);}}><option value="">Choose linked statement</option>{sources.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
   <div className="grid grid-cols-2 gap-2"><label>Outstanding (₹)<Input aria-label={`Lender outstanding for ${loan.name}`} type="number" min="0" value={amount} onChange={e=>{setAmount(e.target.value);setConfirmed(false);}}/></label><label>Balance date<Input aria-label={`Lender balance date for ${loan.name}`} type="date" max={today} value={asOf} onChange={e=>{setAsOf(e.target.value);setConfirmed(false);}}/></label></div>
   <label>Printed balance line / page<Input aria-label={`Balance source for ${loan.name}`} value={quote} onChange={e=>{setQuote(e.target.value);setConfirmed(false);}}/></label>
   <label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I checked this outstanding balance and date against the lender statement.</label>
   <Button size="sm" variant="outline" disabled={!confirmed||amount.trim()===''} onClick={async()=>{
    try{const e={id:crypto.randomUUID(),loanId:loan.id,amount:Number(amount),asOf,docId,sourceQuote:quote,confirmedAt:new Date().toISOString()};validateLoanBalance(e,loan.id,documents,today);await save({loanBalances:[...(books.loanBalances??[]).filter(x=>!(x.loanId===loan.id&&x.asOf===asOf)),e]});setConfirmed(false);toast.success('Dated lender balance saved');}catch(e){toast.error((e as Error).message);}
   }}>Confirm lender balance</Button>
  </div>
  {(books.loanBalances??[]).filter(e=>e.loanId===loan.id).map(e=><div className="flex items-center justify-between gap-2 border-b py-2" key={e.id}><span>{money(e.amount)} · {e.asOf}<span className="block text-muted-foreground">{e.sourceQuote}</span></span><Button size="sm" variant="ghost" onClick={async()=>{if(!window.confirm('Remove this lender balance observation?'))return;await save({loanBalances:(books.loanBalances??[]).filter(x=>x.id!==e.id)});}}>Remove</Button></div>)}
 </details>;
}