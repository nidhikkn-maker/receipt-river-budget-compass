// @vitest-environment node
import {it,expect} from 'vitest';
import {settlementProposal,outstandingAccrual} from './accounting-settlement';
import {reverseAccountingJournal,type AccountingJournal} from './accounting-journal';
import {corporateStatements,corporateCloseErrors} from './corporate-statements';
import {emptyBooks} from './types';
import {extractedOpening} from './opening-extraction';
import type {Expense} from '../expenses';
import type {VaultDoc} from '../documents';
const accrual:AccountingJournal={id:'rent',entityId:'A',date:'2026-04-30',kind:'accrual',description:'April rent unpaid',documentIds:['doc'],legs:[{code:'expense:rent',label:'Rent',role:'expense',debit:1200,credit:0},{code:'payable:rent',label:'Rent payable',role:'liability',debit:0,credit:1200}]};
const payment={id:'bank-payment',title:'Rent paid',date:'2026-05-02',entityId:'A',entitySource:'manual',accountId:'bank',amount:500,originalAmount:500,currency:'INR',category:'rent',txnType:'expense',allocations:[],receipts:[],splits:[],scope:'business',fxRate:1,paymentMethod:'other',description:'',merchant:null,memberId:null,reconciledAt:'2026-05-03',statementRef:'test-bank-line'} as Expense;
const anchor=(j:AccountingJournal)=>({...payment,id:j.id,date:j.date,accountId:null,txnType:'adjustment',receiptDetails:{accounting:{journal:j,primary:true,requestId:j.id}}}) as Expense;
it('partial settlement recognises rent once, moves cash once and preserves exact reversible source history',()=>{
 const settlement=settlementProposal({id:'settlement',accrual,balanceCode:'payable:rent',entry:payment,journals:[accrual],documentIds:['bank-doc']});
 const args={entityId:'A',entities:[{id:'A',name:'Test Ltd',kind:'company' as const,pan:'',gstins:[],booksFrom:'2026-27'}],accounts:[{id:'bank',name:'Bank',kind:'current' as const,openingBalance:0,archived:false}],books:{...emptyBooks(),entityAccounts:{A:['bank']}},documents:[{id:'doc',entityId:'A',filePath:'owner/rent.pdf'},{id:'bank-doc',entityId:'A',filePath:'owner/bank.pdf',transactionId:payment.id}] as VaultDoc[],from:'2026-04-01',to:'2027-03-31'};
 const w=corporateStatements({...args,entries:[anchor(accrual),payment,anchor(settlement)]});expect(w.profit).toBe(-1200);expect(w.cash.operating).toBe(-500);expect(w.liabilities).toBe(700);expect(w.trialDifference).toBe(0);expect(w.balanceDifference).toBe(0);expect(w.cash.difference).toBe(0);expect(outstandingAccrual(accrual,'payable:rent',[accrual,settlement])).toBe(700);
 expect(()=>settlementProposal({id:'again',accrual,balanceCode:'payable:rent',entry:payment,journals:[accrual,settlement],documentIds:[]})).toThrow('already settled');
 const reversal=reverseAccountingJournal(settlement,'reverse','2026-05-04','Correct settlement attribution');expect(outstandingAccrual(accrual,'payable:rent',[accrual,settlement,reversal])).toBe(1200);expect(reversal.settlement?.snapshot.amount).toBe(500);
 expect(corporateCloseErrors([w])).toEqual([]);
 expect(corporateCloseErrors([{...w,issues:[{recordId:'missing-original',message:'Retained original unavailable'}]}])).toContain('Test Ltd: Retained original unavailable');
 expect(corporateCloseErrors([{...w,trialDifference:0.01}])).toContain('Test Ltd: Financial statements do not agree.');
});
it('receivable settlement removes duplicate cash income, not accrued revenue, and keeps cash flow once',()=>{
 const sale:AccountingJournal={...accrual,id:'sale',legs:[{code:'receivable',label:'Customer',role:'asset',debit:3000,credit:0},{code:'income:sales',label:'Sales',role:'income',debit:0,credit:3000}]};
 const receipt={...payment,id:'receipt',amount:1000,originalAmount:1000,txnType:'income' as const,category:'sales'};
 const s=settlementProposal({id:'receipt-settle',accrual:sale,balanceCode:'receivable',entry:receipt,journals:[sale],documentIds:['bank-doc']});
 const w=corporateStatements({entityId:'A',entities:[{id:'A',name:'Test Ltd',kind:'company',pan:'',gstins:[],booksFrom:'2026-27'}],accounts:[{id:'bank',name:'Bank',kind:'current',openingBalance:0,archived:false}],books:{...emptyBooks(),entityAccounts:{A:['bank']}},documents:[{id:'doc',entityId:'A',filePath:'owner/sale.pdf'},{id:'bank-doc',entityId:'A',filePath:'owner/bank.pdf',transactionId:receipt.id}] as VaultDoc[],entries:[anchor(sale),receipt,anchor(s)],from:'2026-04-01',to:'2027-03-31'});
 expect(w.profit).toBe(3000);expect(w.cash.operating).toBe(1000);expect(w.balances.find(b=>b.code==='receivable')?.closing).toBe(2000);expect(w.trialDifference).toBe(0);expect(w.balanceDifference).toBe(0);expect(w.cash.difference).toBe(0);
});
it('rejects overpayment and cross-company settlement without silently accepting differences',()=>{
 expect(()=>settlementProposal({id:'s',accrual,balanceCode:'payable:rent',entry:{...payment,amount:1200.01},journals:[accrual],documentIds:[]})).toThrow('exceeds');
 expect(()=>settlementProposal({id:'s',accrual,balanceCode:'payable:rent',entry:{...payment,entityId:'B'},journals:[accrual],documentIds:[]})).toThrow('matching company');
});
it('maps printed opening assets, liabilities and equity only and refuses unknown directions or ambiguous banks',()=>{
 const rec={id:'fy',entityId:'A',fy:'2025-26',audited:{bank:100000,fixedAssets:50000,receivables:10000,loans:20000,payables:5000,capitalReserves:135000},docIds:['original'],schedules:[],qualifications:[],filedReturns:[],lossesCarriedForward:[]};
 const accounts=[{id:'bank',name:'Bank',kind:'current' as const,openingBalance:0,archived:false},{id:'loan',name:'Loan',kind:'loan' as const,openingBalance:0,archived:false}];const r=extractedOpening(rec,accounts,['bank','loan']);expect(r.gaps).toEqual([]);expect(r.date).toBe('2026-04-01');expect(r.targets.reduce((s,t)=>s+t.signedTarget,0)).toBe(0);expect(r.targets.find(t=>t.role==='equity')?.signedTarget).toBe(-135000);
 expect(extractedOpening({...rec,audited:{...rec.audited,taxBalances:500}},accounts,['bank','loan']).gaps.join()).toContain('direction');
 expect(extractedOpening(rec,[...accounts,{...accounts[0],id:'bank2',name:'Bank2',kind:'current',openingBalance:0,archived:false}],['bank','bank2','loan']).gaps.join()).toContain('exact company');
});