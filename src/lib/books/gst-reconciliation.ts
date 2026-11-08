/** Reconcile saved GST workings with current invoices and uniquely evidenced ledger payments. */
import type { Expense } from '../expenses';
import type { EntityProfile } from '../entities';
import { fyOf } from '../entities';
import { subtractMoney } from '../money';
import { effectiveEntity } from './entity-accounts';
import { itcReview } from './compliance';
import { gstr1, gstr3b, matchGstPayments } from './gst';
import type { BooksData, SavedDraft } from './types';
import type { AuditItem } from './audit';

/** Replace the exact working key, retaining its identity and unrelated historical workings. */
export function replaceGstDrafts(saved: SavedDraft[], drafts: SavedDraft[]): SavedDraft[] {
 const key=(d:SavedDraft)=>`${d.ref}|${d.form}|${d.period}`;
 const replacements=new Map(drafts.map(d=>[key(d),{...d,id:saved.find(s=>key(s)===key(d))?.id??d.id}]));
 return [...saved.filter(d=>!replacements.has(key(d))),...replacements.values()];
}
export function gstReconciliation(books:BooksData,entities:EntityProfile[],entries:Expense[],today:string):AuditItem[]{
 const out:AuditItem[]=[];
 const registrations=[...new Set([...books.gstInvoices.map(i=>i.gstin),...(books.gstAdvances??[]).map(a=>a.gstin),...(books.savedDrafts??[]).map(d=>d.ref)])];
 for(const gstin of registrations){
  const owners=entities.filter(e=>e.gstins.includes(gstin));const owner=owners.length===1?owners[0]:undefined;
  const periods=[...new Set([...books.gstInvoices.filter(i=>i.gstin===gstin).map(i=>i.date.slice(0,7)),...(books.gstAdvances??[]).filter(a=>a.gstin===gstin).flatMap(a=>[a.date.slice(0,7),...a.adjustments.map(x=>x.date.slice(0,7))]),...(books.savedDrafts??[]).filter(d=>d.ref===gstin&&/^\d{4}-\d{2}$/.test(d.period)).map(d=>d.period)])].filter(m=>m<today.slice(0,7)).sort();
  const sources=(period:string)=>books.gstInvoices.filter(i=>i.gstin===gstin&&i.date.startsWith(period)).map(i=>i.docId||i.transactionId||i.id).join(', ');
  const add=(period:string,code:string,text:string,evidence:string)=>out.push({key:`recon:gst:${gstin}:${period}:${code}`,type:'Reconciliation',entity:owner?.id??gstin,account:null,fy:fyOf(`${period}-01`),risk:'high',text:`${gstin} ${period}: ${text}`,evidence,to:'/tax'} as AuditItem);
  const workings=periods.map(period=>{const keys=new Set(itcReview(books.gstInvoices,gstin,period).lines.filter(l=>l.eligible).map(l=>`${l.invoice.partyGstin}|${l.invoice.number.trim().toUpperCase()}`));return {period,one:gstr1(books.gstInvoices,gstin,period),three:gstr3b(books.gstInvoices,gstin,period,keys,books.gstAdvances)};});
  const pool=owner?entries.filter(e=>(e.txnType??'expense')==='expense'&&effectiveEntity(e,books.entityAccounts??{})===owner.id).filter(e=>owner.gstins.length===1||`${e.title} ${e.merchant??''} ${e.description}`.toUpperCase().includes(gstin.toUpperCase())).map(e=>({id:e.id,date:e.date,amount:e.amount,accountId:e.accountId,text:`${e.title} ${e.merchant??''} ${e.description}`})):[];
  const payments=matchGstPayments(workings.filter(w=>w.three.netPayable>0).map(w=>({period:w.period,amount:w.three.netPayable})),pool,{gstin});
  for(const w of workings){
   const payment=payments.find(p=>p.period===w.period);
   if(w.three.netPayable>0&&!payment?.paymentId)add(w.period,'payment',`GST cash liability INR ${w.three.netPayable.toFixed(2)} has no unique company payment`,sources(w.period));
   for(const [form,current,fields] of [['GSTR-1',w.one,['b2b','b2c','notes','exports']],['GSTR-3B',w.three,['outputTax','itcClaimed','netPayable']]] as const){
    const draft=(books.savedDrafts??[]).filter(d=>d.ref===gstin&&d.period===w.period&&d.form===form).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
    if(!draft)continue;
    const old=draft.data as Record<string,unknown>;if(!old||typeof old!=='object'){add(w.period,form,`${form} saved working cannot be compared`,draft.id);continue;}
    const now=current as unknown as Record<string,unknown>;const diffs:string[]=[];
    for(const field of fields){const a=old[field],b=now[field];if(typeof b==='number'){if(typeof a!=='number'||Math.abs(subtractMoney(a,b))>0.01)diffs.push(field);}else if(b&&typeof b==='object'){for(const k of ['taxable','igst','cgst','sgst','cess']){const bv=(b as Record<string,unknown>)[k],av=a&&typeof a==='object'?(a as Record<string,unknown>)[k]:undefined;if(typeof bv==='number'&&(typeof av!=='number'||Math.abs(subtractMoney(av,bv))>0.01))diffs.push(`${field}.${k}`);}}}
    if(diffs.length)add(w.period,form,`${form} frozen working differs from current invoices (${diffs.join(', ')})`,`${draft.id}, ${sources(w.period)}`);
   }
  }
 }
 return out;
}