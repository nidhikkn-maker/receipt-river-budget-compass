import { it,expect } from 'vitest';
import { advanceHeads,advanceProblems,specialProblems } from './gst-special';
import { gstr1,gstr1Json,gstr3b,gstr3bJson,gstr9,gstPayable } from './gst';
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
});