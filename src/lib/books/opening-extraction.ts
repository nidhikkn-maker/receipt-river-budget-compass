import type {FyRecord,OpeningHead} from './types';
import type {Account} from '../ledger';
import type {AccountingLeg} from './accounting-journal';
import {nextFy} from './fy';
const mapping:Partial<Record<OpeningHead,{role:AccountingLeg['role'];credit?:boolean;kinds?:Account['kind'][]}>>={bank:{role:'asset',kinds:['current','savings']},cash:{role:'asset',kinds:['cash','wallet']},investments:{role:'asset',kinds:['investment','fixed_deposit']},fixedAssets:{role:'asset'},accumulatedDepreciation:{role:'asset',credit:true},capitalReserves:{role:'equity',credit:true},loans:{role:'liability',credit:true,kinds:['loan']},receivables:{role:'asset'},payables:{role:'liability',credit:true}};
/** Reuse Statement Desk's retained printed FY reading. Unknown tax/other direction never becomes a plug. */
export function extractedOpening(rec:FyRecord,accounts:Account[],linked:string[]){
 const gaps:string[]=[];
 const targets:(Omit<AccountingLeg,'debit'|'credit'>&{signedTarget:number})[]=[];
 for(const [key,amount] of Object.entries(rec.audited)){
  const head=key as OpeningHead;const rule=mapping[head];
  if(amount==null||!Number.isFinite(amount)){gaps.push(`${head}: unreadable amount`);continue;}
  if(!rule){if(amount!==0)gaps.push(`${head}: confirm asset/liability direction and detailed account mapping`);continue;}
  if(amount===0)continue;
  const fit=accounts.filter(a=>!a.archived&&linked.includes(a.id)&&rule.kinds?.includes(a.kind));
  if(rule.kinds&&fit.length!==1){gaps.push(`${head}: choose the exact company money account`);continue;}
  const account=fit[0];
  targets.push({code:account?`account:${account.id}`:`opening:${head}`,label:account?.name??head,role:rule.role,...(account?{accountId:account.id}:{}),signedTarget:(rule.credit?-1:1)*amount});
 }
 if(!rec.docIds.length)gaps.push('Retained source document is missing');
 if(!targets.some(t=>t.role==='equity'))gaps.push('Printed equity/capital is missing; no balancing capital was invented');
 return {targets,gaps,date:`${nextFy(rec.fy).slice(0,4)}-04-01`,documentIds:rec.docIds};
}