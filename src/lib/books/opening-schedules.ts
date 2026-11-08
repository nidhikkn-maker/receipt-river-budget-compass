import type {FyRecord,OpeningHead} from './types';
import type {AccountingLeg} from './accounting-journal';
import {sumMoney} from '../money';
export interface OpeningScheduleRow {head:OpeningHead; detail:number; line:number; code:string; role:AccountingLeg['role']; accountId?:string; credit:boolean;}
/** Each printed detail appears once; aggregate/schedule disagreements remain blockers. */
export function detailedOpening(rec:FyRecord,rows:OpeningScheduleRow[]){
 const gaps:string[]=[];const seen=new Set<string>();
 const targets=rows.flatMap(r=>{
  const key=`${r.detail}:${r.line}`;const detail=rec.details?.[r.detail];const line=detail?.lines[r.line];
  if(seen.has(key)){gaps.push('Printed schedule line mapped twice.');return [];}seen.add(key);
  if(!line||!detail?.docId||!rec.docIds.includes(detail.docId)||!r.code||!['asset','liability','equity'].includes(r.role)||!Number.isFinite(line.amount)||line.amount<0){gaps.push('Confirm the printed line, retained original and balance-sheet classification.');return [];}
  return [{code:r.code,label:line.label,role:r.role,...(r.accountId?{accountId:r.accountId}:{}),signedTarget:r.credit?-line.amount:line.amount,source:{docId:detail.docId,page:line.page??null,quote:line.quote??'',head:r.head,detail:r.detail,line:r.line,printedAmount:line.amount}}];
 });
 for(const head of new Set(rows.map(r=>r.head))){const total=sumMoney(rows.filter(r=>r.head===head).map(r=>rec.details?.[r.detail]?.lines[r.line]?.amount??NaN));if(rec.audited[head]==null||total!==rec.audited[head])gaps.push(`${head}: detailed schedule differs from the printed control total.`);}
 for(const [head,amount] of Object.entries(rec.audited))if(amount!==0&&!rows.some(r=>r.head===head))gaps.push(`${head}: detailed opening schedule is missing.`);
 if(new Set(targets.map(t=>t.code)).size!==targets.length)gaps.push('Use a separate account code for every detailed balance.');
 if(sumMoney(targets.map(t=>t.signedTarget))!==0)gaps.push('Detailed opening debits and credits do not agree.');
 return {targets,gaps};
}