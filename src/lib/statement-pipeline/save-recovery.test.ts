// @vitest-environment node
import { expect, it } from 'vitest';
import { matchesSavedEntry, saveWithRecovery } from './save-recovery';
import type { ExpenseInput } from '../expenses';

const input = { title:'Purchase', merchant:'Shop', category:'Food', scope:'personal', currency:'INR', amount:250, date:'2026-10-02', txnType:'expense', accountId:'bank', description:'Statement entry', paymentMethod:'bank_transfer', memberId:null } as ExpenseInput;
const row = { title:'Purchase', merchant:'Shop', category:'Food', scope:'personal', currency:'INR', original_amount:250, expense_date:'2026-10-02', txn_type:'expense', account_id:'bank', to_account_id:null, description:'Statement entry', payment_method:'bank_transfer', member_id:null, amount:250, fx_rate:1 };
it('lost create response confirms exact persisted original money without a second write',async()=>{
 let writes=0;
 await saveWithRecovery(async()=>{writes++;throw Error('lost');},async()=>row,input);
 expect(writes).toBe(1);
});
it.each(['original_amount','account_id','currency','txn_type','expense_date','description'])('same ID with changed %s cannot certify the save',field=>{
 expect(matchesSavedEntry(input,{...row,[field]:'different'})).toBe(false);
});
it('unavailable readback preserves the interrupted error',async()=>{
 await expect(saveWithRecovery(async()=>{throw Error('lost');},async()=>{throw Error('offline');},input)).rejects.toThrow('lost');
});