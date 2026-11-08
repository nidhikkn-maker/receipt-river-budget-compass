import {it,expect} from 'vitest';
import {supplierRecon,customerRecon} from './recon';
import type {GstInvoice} from './types';
const bill=(patch:Partial<GstInvoice>):GstInvoice=>({id:'a',gstin:'OWNER',kind:'sales',number:'A1',date:'2026-10-01',party:'Acme',partyGstin:'PARTY-A',taxable:100,igst:0,cgst:0,sgst:0,cess:0,...patch});
it('ambiguous narration never arbitrarily settles either party regardless of invoice order',()=>{
 const invoices=[bill({}),bill({id:'b',number:'B1',party:'Acme Traders',partyGstin:'PARTY-B'})];const p=[{id:'p',amount:100,text:'NEFT Acme Traders',date:'2026-10-02'}];
 expect(customerRecon(invoices,p,'2026-10-01','2026-10-31').map(r=>r.received)).toEqual([0,0]);
 expect(customerRecon([...invoices].reverse(),p,'2026-10-01','2026-10-31').map(r=>r.received)).toEqual([0,0]);
 const exact=customerRecon(invoices,[{...p[0],id:'p',amount:100,date:'2026-10-02',text:'NEFT Acme Traders PARTY-B'}],'2026-10-01','2026-10-31');expect(exact).toHaveLength(1);expect(exact[0]?.gstin).toBe('PARTY-A');
});
it('supplier and customer balances agree with current amendments and signed credit notes without counting replaced originals',()=>{
 const invoices=[bill({taxable:1000}),bill({id:'revised',amendsId:'a',taxable:800}),bill({id:'credit',number:'CN',note:'credit',originalNumber:'A1',taxable:200})];
 const payment=[{id:'p',amount:500,text:'Acme',date:'2026-10-02'}];
 expect(customerRecon(invoices,payment,'2026-10-01','2026-10-31')[0]).toMatchObject({invoiced:600,received:500,outstanding:100});
 expect(supplierRecon(invoices.map(i=>({...i,kind:'purchase'})),payment,'2026-10-01','2026-10-31')[0]).toMatchObject({invoiced:600,paid:500,difference:100});
});