import type { Expense } from '../expenses';
import { effectiveEntity,type EntityAccounts } from './entity-accounts';
/** One owner-visible ledger and the existing manual/account company resolution. */
export function companyReportEntries(entries:Expense[],selected:string,links:EntityAccounts):Expense[]{
 if(selected==='all')return entries;
 return entries.filter(e=>selected==='personal'?!effectiveEntity(e,links):effectiveEntity(e,links)===selected);
}