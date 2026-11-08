import { it,expect } from 'vitest';
import { advanceCrossProblems,advanceHeads,advanceProblems,specialProblems,proposeAdvanceAdjustment } from './gst-special';
import { gstr1,gstr1Json,gstr3b,gstr3bJson,gstr9,gstr9Heads,gstPayable } from './gst';
import type { GstInvoice } from './types';
const invoice=(patch:Partial<GstInvoice>):GstInvoice=>({id:'sale',gstin:'G',kind:'sales',number:'S1',date:'2026-10-01',party:'A',partyGstin:'',taxable:1000,igst:180,cgst:0,sgst:0,cess:0,...patch});
it('LUT exports have no output tax and cannot carry domestic tax',()=>{
 expect(specialProblems(invoice({treatment:'export_lut'}))).toContain('Export under LUT has no output tax');
 expect(gstr3b([invoice({treatment:'export_lut',igst:0})],'G','2026-10').outputTax).toBe(0);
 expect(gstr1([invoice({treatment:'export_lut',igst:0})],'G','2026-10').b2c.count).toBe(0);
 expect(gstr1Json([invoice({treatment:'export_lut',igst:0})],'G','2026-10').exp[0]?.exp_typ).toBe('WOPAY');
 expect(gstr3bJson([invoice({treatment:'export_lut',igst:0})],'G','2026-10').sup_details.osup_zero.txval).toBe(1000);
});
it('RCM is payable in cash even with regular input credit and credit waits for payment',()=>{
 const rcm=invoice({id:'rcm',kind:'purchase',treatment:'reverse_charge'});
 const normal=invoice({id:'input',kind:'purchase',igst:500});
 expect(gstPayable([rcm,normal],'G','2026-10').cashTotal).toBe(180);
 expect(gstr3b([rcm],'G','2026-10').itcClaimed).toBe(0);
 expect(gstr3b([{...rcm,rcmPaidOn:'2026-10-10',rcmPaymentId:'payment'}],'G','2026-10').itcClaimed).toBe(180);
});
it('late RCM payment gives credit once in the paid month and annual cash liability includes reverse charge',()=>{
 const rcm=invoice({id:'rcm',kind:'purchase',treatment:'reverse_charge',rcmPaidOn:'2026-11-10',rcmPaymentId:'payment'});
 expect(gstr3b([rcm],'G','2026-10',new Set()).itcClaimed).toBe(0);
 expect(gstr3b([rcm],'G','2026-11',new Set()).itcClaimed).toBe(180);
 expect(gstr3b([rcm],'G','2026-12',new Set()).itcClaimed).toBe(0);
 expect(gstr9([rcm],'G',2026,new Set()).table9.payable).toBe(180);
});
it('service advances add tax once then reverse only the reviewed invoiced portion; goods advances do not add tax',()=>{
 const a={id:'a',gstin:'G',number:'A1',date:'2026-09-01',party:'A',partyGstin:'',supply:'services' as const,taxable:1000,igst:180,cgst:0,sgst:0,cess:0,adjustments:[{invoiceId:'sale',date:'2026-10-01',taxable:500,igst:90,cgst:0,sgst:0,cess:0}]};
 expect(advanceHeads([a],'G','2026-09').igst).toBe(180);
 expect(advanceHeads([a],'G','2026-10').igst).toBe(-90);
 expect(advanceHeads([{...a,supply:'goods'}],'G','2026-09').igst).toBe(0);
 expect(advanceProblems({...a,adjustments:[{invoiceId:'sale',date:'2026-10-01',taxable:1001,igst:90,cgst:0,sgst:0,cess:0}]},[invoice({})])).toContain('taxable: adjustments exceed advance');
 expect(gstPayable([],'G','2026-10',undefined,undefined,[a]).cashTotal).toBe(0);
});it('advance adjustments may under-claim but never over-claim the advance tax rate',()=>{
 const a={id:'a',gstin:'G',number:'A1',date:'2026-09-01',party:'A',partyGstin:'',supply:'services' as const,taxable:1000,igst:180,cgst:0,sgst:0,cess:0,adjustments:[] as {invoiceId:string;date:string;taxable:number;igst:number;cgst:number;sgst:number;cess:number}[]};
 const inv=invoice({});
 // Pro-rata share for 500 of 1000 is 90: under-claim passes, over-claim is blocked.
 expect(advanceProblems({...a,adjustments:[{invoiceId:'sale',date:'2026-10-01',taxable:500,igst:80,cgst:0,sgst:0,cess:0}]},[inv])).toEqual([]);
 expect(advanceProblems({...a,adjustments:[{invoiceId:'sale',date:'2026-10-01',taxable:500,igst:95,cgst:0,sgst:0,cess:0}]},[inv])).toContain("igst: adjustment claims more than the advance's tax rate allows");
});
it('adjustments across advances together cannot exceed the invoice they settle',()=>{
 const inv=invoice({});
 const mk=(id:string,taxable:number,igst:number)=>({id,gstin:'G',number:id,date:'2026-09-01',party:'A',partyGstin:'',supply:'services' as const,taxable:2000,igst:360,cgst:0,sgst:0,cess:0,adjustments:[{invoiceId:'sale',date:'2026-10-01',taxable,igst,cgst:0,sgst:0,cess:0}]});
 expect(advanceCrossProblems([mk('a',600,108),mk('b',300,54)],[inv])).toEqual([]);
 expect(advanceCrossProblems([mk('a',600,108),mk('b',500,90)],[inv])).toContain('S1: advances adjust more taxable than the invoice carries');
 expect(advanceCrossProblems([mk('a',500,108),mk('b',500,90)],[inv])).toContain('S1: advances adjust more igst than the invoice carries');
});
it('annual per-head working breaks output, credit, reverse charge and carry into IGST/CGST/SGST/cess',()=>{
 const sales=invoice({id:'s1',date:'2026-06-10',taxable:1000,igst:180});
 const purchase=invoice({id:'p1',kind:'purchase',date:'2026-06-12',taxable:500,igst:0,cgst:45,sgst:45});
 const rcm=invoice({id:'r1',kind:'purchase',treatment:'reverse_charge',date:'2026-06-15',taxable:300,igst:54,rcmPaidOn:'2026-07-05',rcmPaymentId:'pay'});
 const h=gstr9Heads([sales,purchase,rcm],'G',2026);
 expect(h.output).toEqual({igst:180,cgst:0,sgst:0,cess:0});
 expect(h.itc).toEqual({igst:54,cgst:45,sgst:45,cess:0});
 expect(h.reverse).toEqual({igst:54,cgst:0,sgst:0,cess:0});
 expect(h.onInvoices.igst).toBe(54);
 expect(h.checks).toEqual([]);
});
it('per-head review flags credit on invoices that was never claimed',()=>{
 const purchase=invoice({id:'p2',kind:'purchase',date:'2026-06-12',taxable:500,igst:90,cgst:0,sgst:0});
 // No 2B eligibility: credit stays held, so the annual review names the head.
 const h=gstr9Heads([purchase],'G',2026,new Set());
 expect(h.itc.igst).toBe(0);
 expect(h.checks.some(c=>c.startsWith('IGST:'))).toBe(true);
 expect(h.checks.some(c=>c.startsWith('CGST:'))).toBe(false);
});
it('full-list validation rejects invalid targets on untouched advances and invalid adjustment money',()=>{
 const a={id:'a',gstin:'G',number:'A1',date:'2026-09-01',party:'A',partyGstin:'CUSTOMER',supply:'services' as const,taxable:1000,igst:180,cgst:0,sgst:0,cess:0,adjustments:[{invoiceId:'sale',date:'2026-10-01',taxable:500,igst:90,cgst:0,sgst:0,cess:0}]};
 expect(advanceCrossProblems([a],[invoice({gstin:'OTHER'})])).toContain('A1: Adjustment requires a current sales invoice for the same GSTIN');
 expect(advanceCrossProblems([a],[invoice({kind:'purchase'})])).toContain('A1: Adjustment requires a current sales invoice for the same GSTIN');
 expect(advanceCrossProblems([a],[invoice({note:'credit'})])).toContain('A1: Adjustment requires a current sales invoice for the same GSTIN');
 expect(advanceCrossProblems([a],[invoice({partyGstin:'DIFFERENT'})])).toContain('A1: Adjustment requires an invoice for the same customer GSTIN');
 expect(advanceCrossProblems([{...a,adjustments:[{...a.adjustments[0],invoiceId:'sale',date:'2026-10-01',taxable:-500,igst:0,cgst:0,sgst:0,cess:0}]}],[invoice({})])).toContain('A1: taxable: adjustment amount must be nonnegative');
});
it('different invoice rates propose only supported heads, preserve residual advance tax and refuse over-allocation',()=>{
 const a={id:'a',gstin:'G',number:'A1',date:'2026-09-01',party:'A',partyGstin:'',supply:'services' as const,taxable:1000,igst:180,cgst:0,sgst:0,cess:0,adjustments:[]};
 const lower=invoice({taxable:500,igst:60});const x=proposeAdvanceAdjustment(a,lower,500,[a]);expect(x).toEqual({invoiceId:'sale',date:'2026-10-01',taxable:500,igst:60,cgst:0,sgst:0,cess:0});
 const next={...a,adjustments:[x]};expect(advanceCrossProblems([next],[lower])).toEqual([]);expect(advanceHeads([next],'G','2026-10').igst).toBe(-60);
 expect(()=>proposeAdvanceAdjustment(next,lower,1,[next])).toThrow('remaining advance or invoice');
 const higher=invoice({taxable:500,igst:140});expect(proposeAdvanceAdjustment(a,higher,500,[a]).igst).toBe(90);
});
