import { expect,it } from 'vitest';
import { verifyHistoricalBalances } from './balance-verification';
const input={opening:1000,closing:800,sourceOpening:1000,sourceClosing:800,checkedOriginal:true,reference:'Original statement page 1',lines:[{ref:'a',date:'2026-04-01',amount:200,description:'Groceries',direction:'debit' as const}],liability:false,ledgerOpening:1000,ledgerClosing:800,unresolved:0};
it('verifies matching source, imported and ledger balances',()=>expect(verifyHistoricalBalances(input).fullyReconciled).toBe(true));
it('shows exact opening and closing discrepancies',()=>expect(verifyHistoricalBalances({...input,opening:1050,closing:900})).toMatchObject({openingDifference:50,closingDifference:100,sourceVerified:false}));
it('does not verify source records from arithmetic alone',()=>expect(verifyHistoricalBalances({...input,checkedOriginal:false}).sourceVerified).toBe(false));
it('does not declare pending historical records complete',()=>expect(verifyHistoricalBalances({...input,unresolved:1}).fullyReconciled).toBe(false));
it('does not verify missing source balances as zero',()=>expect(verifyHistoricalBalances({...input,sourceOpening:null}).sourceVerified).toBe(false));
it('does not confuse matched source balances with ledger reconciliation',()=>expect(verifyHistoricalBalances({...input,ledgerClosing:750})).toMatchObject({sourceVerified:true,fullyReconciled:false,ledgerClosingDifference:-50}));