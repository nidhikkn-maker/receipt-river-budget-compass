import {assertAccountingJournal,type AccountingJournal} from './accounting-journal';
import type {Account} from '../ledger';
import type {VaultDoc} from '../documents';
import type {BooksData} from './types';
export interface AccountingAttempt {owner:string;requestId:string;expected:number;journal:AccountingJournal}
export interface AccountingReceipt {owner_id:string;request_id:string;journal:AccountingJournal;entry_ids:string[]}
/** Check the same immutable payload after both acknowledgements and unknown outcomes. */
export async function postAccountingWithRecovery(attempt:AccountingAttempt,io:{read:()=>Promise<AccountingReceipt|null>;post:()=>Promise<unknown>}){
 const verify=(r:AccountingReceipt)=>{if(r.owner_id!==attempt.owner||r.request_id!==attempt.requestId||JSON.stringify(r.journal)!==JSON.stringify(attempt.journal)||!r.entry_ids.length)throw Error('Saved accounting evidence differs. Nothing was replaced.');return r;};
 const existing=await io.read();if(existing)return verify(existing);
 let failure:unknown;try{await io.post();}catch(e){failure=e;}
 let saved:AccountingReceipt|null;try{saved=await io.read();}catch{throw Error('Accounting outcome is unknown. Keep this journal and retry the same request.');}
 if(saved)return verify(saved);
 throw failure??Error('Accounting save could not be confirmed. Retain the journal for retry.');
}
export function validateAccountingAttempt(a:AccountingAttempt,accounts:Account[],books:BooksData,documents:VaultDoc[]){if(!a.owner||!a.requestId||!Number.isInteger(a.expected)||a.expected<0)throw Error('Refresh company records before confirmation.');assertAccountingJournal(a.journal,accounts,books,documents);}