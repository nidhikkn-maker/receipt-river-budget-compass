import { subtractMoney, sumMoney } from '../money';
import type { AccountingJournal,AccountingLeg } from './accounting-journal';
import type { CorporateBalance } from './corporate-statements';
/** Explicit signed opening targets; missing values remain missing. No balancing equity is derived. */
export function openingJournalProposal(p:{id:string;entityId:string;date:string;documentIds:string[];description:string;targets:(Omit<AccountingLeg,'debit'|'credit'> & {signedTarget:number})[];current:CorporateBalance[]}):AccountingJournal{
 if(!p.targets.length)throw Error('Confirm the complete opening trial balance first.');
 if(p.targets.some(t=>!Number.isFinite(t.signedTarget)))throw Error('Every opening target must come from a confirmed source.');
 if(sumMoney(p.targets.map(t=>t.signedTarget))!==0)throw Error('Opening assets, liabilities and equity do not balance. No difference was accepted.');
 const omitted=p.current.filter(c=>c.closing!==0&&!p.targets.some(t=>t.code===c.code));
 if(omitted.length)throw Error('Existing balances are missing from the opening mapping: '+omitted.map(c=>c.label).join(', '));
 const legs=p.targets.flatMap(t=>{const existing=p.current.find(c=>c.code===t.code);if(existing&&existing.role!==t.role)throw Error('Opening role differs from existing accounting evidence.');const delta=subtractMoney(t.signedTarget,existing?.closing??0);const {signedTarget:_target,...identity}=t;return delta?[{...identity,debit:Math.max(0,delta),credit:Math.max(0,-delta)}]:[];});
 if(!legs.length)throw Error('Opening figures already agree; no new posting is required.');
 if(sumMoney(legs.map(l=>subtractMoney(l.debit,l.credit)))!==0)throw Error('Opening movements do not balance against existing records. Resolve the difference first.');
 return {id:p.id,entityId:p.entityId,date:p.date,kind:'opening',description:p.description,documentIds:p.documentIds,legs};
}