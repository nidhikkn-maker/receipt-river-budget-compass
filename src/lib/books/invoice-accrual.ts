import type {AccountingJournal,AccountingLeg} from './accounting-journal';
import type {GstInvoice} from './types';
import {sumMoney,subtractMoney} from '../money';
/** Exact printed amounts plus confirmed mapping; never invent recoverable tax or a settlement. */
export function invoiceAccrualProposal(invoice:GstInvoice,p:{id:string;entityId:string;description:string;balance:Omit<AccountingLeg,'debit'|'credit'>;net:Omit<AccountingLeg,'debit'|'credit'>;tax?:Omit<AccountingLeg,'debit'|'credit'>;taxEligible:boolean}):AccountingJournal{
 if(invoice.transactionId)throw Error('Invoice already has a ledger entry; review it instead of posting twice.');
 if(!invoice.docId)throw Error('Retained invoice original required.');
 const tax=sumMoney([invoice.igst,invoice.cgst,invoice.sgst,invoice.cess]);const total=sumMoney([invoice.taxable,tax]);
 if(total<=0||[invoice.taxable,invoice.igst,invoice.cgst,invoice.sgst,invoice.cess].some(n=>!Number.isFinite(n)||n<0))throw Error('Printed invoice amounts are invalid.');
 if(p.taxEligible&&tax&&!p.tax)throw Error('Choose the confirmed tax account.');
 const purchase=invoice.kind==='purchase';const multiplier=invoice.note==='credit'?-1:1;
 const leg=(mapping:Omit<AccountingLeg,'debit'|'credit'>,signed:number):AccountingLeg=>({...mapping,debit:Math.max(0,signed*multiplier),credit:Math.max(0,-signed*multiplier)});
 const legs=[leg(p.balance,purchase?-total:total),leg(p.net,(purchase?1:-1)*(p.taxEligible?invoice.taxable:total))];
 if(p.taxEligible&&tax&&p.tax)legs.push(leg(p.tax,(purchase?1:-1)*tax));
 if(subtractMoney(sumMoney(legs.map(l=>l.debit)),sumMoney(legs.map(l=>l.credit)))!==0)throw Error('Invoice journal does not balance.');
 return {id:p.id,entityId:p.entityId,date:invoice.date,kind:'accrual',description:p.description,documentIds:[invoice.docId],invoiceId:invoice.id,legs};
}