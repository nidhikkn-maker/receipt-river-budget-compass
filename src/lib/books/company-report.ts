import type { Expense } from '../expenses';
import { effectiveEntity,type EntityAccounts } from './entity-accounts';
import type { VaultDoc } from '../documents';
/** One owner-visible ledger and the existing manual/account company resolution. */
export function companyReportEntries(entries:Expense[],selected:string,links:EntityAccounts):Expense[]{
 if(selected==='all')return entries;
 return entries.filter(e=>selected==='personal'?!effectiveEntity(e,links):effectiveEntity(e,links)===selected);
}

/** Financial-year coverage is company-specific; unrelated company/personal uploads prove nothing. */
export function companyYearEvidence(entries:Expense[],documents:VaultDoc[],companyId:string,links:EntityAccounts,docLinks:{docId:string;kind:string;targetId:string}[]=[]){
 const own=companyReportEntries(entries,companyId,links);
 const entryIds=new Set(own.map(e=>e.id));
 const accountIds=new Set(links[companyId]??[]);
 const docs=documents.filter(d=>d.entityId?d.entityId===companyId:!!d.transactionId&&entryIds.has(d.transactionId)||!!d.accountId&&accountIds.has(d.accountId)||docLinks.some(l=>l.docId===d.id&&l.kind==='entity'&&l.targetId===companyId));
 return {entries:own.map(e=>e.date),statements:own.filter(e=>e.statementRef||e.reconciledAt).map(e=>e.date),docs:docs.map(d=>d.docDate??d.createdAt.slice(0,10))};
}