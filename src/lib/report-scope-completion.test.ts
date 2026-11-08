import { it, expect } from 'vitest';
import { buildReportDoc,emptyFilters,type ReportData } from './report-centre';
import type { Expense } from './expenses';
const entry:Expense={id:'a',title:'Source A',merchant:null,category:'Food',scope:'business',memberId:null,splits:[],receipts:[{name:'bill',path:'owner/doc-a',type:'image/png'}],amount:200.25,originalAmount:200.25,currency:'INR',fxRate:1,date:'2026-10-01',description:'',paymentMethod:'cash',accountId:'bank-a',statementRef:'statement-a'};
const data:ReportData={transactions:[entry,{...entry,id:'b',accountId:'bank-b',amount:888.88}],accounts:[{id:'bank-a',name:'Alpha',kind:'savings',openingBalance:1000,archived:false},{id:'bank-b',name:'Excluded Beta',kind:'savings',openingBalance:10000,archived:false}],commitments:[],loans:[],valuations:[],trips:[],drafts:[],budgets:{},memberName:()=>'',accountName:id=>id??'',today:'2026-10-31'};
const filters={...emptyFilters('2026-10-01','2026-10-31'),accountIds:['bank-a']};
it.each(['monthly','forecast','wealth'] as const)('%s totals cannot include an excluded account balance',type=>{
 const report=buildReportDoc(type,filters,data);expect(JSON.stringify(report)).not.toContain('Excluded Beta');expect(report.summary).toContainEqual([type==='wealth'?'Assets':type==='forecast'?'Cash available today':'Available balances (today)','INR 799.75']);
});
it('frozen report source identity lists only selected entries and retained evidence',()=>{
 const report=buildReportDoc('expense',filters,data);expect(report.sourceEntryIds).toEqual(['a']);expect(report.sourceDocumentRefs).toEqual(['statement-a','owner/doc-a']);
 data.transactions[0]={...entry,amount:300};expect(report.summary).toContainEqual(['Total expenses (gross)','INR 200.25']);data.transactions[0]=entry;
});