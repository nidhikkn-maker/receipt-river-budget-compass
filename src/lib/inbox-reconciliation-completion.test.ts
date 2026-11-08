import { it,expect } from 'vitest';
import { inboxItems } from './inbox';
import { defaultPreferences } from './preferences';
import type { Expense } from './expenses';
it('a fresh bank/card balance difference remains in Inbox until saved entries reconcile it',()=>{
 const prefs=defaultPreferences();prefs.statementBalances.bank={balance:750,date:'2026-11-01'};
 const entry:Expense={id:'e',title:'Bill',merchant:null,category:'Food',scope:'personal',amount:200,originalAmount:200,currency:'INR',fxRate:1,date:'2026-11-01',paymentMethod:'cash',accountId:'bank',reconciledAt:'2026-11-01',statementRef:'statement',receipts:[],description:'',memberId:null,splits:[]};
 const input={transactions:[entry],accounts:[{id:'bank',name:'Bank',kind:'savings' as const,openingBalance:1000,archived:false}],commitments:[],prefs,today:'2026-11-02',pendingCount:0};
 expect(inboxItems(input).find(i=>i.key==='balance:bank:2026-11-01')).toMatchObject({amount:-50,destination:'/account-reconciliation'});
 expect(inboxItems({...input,transactions:[{...entry,amount:250}]}).some(i=>i.key.startsWith('balance:'))).toBe(false);
});