// @vitest-environment node
import { describe,it,expect } from 'vitest';
import { corporateStatements,corporateReport,CORPORATE_TYPES } from './corporate-statements';
import { emptyBooks } from './types';
import { accountBalance } from '../ledger';
import { roundMoney } from '../money';
import type { Expense } from '../expenses';
import { buildReportDoc,emptyFilters } from '../report-centre';
import { toCsv,toExcel } from '../reports';
import type { VaultDoc } from '../documents';
const entry=(id:string,over:Partial<Expense>={}):Expense=>({id,title:id,merchant:'Synthetic Supplier',category:'Office',scope:'business',memberId:null,splits:[],receipts:[{path:`owner/${id}.pdf`,name:`${id}.pdf`,type:'application/pdf'}],amount:100,originalAmount:100,currency:'INR',fxRate:1,date:'2026-04-10',description:'',paymentMethod:'bank_transfer',reconciledAt:'2026-04-30',statementRef:'source-line',accountId:'bank',...over});
export const corporateFixture=()=>({entityId:'A',entities:[{id:'A',name:'Synthetic Alpha Ltd',kind:'company' as const,pan:'',gstins:['GA'],booksFrom:'2026-27'},{id:'B',name:'Excluded Beta',kind:'company' as const,pan:'',gstins:['GB'],booksFrom:'2026-27'}],
  accounts:[{id:'bank',name:'Alpha bank',kind:'current' as const,openingBalance:10000,archived:false},{id:'card',name:'Alpha card',kind:'credit_card' as const,openingBalance:0,archived:false},{id:'loan',name:'Alpha loan',kind:'loan' as const,openingBalance:2000,archived:false},{id:'asset',name:'Alpha machine',kind:'other_asset' as const,openingBalance:0,archived:false},{id:'beta',name:'Excluded Beta bank',kind:'current' as const,openingBalance:999999,archived:false}],
  books:{...emptyBooks(),entityAccounts:{A:['bank','card','loan','asset'],B:['beta']}},documents:[] as VaultDoc[],from:'2026-04-01',to:'2027-03-31',
  entries:[entry('sale',{txnType:'income',amount:5000,originalAmount:5000,category:'Sales'}),entry('bill',{amount:1000,originalAmount:1000}),entry('card-bill',{accountId:'card',amount:500,originalAmount:500}),entry('card-payment',{txnType:'card_payment',toAccountId:'card',amount:500,originalAmount:500}),entry('repayment',{txnType:'loan_repayment',toAccountId:'loan',amount:1100,originalAmount:1100,principal:1000,interest:100}),entry('asset-buy',{txnType:'investment',toAccountId:'asset',amount:2000,originalAmount:2000}),entry('beta-secret',{accountId:'beta',amount:7777,originalAmount:7777})]});
