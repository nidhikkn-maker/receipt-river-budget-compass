import type { Expense, Scope } from './expenses';
import { SCOPES } from './expenses';
import type { FinancialReview } from './financial-review';
import type { FinancePreferences } from './preferences';
import type { Account } from './ledger';
import { INSTRUMENT_ACCOUNT_KINDS, INSTRUMENT_PAYMENT } from './payment-instruments';
export type MetadataPatch = { organisation?: string; scope?: Scope; category?: string; paymentInstrumentId?: string; tag?: string };
export const metadataConfig = (p: FinancePreferences) => ({ tags: p.tags, categories: p.categories, paymentInstruments: p.paymentInstruments });
export function metadataPreview(rows: FinancialReview[], patches: Map<string, MetadataPatch>, prefs: FinancePreferences, accounts: Account[]) {
 if (!rows.length || rows.length > 500) throw Error('Select between 1 and 500 transactions.');
 if (new Set(rows.map(r=>r.transaction.id)).size!==rows.length) throw Error('Duplicate selection.');
 const records: Expense[]=[], after: Expense[]=[], items:{id:string;revision:number;patch:MetadataPatch}[]=[], excluded:{id:string;title:string;reason:string}[]=[];
 for (const row of rows) {
  const e=row.transaction, patch=patches.get(e.id);
  let reason=(e.txnType??'expense')!=='expense' ? 'Resolve financial type first' : row.group==='conflict' ? 'Resolve conflicts first' :
   e.splits.length || e.allocations?.length || e.workspaceAllocations?.length || (e.reimbursementStatus??'none')!=='none' || Object.keys(e.reimbursement??{}).length ? 'Claims or split responsibility require individual review' :
   e.description.startsWith('Scheduled occurrence:') || e.description.startsWith('Reimbursed entries:') ? 'Linked workflow requires individual review' : '';
  if (!patch || !Object.keys(patch).length) reason ||= 'No verified change available';
  if (reason || !patch) {excluded.push({id:e.id,title:e.title,reason});continue;}
  if (patch.organisation && !prefs.tags.some(t=>t.group==='Organisation'&&t.name===patch.organisation)) throw Error('Choose configured organisation.');
  if (patch.category && !prefs.categories.some(c=>c.name===patch.category&&!c.archived)) throw Error('Choose active category.');
  if (patch.scope && !SCOPES.includes(patch.scope)) throw Error('Choose valid workspace.');
  if (patch.tag && !prefs.tags.some(t=>['Project','Event','Purpose','Client'].includes(t.group)&&`${t.group}: ${t.name}`===patch.tag)) throw Error('Choose configured activity.');
  const next={...e,...(patch.organisation?{department:patch.organisation}:{}),...(patch.scope?{scope:patch.scope}:{}),...(patch.category?{category:patch.category}:{}),...(patch.tag?{tags:[...new Set([...(e.tags??[]),patch.tag])]}:{})};
  if (patch.paymentInstrumentId) {
   const instrument=prefs.paymentInstruments.find(p=>p.id===patch.paymentInstrumentId&&!p.archived);
   const account=accounts.find(a=>a.id===e.accountId&&!a.archived);
   if (!instrument || !account || instrument.accountId!==e.accountId || !INSTRUMENT_ACCOUNT_KINDS[instrument.type].includes(account.kind)) {
    excluded.push({id:e.id,title:e.title,reason:'Payment method must preserve a compatible active source account'});continue;
   }
   next.paymentInstrumentId=instrument.id;next.paymentMethod=INSTRUMENT_PAYMENT[instrument.type];
  }
  if (JSON.stringify(next)===JSON.stringify(e)) {excluded.push({id:e.id,title:e.title,reason:'Already assigned'});continue;}
  records.push(e);after.push(next);items.push({id:e.id,revision:e.correctionRevision??0,patch});
 }
 if (!items.length) throw Error('No selected transactions are eligible for this mapping.');
 return {records,after,items,excluded,selected:rows.length,config:metadataConfig(prefs),fingerprint:JSON.stringify(records),accountFingerprint:JSON.stringify(accounts)};
}
export type MetadataPreview=ReturnType<typeof metadataPreview>;
export function metadataStillCurrent(p:MetadataPreview,transactions:Expense[],prefs:FinancePreferences,accounts:Account[]) {
 return JSON.stringify(p.records.map(e=>transactions.find(t=>t.id===e.id)))===p.fingerprint && JSON.stringify(metadataConfig(prefs))===JSON.stringify(p.config) && JSON.stringify(accounts)===p.accountFingerprint;
}