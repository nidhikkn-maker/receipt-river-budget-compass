// @vitest-environment node
import {it,expect} from 'vitest';
import {corporateStatements,corporateCloseErrors} from './corporate-statements';
import {statutorySchedules} from './statutory-mappings';
import {emptyBooks} from './types';
import type {AccountingJournal} from './accounting-journal';
import type {Expense} from '../expenses';
import type {VaultDoc} from '../documents';
const journal:AccountingJournal={id:'j',entityId:'A',kind:'adjustment',date:'2025-04-30',description:'Loan repayment with interest',documentIds:['original'],legs:[{code:'account:bank',accountId:'bank',label:'Bank',role:'asset',debit:0,credit:7000,cashFlow:'financing',statutory:{head:'cash',framework:'Schedule III Division I',status:'confirmed',basis:'Bank cash evidence'}},{code:'account:loan',accountId:'loan',label:'Loan',role:'liability',debit:5000,credit:0,statutory:{head:'borrowings',framework:'Schedule III Division I',status:'confirmed',basis:'Verified loan schedule'}},{code:'expense:interest',label:'Interest',role:'expense',debit:2000,credit:0,statutory:{head:'cost',framework:'Schedule III Division I',status:'confirmed',basis:'Printed lender interest'}}]};
const entries:Expense[]=journal.legs.filter(l=>l.accountId).map((l,i)=>({id:'e'+i,title:'Loan repayment',merchant:null,scope:'business',memberId:null,splits:[],fxRate:1,description:'Printed repayment',paymentMethod:'bank_transfer',reconciledAt:null,statementRef:null,amount:i===0?7000:5000,originalAmount:i===0?7000:5000,accountId:l.accountId??null,date:journal.date,txnType:'adjustment',adjustmentSign:-1,entityId:'A',entitySource:'manual',category:'Accounting',receipts:[],currency:'INR',receiptDetails:{accounting:{journal,primary:i===0,requestId:'r'}}}));
const args={entityId:'A',entities:[{id:'A',name:'Company',kind:'company' as const,pan:'',gstins:[],booksFrom:'2025-26'}],accounts:[{id:'bank',name:'Bank',kind:'current' as const,openingBalance:0,archived:false},{id:'loan',name:'Loan',kind:'loan' as const,openingBalance:0,archived:false}],books:{...emptyBooks(),entityAccounts:{A:['bank','loan']}},documents:[{id:'original',entityId:'A',filePath:'owner/loan.pdf'},{id:'statement',entityId:'A',filePath:'owner/bank.csv'}] as VaultDoc[],from:'2025-04-01',to:'2026-03-31'};
it('unreconciled cash journal prevents closing even when every arithmetic difference is zero',()=>{
 const w=corporateStatements({...args,entries});expect(w.trialDifference).toBe(0);expect(w.balanceDifference).toBe(0);expect(w.cash.difference).toBe(0);expect(corporateCloseErrors([w])).toContain('Company: Cash journal has not been reconciled to a retained statement line.');
});
it('one bank payment splits INR 5000 financing and INR 2000 operating, retaining bank and lender originals',()=>{
 const w=corporateStatements({...args,entries:entries.map(e=>({...e,reconciledAt:'2025-05-01',statementRef:'statement:line-1'}))});expect(w.cash.operating).toBe(-2000);expect(w.cash.financing).toBe(-5000);expect(w.profit).toBe(-2000);expect(corporateCloseErrors([w])).toEqual([]);expect(w.lines[0]?.originalPaths).toEqual(['owner/loan.pdf','owner/bank.csv']);
});
it('statutory borrowing roll-forward retains exact source legs and does not invent maturity disclosures',()=>{
 const w=corporateStatements({...args,entries});const r=statutorySchedules(w);expect(r.rows.find(r=>r.head==='borrowings')).toMatchObject({opening:0,increases:0,decreases:5000,closing:-5000,lineIds:['journal:j:1']});expect(r.issues).toEqual([]);
});