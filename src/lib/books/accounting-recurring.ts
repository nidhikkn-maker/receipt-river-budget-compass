import type {AccountingJournal} from './accounting-journal';
import {reverseAccountingJournal} from './accounting-journal';
import {subtractMoney,sumMoney,roundMoney} from '../money';
export interface AccountingRecurrence {start:string;months:number;monthlyAmount:number;reverseNextDay:boolean;}
export function recurrenceErrors(r:AccountingRecurrence){return !/^\d{4}-\d{2}-01$/.test(r.start)||Number.isNaN(Date.parse(r.start))||!Number.isInteger(r.months)||r.months<1||r.months>120||!Number.isFinite(r.monthlyAmount)||r.monthlyAmount<=0||roundMoney(r.monthlyAmount)!==r.monthlyAmount?['Confirm a valid first month, 1–120 months and an exact positive monthly amount.']:[];}
async function stableId(key:string){const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)));const hex=Array.from(hash.slice(0,16),b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;}
/** Prepare only. Every occurrence retains its template/originals and uses the existing atomic journal path. */
export async function recurringProposals(template:AccountingJournal,journals:AccountingJournal[],asOf:string){
 const r=template.recurrence;if(!r)return [];
 if(recurrenceErrors(r).length)throw Error(recurrenceErrors(r).join(' '));
 if(!['accrual','prepayment'].includes(template.kind)||template.legs.length!==2||template.legs.some(l=>l.accountId)||journals.some(j=>j.reversesId===template.id&&!j.recurringSource))throw Error('Choose an unreversed two-leg noncash accrual or prepayment.');
 const balance=template.legs.find(l=>l.role==='asset'&&l.debit>0);const expense=template.legs.find(l=>l.role==='expense');
 const release=template.kind==='prepayment';if(release&&(!balance||!expense||expense.credit<=0||r.reverseNextDay))throw Error('Prepayment release needs a retained prepaid asset and expense reclassification; automatic release reversal is unsupported.');
 const out:AccountingJournal[]=[];let released=release?sumMoney(journals.filter(j=>j.recurringSource?.templateId===template.id&&j.kind!=='reversal'&&!journals.some(v=>v.reversesId===j.id)).map(j=>j.recurringSource?.amount??0)):0;
 for(let n=0;n<r.months;n++){
  const start=new Date(r.start+'T00:00:00Z');const end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+n+1,0));const date=end.toISOString().slice(0,10);if(date>asOf)break;if(date<template.date)throw Error('Recognition cannot precede its source.');
  // The posted accrual template already recognises its own month.
  if(!release&&date.slice(0,7)===template.date.slice(0,7)){if(r.reverseNextDay&&!journals.some(j=>j.reversesId===template.id)){const next=new Date(end);next.setUTCDate(next.getUTCDate()+1);const rd=next.toISOString().slice(0,10);if(rd<=asOf)out.push({...reverseAccountingJournal(template,await stableId(template.id+':reverse'),rd,'Scheduled accrual reversal'),recurringSource:{templateId:template.id,date,amount:sumMoney(template.legs.map(l=>l.debit))}});}continue;}
  const id=await stableId(`accounting:${template.entityId}:${template.id}:${date}`);const existing=journals.find(j=>j.id===id);
  if(existing){if(r.reverseNextDay&&!journals.some(j=>j.reversesId===id)){const next=new Date(end);next.setUTCDate(next.getUTCDate()+1);const rd=next.toISOString().slice(0,10);if(rd<=asOf)out.push(reverseAccountingJournal(existing,await stableId(id+':reverse'),rd,'Scheduled accrual reversal'));}continue;}
  const amount=release?Math.min(r.monthlyAmount,subtractMoney(balance?.debit??0,released)):r.monthlyAmount;if(amount<=0)break;
  released+=release?amount:0;
  const legs=release&&balance&&expense?[{...expense,debit:amount,credit:0},{...balance,debit:0,credit:amount}]:template.legs.map(l=>({...l,debit:l.debit>0?amount:0,credit:l.credit>0?amount:0}));
  const {recurrence:_unused,...base}=template;
  out.push({...base,id,date,description:`${template.description} · ${date.slice(0,7)}`,legs,recurringSource:{templateId:template.id,date,amount}});
 }
 return out;
}