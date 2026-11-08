import { it, expect } from 'vitest';
import { investmentRecon, supplierRecon, customerRecon, allocatePayments } from './recon';
import type { GstInvoice } from './types';
import { withStates } from './audit';
it('a saved resolved note cannot suppress a still-present financial difference or missing invoice',()=>{
 const finding={key:'recon:source',type:'Reconciliation' as const,entity:'A',account:null,fy:null,risk:'high' as const,text:'Difference',evidence:'source',to:'/audit'};
 expect(withStates([finding],[{key:finding.key,status:'resolved',note:'Not evidence',at:'2026-11-08'}]).open).toEqual([finding]);
});
const invoice = (id:string,gstin:string,kind:GstInvoice['kind']='purchase'):GstInvoice => ({id,gstin,kind,number:id,date:'2026-10-01',party:'Acme Traders',partyGstin:'33ABCDE1234F1Z5',taxable:100,igst:0,cgst:0,sgst:0,cess:0});
it('same supplier across registrations cannot share or combine one ambiguous payment',()=>{
 const rows=supplierRecon([invoice('A','GA'),invoice('B','GB')],[{id:'p',amount:100,date:'2026-10-02',text:'Acme Traders'}],'2026-10-01','2026-10-31');
 expect(rows).toHaveLength(2);expect(rows.map(r=>[r.registration,r.invoiced,r.paid])).toEqual([['GA',100,0],['GB',100,0]]);
 expect(customerRecon([invoice('A','GA','sales'),invoice('B','GB','sales')],[{id:'p',amount:100,date:'2026-10-02',text:'Acme Traders'}],'2026-10-01','2026-10-31').map(r=>r.received)).toEqual([0,0]);
});
it('amended notes and duplicate payment IDs never double settle an invoice',()=>{
 const original=invoice('A','G');const credit={...original,id:'c',number:'CN',note:'credit' as const,originalNumber:'A',taxable:20};
 const replacement={...credit,id:'c2',number:'CN2',amendsId:'c',taxable:10};
 const payment={id:'p',amount:50,text:'A',date:'2026-10-02'};
 const result=allocatePayments([original,credit,replacement],[payment,payment],'2026-10-31');
 expect(result.lines[0]).toMatchObject({amount:90,allocated:50,outstanding:40,payments:['p']});expect(result.unallocated).toBe(0);
});
it('retained corporate actions preserve six-decimal units and ignore later trades',()=>{
 expect(investmentRecon([{isin:'I',name:'Fund',quantity:0.123457,asOf:'2026-10-02',lots:[{date:'2026-10-01',side:'buy',quantity:0.123456},{date:'2026-10-03',side:'buy',quantity:100}],events:[{isin:'I',date:'2026-10-02',kind:'bonus',quantity:0.000001}]}])).toEqual([]);
});
it('an unknown corporate-action quantity remains an exception even when printed units agree',()=>{
 expect(investmentRecon([{isin:'I',name:'Fund',quantity:10,lots:[{side:'buy',quantity:10}],events:[{isin:'I',date:'2026-10-02',kind:'split',quantity:null}]}])[0]).toMatchObject({difference:0,unresolved:[{kind:'split',quantity:null,isin:'I',date:'2026-10-02'}]});
});