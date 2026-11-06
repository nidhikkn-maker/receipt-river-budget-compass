/** Supplementary GST working. Explicit owner-entered treatment, never inferred from party names. */
import type { GstInvoice } from './types';
export interface GstSpecial {
 treatment?: 'domestic'|'export_paid'|'export_lut'|'reverse_charge';
 supply?: 'goods'|'services';
 shippingBill?: string; shippingDate?: string; portCode?: string;
 rcmPaidOn?: string; rcmPaymentId?: string;
}
export interface GstAdvance {
 id:string; gstin:string; number:string; date:string; party:string; partyGstin:string;
 supply:'goods'|'services'; taxable:number; igst:number; cgst:number; sgst:number; cess:number;
 adjustments:{invoiceId:string;date:string;taxable:number;igst:number;cgst:number;sgst:number;cess:number}[];
 docId?:string;
}
const money=(n:number)=>Math.round(n*100)/100;
export function specialProblems(i:GstInvoice):string[]{
 const out:string[]=[];
 if(i.treatment==='export_lut'&&(i.igst||i.cgst||i.sgst||i.cess))out.push('Export under LUT has no output tax');
 if(i.treatment?.startsWith('export')&&i.kind!=='sales')out.push('Export treatment is for sales');
 if(i.treatment?.startsWith('export')&&(i.cgst||i.sgst))out.push('Exports cannot carry CGST or SGST');
 if(i.treatment==='reverse_charge'&&i.kind!=='purchase')out.push('Reverse-charge cash liability is recorded on purchases');
 if(i.rcmPaidOn&&!i.rcmPaymentId)out.push('Link the reverse-charge tax payment before claiming credit');
 return out;
}
export function advanceProblems(a:GstAdvance,invoices:GstInvoice[]):string[]{
 const out:string[]=[];
 for(const k of ['taxable','igst','cgst','sgst','cess'] as const){
  if(!Number.isFinite(a[k])||a[k]<0)out.push(`${k}: amount must be nonnegative`);
  if(a.adjustments.reduce((s,x)=>s+x[k],0)>a[k]+0.01)out.push(`${k}: adjustments exceed advance`);
 }
 for(const x of a.adjustments){const inv=invoices.find(i=>i.id===x.invoiceId);
  if(!inv||inv.gstin!==a.gstin||inv.kind!=='sales'||inv.note)out.push('Adjustment requires a sales invoice for the same GSTIN');
  if(x.date<a.date||inv&&x.date<inv.date)out.push('Adjustment cannot precede the advance or invoice');
 }
 return out;
}
export function advanceHeads(list:GstAdvance[],gstin:string,period:string){
 const h={taxable:0,igst:0,cgst:0,sgst:0,cess:0};
 for(const a of list.filter(a=>a.gstin===gstin&&a.supply==='services')){
  for(const k of ['taxable','igst','cgst','sgst','cess'] as const){
   if(a.date.slice(0,7)===period)h[k]+=a[k];
   for(const x of a.adjustments)if(x.date.slice(0,7)===period)h[k]-=x[k];
  }
 }
 return Object.fromEntries(Object.entries(h).map(([k,v])=>[k,money(v)])) as typeof h;
}
export function specialSummary(list:GstInvoice[],gstin:string,period:string){
 const mine=list.filter(i=>i.gstin===gstin&&i.date.slice(0,7)===period);
 const exports=mine.filter(i=>i.kind==='sales'&&i.treatment?.startsWith('export'));
 const reverse=mine.filter(i=>i.kind==='purchase'&&i.treatment==='reverse_charge');
 return {exports,reverse,exportTaxable:money(exports.reduce((s,i)=>s+i.taxable,0)),reverseCash:money(reverse.reduce((s,i)=>s+i.igst+i.cgst+i.sgst+i.cess,0))};
}