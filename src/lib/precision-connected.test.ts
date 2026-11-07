import { expect, it } from 'vitest';
import { accountBalance, cashflow, type Account } from './ledger';
import { buildReport } from './reports';
import { taxDraft } from './tax-summary';
import { bookSchedule, taxSchedule, type Asset } from './assets';
import { scopedBudgetUsage, type ScopedBudget } from './preferences';
import type { Expense } from './expenses';
import { buildReportDoc, emptyFilters, type ReportData } from './report-centre';
import { buildPortfolio } from './portfolio';
import { slab } from './books/tax-full';
const entry=(id:string,amount:number,patch:Partial<Expense>={}):Expense=>({id,amount,originalAmount:amount,currency:'INR',fxRate:1,title:id,merchant:id,category:'Food',scope:'business',date:'2026-11-07',splits:[],memberId:null,receipts:[],description:'',paymentMethod:'bank_transfer',reconciledAt:null,statementRef:null,accountId:'bank',...patch});
it('same isolated ledger agrees with balances, transfers, split budget, tax and report precision',()=>{
 const records=[entry('income',1.31,{txnType:'income'}),entry('a',0.1),entry('b',0.2),entry('transfer',0.3,{txnType:'transfer',toAccountId:'other'})];
 const original=JSON.stringify(records);
 const bank={id:'bank',kind:'savings',openingBalance:0,name:'Bank'} as Account;
 expect(accountBalance(bank,records)).toBe(0.71);
 expect(accountBalance({...bank,id:'other'},records)).toBe(0.3);
 expect(cashflow(records,'2026-11-01','2026-11-30').spent).toBe(0.3);
 expect(taxDraft('2026-27',records,[])).toMatchObject({income:1.31,businessSpend:0.3,workingProfit:1.01});
 expect(buildReport('categories',records,()=> 'Me',{}).rows[0]?.slice(1,4)).toEqual(['0.30','0.00','0.30']);
 const budget:ScopedBudget={id:'budget',name:'Food',kind:'category',value:'Food',amount:1,period:'monthly',start:'2026-11-01',carry:false};
 expect(scopedBudgetUsage(budget,[entry('split',1,{category:'Other',allocations:[{category:'Food',amount:0.3},{category:'Other',amount:0.7}]})],'2026-11-07')).toMatchObject({spent:0.3,remaining:0.7});
 expect(JSON.stringify(records)).toBe(original);
 const data:ReportData={transactions:records,accounts:[bank,{...bank,id:'other'}],commitments:[],loans:[],valuations:[],budgets:{},trips:[],drafts:[],today:'2026-11-07',memberName:()=> 'Me',accountName:id=>id ?? ''};
 expect(buildReportDoc('monthly',emptyFilters('2026-11-01','2026-11-30'),data).summary).toContainEqual(['Total expenses','INR 0.30']);
});
it('investment flows and saved NAV gain retain exact decimal reference, and slab intermediate stays unrounded',()=>{
 const investment={id:'fund',name:'Fund',kind:'investment',openingBalance:0} as Account;
 const snapshots=[{id:'first',accountId:'fund',value:0.1,valuedOn:'2026-11-01',source:'MFapi / AMFI NAV'},{id:'last',accountId:'fund',value:0.31,valuedOn:'2026-11-07',source:'MFapi / AMFI NAV'}];
 const portfolio=buildPortfolio([investment],[entry('flow',0.2,{txnType:'investment',toAccountId:'fund'})],snapshots,{asOf:'2026-11-07'});
 expect(portfolio.holdings[0]).toMatchObject({reference:0.3,gain:0.01,netFlows:0.2});
 expect(slab(10.05,[[0,0],[Infinity,0.1]])).toBe(1.005);
});
it('depreciation half-cent rounds half-up and book/tax schedules retain exact closing value',()=>{
 const asset:Asset={id:'asset',name:'Test',cost:10.05,kind:'building',bookMethod:'slm',bookRatePct:10,sharePct:100,inUse:'2026-04-01'};
 expect(bookSchedule(asset,'2026-27')[0]).toMatchObject({depreciation:1.01,closing:9.04});
 expect(taxSchedule(asset,'2026-27')[0]).toMatchObject({depreciation:1.01,closing:9.04});
});