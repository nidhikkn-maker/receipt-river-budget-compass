/** Balanced proposals bound to canonical entries, never a parallel cash ledger. */
import type { Expense } from '../expenses';
import type { Account } from '../ledger';
import { addMoney, roundMoney, subtractMoney, sumMoney } from '../money';
import type { VaultDoc } from '../documents';
import type { BooksData } from './types';
import { ownerOf } from './entity-accounts';
import { periodBlocker } from './periods';
export type AccountingRole = 'asset'|'liability'|'equity'|'income'|'expense';
export interface AccountingLeg { code:string; label:string; role:AccountingRole; debit:number; credit:number; accountId?:string|undefined; cashFlow?:'operating'|'investing'|'financing'|undefined; statutory?:import('./statutory-mappings').StatutoryMapping; source?:{docId:string;page:number|null;quote:string;head:string;detail:number;line:number;printedAmount:number}; }
export interface AccountingJournal { id:string; entityId:string; date:string; kind:'opening'|'accrual'|'advance'|'prepayment'|'depreciation'|'adjustment'|'reversal'; description:string; documentIds:string[]; legs:AccountingLeg[]; reversesId?:string; invoiceId?:string; settlement?:import('./accounting-settlement').SettlementSource; recurrence?:import('./accounting-recurring').AccountingRecurrence; recurringSource?:{templateId:string;date:string;amount:number}; }
export interface AccountingAttachment { journal:AccountingJournal; primary:boolean; requestId:string }
export function accountingErrors(j:AccountingJournal,accounts:Account[],books:BooksData,documents:VaultDoc[]):string[]{
 const out:string[]=[];
 if(!j.id||!j.entityId||!j.description?.trim())out.push('Journal identity, company and explanation are required.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(j.date)||Number.isNaN(Date.parse(j.date+'T00:00:00Z'))||new Date(j.date+'T00:00:00Z').toISOString().slice(0,10)!==j.date)out.push('Choose a valid journal date.');
 const lock=periodBlocker(books.closedPeriods.filter(p=>!p.entityId||p.entityId===j.entityId),j.date);if(lock)out.push(lock);
 if(!j.documentIds.length||j.documentIds.some(id=>!documents.some(d=>d.id===id&&d.entityId===j.entityId&&!!d.filePath)))out.push('Retained company originals are required for every journal.');
 if(j.legs.length<2)out.push('A journal requires at least two accounting legs.');
 const seen=new Set<string>();
 for(const l of j.legs){
  if(!l.code||!l.label||!['asset','liability','equity','income','expense'].includes(l.role))out.push('Every leg needs an account code, label and accounting role.');
  if(!Number.isFinite(l.debit)||!Number.isFinite(l.credit)||l.debit<0||l.credit<0||roundMoney(l.debit)!==l.debit||roundMoney(l.credit)!==l.credit||(l.debit>0)===(l.credit>0))out.push('Every leg requires one positive debit or credit, to two decimal places.');
  if(seen.has(l.code))out.push('Combine repeated accounting codes before posting.');seen.add(l.code);
  if(l.accountId){const a=accounts.find(a=>a.id===l.accountId);if(!a||a.archived||ownerOf(books.entityAccounts??{},l.accountId)!==j.entityId)out.push('Money accounts must belong to this company.');if(l.code!==`account:${l.accountId}`)out.push('Linked account codes must match their money account.');if(a&&((['loan','other_liability','credit_card'].includes(a.kind)?'liability':'asset')!==l.role))out.push('Linked account role conflicts with the money account.');}
  else if(l.code.startsWith('account:'))out.push('A money-account code requires its linked account.');
  if(j.kind==='opening'&&['income','expense'].includes(l.role))out.push('Opening balances cannot create income or expenses.');
 }
 if(subtractMoney(sumMoney(j.legs.map(l=>l.debit)),sumMoney(j.legs.map(l=>l.credit)))!==0)out.push('Debits and credits must agree exactly. Unexplained differences cannot be posted.');
 return [...new Set(out)];
}
export function assertAccountingJournal(j:AccountingJournal,accounts:Account[],books:BooksData,documents:VaultDoc[]){const errors=accountingErrors(j,accounts,books,documents);if(errors.length)throw Error(errors.join(' '));}
/** Explicit proposals only: amounts, document evidence and tax eligibility are never inferred. */
export function accrualProposal(p:{id:string;entityId:string;date:string;description:string;documentIds:string[];kind:'unpaid-expense'|'outstanding-income'|'supplier-advance'|'customer-advance'|'prepayment'|'release-prepayment'|'depreciation';amount:number;balance:Omit<AccountingLeg,'debit'|'credit'>;counter:Omit<AccountingLeg,'debit'|'credit'>}):AccountingJournal{
 const creditBalance=['unpaid-expense','customer-advance','release-prepayment','depreciation'].includes(p.kind);
 return {id:p.id,entityId:p.entityId,date:p.date,description:p.description,documentIds:p.documentIds,kind:p.kind.includes('advance')?'advance':p.kind.includes('prepayment')?'prepayment':p.kind==='depreciation'?'depreciation':'accrual',legs:[{...p.balance,debit:creditBalance?0:p.amount,credit:creditBalance?p.amount:0},{...p.counter,debit:creditBalance?p.amount:0,credit:creditBalance?0:p.amount}]};
}
export function reverseAccountingJournal(j:AccountingJournal,id:string,date:string,reason:string):AccountingJournal{if(reason.trim().length<5)throw Error('Write the correction reason.');return {...j,id,date,kind:'reversal',description:reason,reversesId:j.id,legs:j.legs.map(l=>({...l,debit:l.credit,credit:l.debit}))};}
export function journalTotal(j:AccountingJournal){return sumMoney(j.legs.map(l=>l.debit));}
export function journalAccountDelta(l:AccountingLeg){return l.role==='liability'?subtractMoney(l.credit,l.debit):subtractMoney(l.debit,l.credit);}
export function balancedGroups(lines:{groupId:string;debit:number;credit:number}[]):string[]{const sums=new Map<string,number>();for(const l of lines)sums.set(l.groupId,addMoney(sums.get(l.groupId)??0,l.debit,-l.credit));return [...sums].filter(([,n])=>n!==0).map(([id])=>id);}
export function journalFromEntry(e:Expense){return e.receiptDetails?.accounting;}