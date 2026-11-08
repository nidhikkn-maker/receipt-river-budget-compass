import type {AccountingLeg} from './accounting-journal';
import type {CorporateWorking} from './corporate-statements';
import {addMoney,subtractMoney,sumMoney} from '../money';
export const STATUTORY_HEADS={ppe:'Property, plant and equipment',cash:'Cash and cash equivalents',receivables:'Trade receivables',payables:'Trade payables',borrowings:'Borrowings',equity:'Share capital / reserves',otherAsset:'Other assets',otherLiability:'Other liabilities',revenue:'Revenue from operations',otherIncome:'Other income',cost:'Expenses',depreciation:'Depreciation and amortisation'} as const;
export type StatutoryHead=keyof typeof STATUTORY_HEADS;
export interface StatutoryMapping {head:StatutoryHead;status:'confirmed'|'review';basis:string;framework:'Schedule III Division I';}
export function statutoryErrors(l:AccountingLeg){const m=l.statutory;if(!m)return ['Statutory classification requires professional review.'];const role=m.head==='equity'?'equity':['payables','borrowings','otherLiability'].includes(m.head)?'liability':['revenue','otherIncome'].includes(m.head)?'income':['cost','depreciation'].includes(m.head)?'expense':'asset';return m.status!=='confirmed'||m.framework!=='Schedule III Division I'||!Object.hasOwn(STATUTORY_HEADS,m.head)||m.basis.trim().length<5||l.role!==role?['Unsupported, uncertain or conflicting statutory classification requires professional review.']:[];}

/** Source-linked roll-forwards, not invented ageing, maturity, share or filing disclosures. */
export function statutorySchedules(w:CorporateWorking){
 const rows=(Object.keys(STATUTORY_HEADS) as StatutoryHead[]).map(head=>{
  const balances=w.balances.filter(b=>b.statutory?.head===head&&b.statutory.status==='confirmed');
  const creditNormal=['payables','borrowings','otherLiability','equity','revenue','otherIncome'].includes(head);
  const sign=creditNormal?-1:1;
  return {head,label:STATUTORY_HEADS[head],opening:sumMoney(balances.map(b=>sign*b.opening)),increases:sumMoney(balances.map(b=>creditNormal?b.credit:b.debit)),decreases:sumMoney(balances.map(b=>creditNormal?b.debit:b.credit)),closing:sumMoney(balances.map(b=>sign*b.closing)),lineIds:balances.flatMap(b=>b.lineIds)};
 });
 const issues=w.balances.filter(b=>!b.statutory||b.statutory.status!=='confirmed').map(b=>({recordId:b.code,message:'Company-specific statutory mapping requires professional review.'}));
 for(const row of rows)if(subtractMoney(row.closing,addMoney(row.opening,row.increases,-row.decreases))!==0)issues.push({recordId:row.head,message:'Statutory schedule does not reconcile.'});
 return {rows,issues,disclosures:['Receivable/payable ageing requires contractual due dates and party classifications.','Borrowing maturities, security and related-party details require loan terms.','Share capital movements, contingencies and commitments require retained legal evidence.','Tax/deferred-tax and official filing layouts require approved applicability and professional review.']};
}