// @vitest-environment node
import {it,expect} from 'vitest';
import {detailedOpening} from './opening-schedules';
import {openingJournalProposal} from './opening-journal';
import {recurringProposals} from './accounting-recurring';
import {reverseAccountingJournal,type AccountingJournal} from './accounting-journal';
import {saveAccountantNote} from './accountant-notes';
import {statutoryErrors} from './statutory-mappings';
it('detailed bank, machinery, customers, suppliers, lender and equity schedules balance and retain every printed locator',()=>{
 const heads=['bank','fixedAssets','receivables','loans','payables','capitalReserves'] as const;const values=[100000,50000,10000,20000,5000,135000];
 const rec={id:'fy',entityId:'A',fy:'2025-26',audited:Object.fromEntries(heads.map((h,i)=>[h,values[i]])),docIds:['original'],schedules:[],qualifications:[],filedReturns:[],lossesCarriedForward:[],details:[{schedule:'trialBalance' as const,docId:'original',lines:heads.map((h,i)=>({label:h,amount:values[i]??0,page:1,quote:`Printed ${h}`}))}]};
 const rows=heads.map((head,i)=>({head,detail:0,line:i,code:head,role:i===5?'equity' as const:i>=3?'liability' as const:'asset' as const,credit:i>=3}));const result=detailedOpening(rec,rows);expect(result.gaps).toEqual([]);
 const j=openingJournalProposal({id:'o',entityId:'A',date:'2026-04-01',documentIds:rec.docIds,description:'Reviewed detailed opening',targets:result.targets,current:[]});expect(j.legs.reduce((s,l)=>s+l.debit,0)).toBe(160000);expect(j.legs.reduce((s,l)=>s+l.credit,0)).toBe(160000);expect(j.legs[2]?.source).toMatchObject({docId:'original',page:1,line:2,printedAmount:10000});
 expect(detailedOpening(rec,[...rows,rows[0] as typeof rows[number]]).gaps.join()).toContain('twice');expect(detailedOpening({...rec,audited:{...rec.audited,bank:100000.01}},rows).gaps.join()).toContain('differs');expect(detailedOpening(rec,rows.slice(1)).gaps.join()).toContain('missing');
});
const prepaid:AccountingJournal={id:'policy',entityId:'A',date:'2026-04-01',kind:'prepayment',description:'Insurance paid in advance',documentIds:['original'],legs:[{code:'prepaid',label:'Prepaid insurance',role:'asset',debit:100,credit:0},{code:'expense:insurance',label:'Insurance',role:'expense',debit:0,credit:100}],recurrence:{start:'2026-04-01',months:3,monthlyAmount:33.33,reverseNextDay:false}};
it('recurring prepaid releases retain original, stable identities and remaining cents without exceeding cost',async()=>{
 const rows=await recurringProposals(prepaid,[prepaid],'2026-06-30');expect(rows.map(j=>j.recurringSource?.amount)).toEqual([33.33,33.33,33.33]);expect(rows[0]?.legs[0]?.debit).toBe(33.33);expect(rows[0]?.legs[1]?.credit).toBe(33.33);expect((await recurringProposals(prepaid,[prepaid],'2026-06-30'))[0]?.id).toBe(rows[0]?.id);expect(await recurringProposals(prepaid,[prepaid,...rows],'2026-06-30')).toEqual([]);
 const four={...prepaid,recurrence:{...prepaid.recurrence as NonNullable<AccountingJournal['recurrence']>,months:4}};expect((await recurringProposals(four,[four,...rows],'2026-07-31'))[0]?.recurringSource?.amount).toBe(.01);
 expect(await recurringProposals(prepaid,[prepaid,reverseAccountingJournal(prepaid,'r','2026-04-02','Cancel original policy')],'2026-06-30').catch(e=>e.message)).toContain('unreversed');
});
it('recurring accrual produces exact next-day reversal only after posting and never recreates a reversed occurrence',async()=>{
 const rent:AccountingJournal={...prepaid,id:'rent',date:'2026-03-31',kind:'accrual',legs:[{code:'expense:rent',label:'Rent',role:'expense',debit:1200,credit:0},{code:'payable:rent',label:'Rent payable',role:'liability',debit:0,credit:1200}],recurrence:{start:'2026-04-01',months:2,monthlyAmount:1200,reverseNextDay:true}};
 const april=(await recurringProposals(rent,[rent],'2026-04-30'))[0];if(!april)throw Error('Missing April');const reversal=(await recurringProposals(rent,[rent,april],'2026-05-01'))[0];expect(reversal?.date).toBe('2026-05-01');expect(reversal?.legs[0]?.credit).toBe(1200);if(!reversal)throw Error('Missing reversal');expect(await recurringProposals(rent,[rent,april,reversal],'2026-05-01')).toEqual([]);
});
it('a posted accrual template is not recognised twice in its own month',async()=>{const rent:AccountingJournal={...prepaid,kind:'accrual',date:'2026-04-30',recurrence:{start:'2026-04-01',months:2,monthlyAmount:100,reverseNextDay:false}};expect(await recurringProposals(rent,[rent],'2026-04-30')).toEqual([]);expect((await recurringProposals(rent,[rent],'2026-05-31'))).toHaveLength(1);});
it('interrupted committed review reads identical note without another append and refuses altered retry',async()=>{
 const p={id:'note',owner:'owner',journal:'j',finding:'Observation',note:'Inspect printed classification'};let saved:typeof p|null=null,writes=0;const io={read:async()=>saved,write:async()=>{writes++;saved={...p};throw Error('Lost response');}};await saveAccountantNote(p,io);await saveAccountantNote(p,io);expect(writes).toBe(1);await expect(saveAccountantNote({...p,note:'Changed payload'},io)).rejects.toThrow('differs');
});
it('unsupported and conflicting statutory working classifications stay for professional review',()=>{
 const leg=prepaid.legs[0];if(!leg)throw Error('Missing leg');expect(statutoryErrors(leg)).toHaveLength(1);expect(statutoryErrors({...leg,statutory:{head:'otherAsset',status:'confirmed',basis:'Reviewed insurance original',framework:'Schedule III Division I'}})).toEqual([]);expect(statutoryErrors({...leg,statutory:{head:'borrowings',status:'confirmed',basis:'Reviewed insurance original',framework:'Schedule III Division I'}})).toHaveLength(1);
});