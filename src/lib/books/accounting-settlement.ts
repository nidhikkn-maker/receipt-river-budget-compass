/** Reclassify an existing bank posting; never create another bank movement or recognise profit twice. */
import type {Expense} from '../expenses';
import {categoryParts} from '../expenses';
import {subtractMoney,sumMoney} from '../money';
import type {AccountingJournal} from './accounting-journal';
export interface SettlementSource {entryId:string; journalId:string; balanceCode:string; amount:number; snapshot:{date:string;amount:number;accountId:string;txnType:string;category:string;allocations:NonNullable<Expense['allocations']>};}
export function outstandingAccrual(j:AccountingJournal,code:string,journals:AccountingJournal[]):number{
 const balance=j.legs.find(l=>l.code===code);
 if(!balance||!['asset','liability'].includes(balance.role)||balance.accountId)throw Error('Choose an outstanding noncash receivable or payable.');
 if(journals.some(r=>r.reversesId===j.id))throw Error('The accrual was reversed. Review its replacement.');
 const sign=balance.role==='liability'?-1:1;
 const related=journals.filter(r=>r.settlement?.journalId===j.id&&r.settlement.balanceCode===code);
 const reversed=new Set(journals.filter(r=>r.kind==='reversal').map(r=>r.reversesId));
 return subtractMoney(sign*subtractMoney(balance.debit,balance.credit),sumMoney(related.filter(r=>r.kind!=='reversal'&&!reversed.has(r.id)).map(r=>r.settlement?.amount??0)));
}
export function settlementProposal(p:{id:string;accrual:AccountingJournal;balanceCode:string;entry:Expense;journals:AccountingJournal[];documentIds:string[]}):AccountingJournal{
 const {entry:e,accrual:j}=p;const balance=j.legs.find(l=>l.code===p.balanceCode);
 if(!balance||j.kind==='opening'||j.kind==='reversal')throw Error('Choose a posted accrual, not opening or reversal evidence.');
 const kind=e.txnType??'expense';const payable=balance.role==='liability';
 if(kind!==(payable?'expense':'income')||e.entityId!==j.entityId||!e.accountId||e.currency!=='INR'||e.date<j.date||e.receiptDetails?.accounting||e.transferCounterpartOf)throw Error('Choose the matching company INR bank payment or receipt after this accrual.');
 const reversed=new Set(p.journals.filter(r=>r.kind==='reversal').map(r=>r.reversesId));
 if(p.journals.some(r=>r.kind!=='reversal'&&!reversed.has(r.id)&&r.settlement?.entryId===e.id))throw Error('Bank transaction already settled.');
 if(!(e.amount>0)||e.amount>outstandingAccrual(j,p.balanceCode,p.journals))throw Error('Payment exceeds the outstanding accrual; split or review the difference first.');
 const parts=categoryParts(e);if(sumMoney(parts.map(l=>l.amount))!==e.amount)throw Error('Bank category allocation differs from its amount.');
 const role:'expense'|'income'=payable?'expense':'income';
 return {id:p.id,entityId:j.entityId,date:e.date,kind:'adjustment',description:`Settle ${j.description} against ${e.title}`,documentIds:[...new Set([...j.documentIds,...p.documentIds])],settlement:{entryId:e.id,journalId:j.id,balanceCode:p.balanceCode,amount:e.amount,snapshot:{date:e.date,amount:e.amount,accountId:e.accountId,txnType:kind,category:e.category,allocations:e.allocations??[]}},legs:[{code:balance.code,label:balance.label,role:balance.role,debit:payable?e.amount:0,credit:payable?0:e.amount},...parts.map(l=>({code:`${role}:${l.category}`,label:l.category,role,debit:payable?0:l.amount,credit:payable?l.amount:0}))]};
}