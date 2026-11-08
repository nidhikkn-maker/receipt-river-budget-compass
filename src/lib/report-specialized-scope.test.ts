import {it,expect} from 'vitest';
import {buildReportDoc,emptyFilters,type ReportData} from './report-centre';
import type {Expense} from './expenses';
const e:Expense={id:'outside-window',title:'Historical balance source',category:'Food',merchant:null,scope:'personal',memberId:null,splits:[],receipts:[],amount:200,originalAmount:200,currency:'INR',fxRate:1,date:'2026-09-01',description:'',paymentMethod:'cash',accountId:'a',statementRef:'old-statement'};
const loan={id:'la',accountId:'a',name:'Alpha loan',principal:1250.25,rate:9,emi:100,nextDue:'2026-11-05',provider:'Bank',status:'active',payments:[]};
const data:ReportData={transactions:[e],accounts:[{id:'a',name:'Alpha',kind:'savings',openingBalance:1000,archived:false}],valuations:[],loans:[loan,{...loan,id:'lb',accountId:'b',name:'Excluded loan',principal:9999}],commitments:[],trips:[],drafts:[],budgets:{},memberName:()=>'',accountName:id=>id??'',today:'2026-10-31'};
it('filtered loan figures exclude another company account and unlinked loans',()=>{
 const d=buildReportDoc('loan',{...emptyFilters('2026-10-01','2026-10-31'),accountIds:['a']},{...data,loans:[...data.loans,{...loan,id:'lc',accountId:null,name:'Unlinked'}]});
 expect(d.summary).toContainEqual(['Outstanding principal','INR 1,250.25']);expect(d.sections[0]?.rows).toHaveLength(1);
});
it('balance snapshots include historical dependencies outside the report date window',()=>{
 const d=buildReportDoc('account',emptyFilters('2026-10-01','2026-10-31'),data);
 expect(d.sections[0]?.rows[0]?.[2]).toBe('800.00');expect(d.sourceEntryIds).toEqual(['outside-window']);expect(d.sourceDocumentRefs).toEqual(['old-statement']);
});
