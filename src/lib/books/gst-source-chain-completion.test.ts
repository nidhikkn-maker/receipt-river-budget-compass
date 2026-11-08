import {it,expect} from 'vitest';
import {emptyBooks,type GstInvoice} from './types';
import {derivedEvidence} from './derived-evidence';
import {gstr3b} from './gst';
import {itcReview} from './compliance';
const invoice:GstInvoice={id:'sale',gstin:'33AAAAA0000A1Z1',kind:'sales',number:'1',date:'2026-10-01',party:'Customer',partyGstin:'',taxable:1000,igst:0,cgst:90,sgst:90,cess:0,docId:'source-sale'};
it('material GST source chain agrees with reviewed report credit eligibility, including held originals',()=>{
 const books={...emptyBooks(),gstInvoices:[invoice,{...invoice,id:'purchase',kind:'purchase' as const,number:'2',party:'Supplier',cgst:45,sgst:45,docId:'source-purchase'}]};
 const keys=new Set(itcReview(books.gstInvoices,invoice.gstin,'2026-10').lines.filter(l=>l.eligible).map(l=>`${l.invoice.partyGstin}|${l.invoice.number}`));
 const chain=derivedEvidence({assets:[],books,docs:[{id:'source-sale',title:'Sale'},{id:'source-purchase',title:'Bill'}]})[0];
 expect(chain?.amount).toBe(gstr3b(books.gstInvoices,invoice.gstin,'2026-10',keys).netPayable);expect(chain?.amount).toBe(180);expect(chain?.inputs[1]?.amount).toBe(0);expect(chain?.inputs[1]?.source?.id).toBe('source-purchase');
});
it('later paid reverse charge retains the original and linked payment in the credit month',()=>{
 const books={...emptyBooks(),gstInvoices:[{...invoice,id:'rcm',kind:'purchase' as const,treatment:'reverse_charge' as const,rcmPaymentId:'payment',rcmPaidOn:'2026-11-01',docId:'rcm-source'}, {...invoice,id:'nov-sale',date:'2026-11-01'}]};
 const chain=derivedEvidence({assets:[],books,docs:[{id:'rcm-source',title:'RCM original'}],entryTitle:id=>id}) .find(r=>r.id.endsWith('2026-11'));
 expect(chain?.inputs.map(i=>i.amount)).toEqual([180,-180]);expect(chain?.inputs[1]?.source?.id).toBe('rcm-source');expect(chain?.amount).toBe(0);
});