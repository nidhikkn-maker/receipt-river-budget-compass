import { it, expect } from 'vitest';
import { standaloneLoanBalances, validateLoanBalance, type LoanBalanceEvidence } from './loan-balances';
const loan={id:'l1',name:'Vehicle loan',accountId:null,status:'active',principal:900000,original:1000000};
const doc={id:'d1',loanId:'l1',docType:'loan_statement' as const};
const evidence:LoanBalanceEvidence={id:'e1',loanId:'l1',amount:800000,asOf:'2026-10-05',docId:'d1',sourceQuote:'Principal outstanding 800000',confirmedAt:'2026-11-06T05:00:00Z'};
it('uses dated confirmed lender balance, never original or undated register principal',()=>{
 const r=standaloneLoanBalances([loan],[evidence],[doc],'2026-11-06');expect(r.amount).toBe(800000);expect(r.asOf).toBe('2026-10-05');
 const absent=standaloneLoanBalances([loan],[],[doc],'2026-11-06');expect(absent.amount).toBe(0);expect(absent.missing).toEqual(['Vehicle loan']);
});
it('never counts linked loan accounts again',()=>expect(standaloneLoanBalances([{...loan,accountId:'a1'}],[evidence],[doc],'2026-11-06').rows).toEqual([]));
it('decimal lender evidence totals retain each source and exclude linked liabilities',()=>{
 const amounts=[1.005,0.1,0.2];
 const loans=amounts.map((_,i)=>({...loan,id:`l${i}`}));
 const documents=loans.map(l=>({...doc,id:`doc-${l.id}`,loanId:l.id}));
 const balances=loans.map((l,i)=>({...evidence,id:`e-${l.id}`,loanId:l.id,docId:`doc-${l.id}`,amount:amounts[i]??0}));
 const result=standaloneLoanBalances([...loans,{...loan,id:'linked',accountId:'bank'}],balances,documents,'2026-11-06');
 expect(result.amount).toBe(1.31);expect(result.missing).toEqual([]);
 expect(result.rows.map(r=>r.evidence?.docId)).toEqual(['doc-l0','doc-l1','doc-l2']);
});
it('selects latest eligible date and excludes future evidence',()=>{
 const r=standaloneLoanBalances([loan],[evidence,{...evidence,id:'e2',amount:750000,asOf:'2026-11-01'},{...evidence,id:'e3',amount:700000,asOf:'2026-12-01'}],[doc],'2026-11-06');expect(r.amount).toBe(750000);expect(r.asOf).toBe('2026-11-01');
});
it('removed or reassigned statements invalidate reliance on the balance',()=>{expect(standaloneLoanBalances([loan],[evidence],[],'2026-11-06').missing).toEqual(['Vehicle loan']);expect(()=>validateLoanBalance(evidence,'l1',[{...doc,loanId:'another'}],'2026-11-06')).toThrow(/linked/);});
it('conflicting same-date lender balances remain unresolved',()=>{const r=standaloneLoanBalances([loan],[evidence,{...evidence,id:'e2',amount:1}],[doc],'2026-11-06');expect(r.amount).toBe(0);expect(r.rows[0]?.conflict).toBe(true);});
it('refuses negative balances, impossible dates and absent source confirmation',()=>{
 expect(()=>validateLoanBalance({...evidence,amount:-1},'l1',[doc],'2026-11-06')).toThrow(/non-negative/);
 expect(()=>validateLoanBalance({...evidence,asOf:'2026-02-30'},'l1',[doc],'2026-11-06')).toThrow(/valid/);
 expect(()=>validateLoanBalance({...evidence,sourceQuote:''},'l1',[doc],'2026-11-06')).toThrow(/Confirm/);
});
it('zero lender outstanding is a recorded zero, unlike missing evidence',()=>{const r=standaloneLoanBalances([loan],[{...evidence,amount:0}],[doc],'2026-11-06');expect(r.amount).toBe(0);expect(r.missing).toEqual([]);});
import { proposePrintedBalance } from './loan-balances';
const f=(label:string,value:string,page:number|null=2)=>({label,value,page,quote:`${label}: ${value}`,confidence:'high' as const,status:'read' as const});
it('proposes the printed outstanding and its as-on date from a lender statement',()=>{
 const p=proposePrintedBalance({docType:'loan_statement',docDate:'2026-10-31',fields:[f('Principal Outstanding','₹1,03,74,241'),f('Balance as on','05/10/2026')]});
 expect(p).toEqual({amount:10374241,asOf:'2026-10-05',sourceQuote:'Principal Outstanding: ₹1,03,74,241 (page 2)',ambiguous:false});
});
it('falls back to the document date and refuses conflicting printed figures',()=>{
 expect(proposePrintedBalance({docType:'loan_statement',docDate:'2026-10-31',fields:[f('Outstanding balance','500000')]})).toMatchObject({amount:500000,asOf:'2026-10-31'});
 expect(proposePrintedBalance({docType:'loan_statement',docDate:null,fields:[f('Outstanding balance','500000'),f('Closing principal','490000')]})).toMatchObject({ambiguous:true});
});
it('never proposes from other document types or unreadable values',()=>{
 expect(proposePrintedBalance({docType:'invoice',docDate:null,fields:[f('Outstanding balance','5000')]})).toBeNull();
 expect(proposePrintedBalance({docType:'loan_statement',docDate:null,fields:[f('Outstanding balance','see page 3')]})).toBeNull();
});