describe('Corporate statements canonical double-entry journey',()=>{
 it('balances every group and agrees with canonical bank/card/loan/assets without counting settlements as spending',()=>{
   const p=corporateFixture(),w=corporateStatements(p);
   expect(w.profit).toBe(3400);expect(w.trialDifference).toBe(0);expect(w.balanceDifference).toBe(0);
   for(const group of new Set(w.lines.map(l=>l.groupId)))expect(w.lines.filter(l=>l.groupId===group).reduce((s,l)=>s+l.debit-l.credit,0)).toBe(0);
   for(const a of p.accounts.filter(a=>a.id!=='beta')){const b=w.balances.find(b=>b.code===`account:${a.id}`);expect(b?.closing??0).toBe(roundMoney((a.kind==='loan'||a.kind==='credit_card'?-1:1)*accountBalance(a,p.entries))||0);}
   expect(w.cash).toEqual({opening:10000,operating:3400,investing:-2000,financing:-1000,unclassified:0,closing:10400,difference:0});
   expect(JSON.stringify(w)).not.toMatch(/beta-secret|Excluded Beta|7777|999999/);
 });
 it('keeps unclassified opening counterparts visible and never invents capital or zero gaps',()=>{
   const w=corporateStatements(corporateFixture());expect(w.unclassified).toBe(-8000);expect(w.issues.map(i=>i.recordId)).toEqual(['bank','loan']);expect(w.balances.some(b=>b.role==='equity')).toBe(false);
 });
 it('records cross-company transfers on both company sides as due balances, never income/expense',()=>{
   const p=corporateFixture();p.entries=[entry('cross',{txnType:'transfer',toAccountId:'beta',amount:123.45,originalAmount:123.45})];
   const a=corporateStatements(p),b=corporateStatements({...p,entityId:'B'});
   expect(a.balances.find(x=>x.code==='due:from:beta')?.closing).toBe(123.45);expect(b.balances.find(x=>x.code==='due:to:bank')?.closing).toBe(-123.45);expect(a.profit).toBe(0);expect(b.profit).toBe(0);expect(a.cash.financing).toBe(-123.45);expect(b.cash.financing).toBe(123.45);
 });
 it('preserves manually assigned externally paid company expense without moving the payer account',()=>{
   const p=corporateFixture();p.entries=[entry('manual',{accountId:'beta',entitySource:'manual',entityId:'A',amount:99.99,originalAmount:99.99})];const w=corporateStatements(p);
   expect(w.profit).toBe(-99.99);expect(w.balances.find(b=>b.code==='due:to:beta')?.closing).toBe(-99.99);expect(w.cash.closing).toBe(10000);expect(w.trialDifference).toBe(0);
 });
 it('uses original INR/category splits, refunds and dated inputs exactly; repeats never create postings',()=>{
   const p=corporateFixture();const split=entry('split',{amount:0.3,originalAmount:3,currency:'USD',fxRate:0.1,allocations:[{category:'A',amount:0.1},{category:'B',amount:0.2}]});
   p.entries=[split,split,entry('refund',{txnType:'refund',amount:0.1,originalAmount:0.1,category:'A'}),entry('old',{date:'2026-03-31',txnType:'income',amount:100,originalAmount:100}),entry('future',{date:'2027-04-01',amount:999})];
   const w=corporateStatements(p);expect(w.profit).toBe(-0.2);expect(w.balances.find(b=>b.code==='income:Office')?.opening).toBe(-100);expect(w.lines.filter(l=>l.entryId==='split')).toHaveLength(3);expect(w.lines.some(l=>l.entryId==='future')).toBe(false);expect(w.lines.find(l=>l.entryId==='split')?.originalAmount).toBe(3);expect(w.trialDifference).toBe(0);
 });
 it('retains invoice original paths, missing accrual checks and adjustment uncertainty',()=>{
   const p=corporateFixture();p.entries=[entry('adjust',{txnType:'adjustment',adjustmentSign:1})];p.books.gstInvoices=[{id:'unpaid',gstin:'GA',kind:'purchase',number:'S1',date:'2026-04-10',party:'Supplier',partyGstin:'',taxable:100,igst:0,cgst:0,sgst:0,cess:0}];
   const w=corporateStatements(p);expect(w.profit).toBe(0);expect(w.cash.unclassified).toBe(100);expect(w.issues.some(i=>i.recordId==='unpaid')).toBe(true);expect(w.lines.find(l=>l.entryId==='adjust')?.originalPaths).toEqual(['owner/adjust.pdf']);
 });
 it('recognises only posted canonical depreciation and never adds a second asset reduction',()=>{
   const p=corporateFixture();p.entries=[entry('dep',{txnType:'adjustment',accountId:'asset',adjustmentSign:-1,amount:50,originalAmount:50})];p.books.journals=[{id:'j',assetId:'machine',period:'2026-04',amount:50,kind:'book',status:'posted',transactionId:'dep'}];
   const w=corporateStatements(p);expect(w.profit).toBe(-50);expect(w.balances.find(b=>b.code==='account:asset')?.closing).toBe(-50);expect(w.trialDifference).toBe(0);
 });
 it('freezes each statement and full original evidence for saved/reloaded CSV/Excel, rejecting unavailable companies',async()=>{
   const p=corporateFixture();const data={transactions:p.entries,accounts:p.accounts,books:p.books,entities:p.entities,documents:p.documents,valuations:[],commitments:[],loans:[],budgets:{},trips:[],drafts:[],memberName:()=>'',accountName:()=>'',today:'2026-11-08'};
   for(const type of CORPORATE_TYPES){const doc=buildReportDoc(type,{...emptyFilters(p.from,p.to),entityId:'A'},data);const saved=JSON.parse(JSON.stringify(doc));expect(saved.corporateWorking.profit).toBe(3400);const r=corporateReport(saved.corporateWorking,type);expect(toCsv(r)).not.toContain('beta-secret');const {read,utils}=await import('xlsx');const book=read(await (await toExcel(r)).arrayBuffer(),{type:'array'});const sheet=book.Sheets['Report'];if(!sheet)throw Error('Missing sheet');expect(utils.sheet_to_json(sheet,{header:1})).toContainEqual(r.headers);}
   expect(()=>corporateStatements({...p,entityId:'missing'})).toThrow('available company');
 });
});