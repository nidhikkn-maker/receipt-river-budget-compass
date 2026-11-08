// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {accountingErrors,accrualProposal,reverseAccountingJournal,type AccountingJournal} from './accounting-journal';
import {openingJournalProposal} from './opening-journal';
import {corporateStatements,corporateReport,CORPORATE_TYPES} from './corporate-statements';
import {emptyBooks} from './types';
import type {VaultDoc} from '../documents';
import type {Expense} from '../expenses';
import {continuousAudit} from './audit';
const doc={id:'doc',entityId:'A',filePath:'owner/original.pdf'} as VaultDoc;
const accounts=[{id:'bank',name:'Company bank',kind:'current' as const,openingBalance:0,archived:false}];
const books={...emptyBooks(),entityAccounts:{A:['bank']}};
const source={id:'s',entityId:'A',date:'2026-04-10',documentIds:['doc'],description:'Confirmed source accounting'};
const anchor=(j:AccountingJournal):Expense=>({id:j.id,title:j.description,merchant:null,category:'Accounting',scope:'business',memberId:null,splits:[],receipts:[],amount:100,originalAmount:100,currency:'INR',fxRate:1,date:j.date,description:j.description,paymentMethod:'other',reconciledAt:null,statementRef:null,txnType:'adjustment',entityId:'A',entitySource:'manual',receiptDetails:{accounting:{journal:j,primary:true,requestId:j.id}}});
const working=(entries:Expense[])=>corporateStatements({entityId:'A',entities:[{id:'A',name:'Isolated company',kind:'company',pan:'',gstins:[],booksFrom:'2026-27'}],accounts,books,documents:[doc],entries,from:'2026-04-01',to:'2027-03-31'});
describe('Accounting foundation financial rules',()=>{
 it('automatically keeps missing originals and unexplained opening balances visible in company audit exceptions',()=>{
  const items=continuousAudit({today:'2026-11-08',entities:[{id:'A',name:'Isolated company',kind:'company',pan:'',gstins:[],booksFrom:'2026-27'}],assets:[],entries:[],docs:[],accounts:[{...accounts[0],id:'bank',name:'Bank',kind:'current',archived:false,openingBalance:1000}],books,holdingsWithoutCost:[]});expect(items.some(i=>i.key.startsWith('accounting:A:bank')&&i.text.includes('unclassified'))).toBe(true);
 });
 it('requires exact balanced opening assets, liabilities, equity, loans, receivables and payables without inventing capital',()=>{
  const targets=[{code:'fixed',label:'Machine',role:'asset' as const,signedTarget:50000},{code:'receivable',label:'Debtors',role:'asset' as const,signedTarget:10000},{code:'loan',label:'Loan',role:'liability' as const,signedTarget:-20000},{code:'payable',label:'Creditors',role:'liability' as const,signedTarget:-5000},{code:'capital',label:'Capital',role:'equity' as const,signedTarget:-35000}];
  const j=openingJournalProposal({...source, date:'2026-04-01',targets,current:[]});expect(accountingErrors(j,accounts,books,[doc])).toEqual([]);const w=working([anchor(j)]);expect(w.profit).toBe(0);expect(w.assets).toBe(60000);expect(w.liabilities).toBe(25000);expect(w.equity).toBe(35000);expect(w.trialDifference).toBe(0);expect(w.cash.operating).toBe(0);
  expect(()=>openingJournalProposal({...source,targets:targets.slice(0,-1),current:[]})).toThrow('do not balance');
 });
 it('recognises unpaid expense and outstanding income before settlement with no cash flow',()=>{
  const expense=accrualProposal({...source,kind:'unpaid-expense',amount:1200,balance:{code:'payable',label:'Accrued supplier',role:'liability'},counter:{code:'expense:rent',label:'Rent',role:'expense'}});
  const income=accrualProposal({...source,id:'i',kind:'outstanding-income',amount:3000,balance:{code:'receivable',label:'Accrued customer',role:'asset'},counter:{code:'income:sales',label:'Revenue',role:'income'}});
  const w=working([anchor(expense),anchor(income)]);expect(w.profit).toBe(1800);expect(w.assets).toBe(3000);expect(w.liabilities).toBe(1200);expect(w.cash.closing).toBe(0);expect(w.balanceDifference).toBe(0);
 });
 it('keeps prepayments and supplier/customer advances out of profit until earned or consumed',()=>{
  for(const kind of ['supplier-advance','prepayment','customer-advance'] as const){const liability=kind==='customer-advance';const j=accrualProposal({...source,kind,amount:1200,balance:{code:liability?'advance:customer':'prepaid',label:'Advance',role:liability?'liability':'asset'},counter:{code:'cash-clearing',label:'Cash clearing',role:'asset'}});expect(accountingErrors(j,accounts,books,[doc])).toEqual([]);expect(working([anchor(j)]).profit).toBe(0);}
  const release=accrualProposal({...source,kind:'release-prepayment',amount:100,balance:{code:'prepaid',label:'Prepaid',role:'asset'},counter:{code:'expense:insurance',label:'Insurance',role:'expense'}});expect(working([anchor(release)]).profit).toBe(-100);
 });
 it('recognises depreciation once and preserves correction/reversal evidence in every statement',()=>{
  const j=accrualProposal({...source,kind:'depreciation',amount:250,balance:{code:'accumulated',label:'Accumulated depreciation',role:'asset'},counter:{code:'expense:depreciation',label:'Depreciation',role:'expense'}});
  const reverse=reverseAccountingJournal(j,'r','2026-04-20','Correct printed depreciation');const replacement={...j,id:'new',legs:j.legs.map(l=>({...l,debit:l.debit?200:0,credit:l.credit?200:0}))};const w=working([anchor(j),anchor(reverse),anchor(replacement)]);expect(w.profit).toBe(-200);expect(w.trialDifference).toBe(0);expect(w.lines.filter(l=>l.formula.includes('exact reversal'))).toHaveLength(2);for(const t of CORPORATE_TYPES)expect(corporateReport(w,t).rows.length).toBeGreaterThan(0);expect(JSON.stringify(w)).toContain('owner/original.pdf');
 });
 it('rejects missing originals, company leakage, one-cent differences and closed periods',()=>{
  const j=accrualProposal({...source,kind:'unpaid-expense',amount:100,balance:{code:'p',label:'Payable',role:'liability'},counter:{code:'e',label:'Expense',role:'expense'}});
  expect(accountingErrors(j,accounts,books,[]).join()).toContain('originals');expect(accountingErrors({...j,legs:[j.legs[0] as typeof j.legs[number],{code:'e',label:'Expense',role:'expense',debit:99.99,credit:0}]},accounts,books,[doc]).join()).toContain('agree exactly');expect(accountingErrors(j,accounts,{...books,closedPeriods:[{id:'c',from:'2026-04-01',to:'2026-04-30',closedOn:'2026-05-01',note:''}]},[doc]).join()).toContain('closed');expect(accountingErrors({...j,documentIds:['other']},accounts,books,[doc]).join()).toContain('originals');
 });
 it('refuses incomplete canonical journal membership instead of declaring a recovered posting complete',()=>{
  const j=accrualProposal({...source,kind:'prepayment',amount:100,balance:{code:'prepaid',label:'Prepaid',role:'asset'},counter:{code:'account:bank',label:'Bank',role:'asset',accountId:'bank',cashFlow:'operating'}});const e={...anchor(j),accountId:'bank',amount:100,adjustmentSign:-1 as const};const w=working([e]);expect(w.profit).toBe(0);expect(w.cash.operating).toBe(-100);expect(w.trialDifference).toBe(0);const bad=working([{...e,amount:99}]);expect(bad.issues.some(i=>i.message.includes('movement differ'))).toBe(true);
 });
});