import {it,expect} from 'vitest';
import {reconciliationExceptions,reconciliationDestination} from './reconciliation-exceptions';
import {reconciliationManifestReport} from './reconciliation-manifest';
import {emptyBooks} from './types';
import type {Expense} from '../expenses';
import type {VaultDoc} from '../documents';
import {reportFigureEvidence} from '../report-figure-evidence';
import {emptyFilters} from '../report-centre';
const entry=(id:string,amount:number,extra:Partial<Expense>={}):Expense=>({id,title:'Acme Traders',merchant:'Acme Traders',description:'',date:'2025-10-01',category:'Other',scope:'business',memberId:null,splits:[],receipts:[],currency:'INR',originalAmount:amount,fxRate:1,amount,paymentMethod:'cash',accountId:'a',statementRef:`original:${id}`,reconciledAt:null,...extra});
const account={id:'a',name:'Alpha bank',kind:'savings' as const,openingBalance:1000,archived:false};
const docs=[{id:'invoice-source',title:'Original invoice',filePath:'owner/invoice.pdf',docDate:'2025-10-01',transactionId:null}] as VaultDoc[];
const input=()=>({today:'2026-11-08',entities:[{id:'A',name:'Alpha',kind:'company' as const,pan:'',gstins:['GA'],booksFrom:'2025-26'}],accounts:[account],docs,loans:[],holdings:[],entries:[entry('paid',40)],books:{...emptyBooks(),entityAccounts:{A:['a']},gstInvoices:[{id:'invoice',gstin:'GA',kind:'purchase' as const,number:'I1',date:'2025-10-01',party:'Acme Traders',partyGstin:'',taxable:100,igst:0,cgst:0,sgst:0,cess:0,docId:'invoice-source'}]}});
it('old-year comparison retains exact registration, invoice and unique payment; unrelated company cannot settle it',()=>{
 const p=input();const f=reconciliationExceptions({...p,entries:[...p.entries,entry('other',60,{accountId:'b'})],books:{...p.books,entityAccounts:{A:['a'],B:['b']}}}).find(i=>i.comparison?.family==='supplier');
 expect(f?.fy).toBe('2025-26');expect(f?.comparison?.difference).toBe(60);expect(f?.comparison?.left.inputs.map(i=>i.id)).toEqual(['invoice']);expect(f?.comparison?.right.inputs.map(i=>i.id)).toEqual(['paid']);
 expect(f&&reconciliationDestination(f)).toContain('/audit#comparison-');
 expect(reconciliationManifestReport(f?[f]:[]).rows).toHaveLength(2);
 expect(reconciliationExceptions({...p,entries:[entry('paid',100)]}).filter(i=>i.comparison?.family==='supplier')).toEqual([]);
});
it('between-company evidence excludes every unrelated pair and repeated ledger identity',()=>{
 const p=input();const tx=[entry('AB',20,{txnType:'transfer',toAccountId:'b'}),entry('AC',30,{txnType:'transfer',toAccountId:'c'}),entry('AB',20,{txnType:'transfer',toAccountId:'b'})];
 const f=reconciliationExceptions({...p,entries:tx,books:{...emptyBooks(),entityAccounts:{A:['a'],B:['b'],C:['c']}}}).find(i=>i.key==='recon:inter:A:B');
 expect(f?.comparison?.left.amount).toBe(20);expect(f?.comparison?.left.inputs.map(i=>i.id)).toEqual(['AB','AB']);
 expect(f?.evidence).not.toContain('original:AC');
});
it('balance and cashflow dependencies reproduce decimal figures and exclude future and receiving-side duplicates',()=>{
 const rows=[entry('bill',200.25),entry('salary',500.5,{txnType:'income'}),entry('move',100,{txnType:'transfer',toAccountId:'b'}),entry('duplicate',100,{txnType:'transfer',toAccountId:'b',transferCounterpartOf:'move'}),entry('future',900,{date:'2027-01-01'})];
 const f=reportFigureEvidence([account],rows,rows.filter(e=>e.date==='2025-10-01'),emptyFilters('2025-10-01','2025-10-31'));
 const balance=f.find(i=>i.id==='balance:a');expect(balance?.amount).toBe(1200.25);expect(balance?.inputs.map(i=>i.id)).toEqual(['a','bill','salary','move']);
 expect(f.find(i=>i.id==='cashflow:net')?.amount).toBe(300.25);expect(f.find(i=>i.id==='cashflow:net')?.inputs.map(i=>i.id)).toEqual(['bill','salary']);
});