import type { Expense } from '../expenses';
import type { StmtLine } from '../statement-pipeline/line';
import { accountBalance, type Account } from '../ledger';
/** Explicit cash-only account chosen by the owner. This is a check, never a posting/classification. */
export function brokerCashReconciliation(lines: StmtLine[], account: Account, entries: Expense[], closing: number|null) {
  const used=new Set<string>();
  const rows=lines.map(line=>{
    const candidates=entries.filter(e=>{
      if(used.has(e.id)||e.transferCounterpartOf||e.currency!==line.currency||e.date!==line.date||Math.abs(e.originalAmount-line.amount)>0.005)return false;
      const incoming=['income','refund','reimbursement','advance'].includes(e.txnType??'expense')?e.accountId===account.id:e.toAccountId===account.id;
      const outgoing=['expense','investment','transfer','card_payment','loan_repayment'].includes(e.txnType??'expense')&&e.accountId===account.id;
      if(line.direction==='credit'?!incoming:!outgoing)return false;
      const text=`${e.title} ${e.description??''} ${e.merchant??''}`.toLowerCase();
      const words=line.description.toLowerCase().split(/\W+/).filter(w=>w.length>=4&&!['payment','transfer','debit','credit'].includes(w));
      return words.some(w=>text.includes(w));
    });
    const match=candidates.length===1?candidates[0]:undefined;
    if(match)used.add(match.id);
    return {line,entry:match??null,state:match?'matched' as const:candidates.length>1?'ambiguous' as const:'missing' as const};
  });
  const date=lines.map(l=>l.date).sort().at(-1);
  const balance=accountBalance(account,entries,date);
  const foreign=lines.some(l=>l.currency!=='INR');
  return {rows,balance,difference:closing===null||foreign?null:Math.round((closing-balance)*100)/100,missing:rows.filter(r=>r.state!=='matched').length,foreign};
}