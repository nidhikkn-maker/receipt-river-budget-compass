import { describe, it, expect } from 'vitest';
import { investmentFlows } from './investment-flows';
import type { Account, Txn } from '../ledger';
const accounts: Account[] = [
  { id: 'bank', name: 'Bank', kind: 'savings', openingBalance: 0, archived: false },
  { id: 'fund', name: 'Fund', kind: 'investment', openingBalance: 0, archived: false },
  { id: 'deposit', name: 'FD', kind: 'fixed_deposit', openingBalance: 0, archived: false },
];
const entry = (patch: Partial<Txn> = {}): Txn => ({ id: 't', date: '2026-11-02', amount: 200, txnType: 'investment', accountId: 'bank', toAccountId: 'fund', ...patch });
describe('external portfolio cash flows', () => {
  it('excludes a 200 contribution from a 1000 to 1200 market move', () => { const flows=investmentFlows([entry()],accounts,'2026-11-01'); expect(flows).toBe(200); expect(1200-1000-flows).toBe(0); });
  it('excludes a 200 redemption stored as transfer from a 1000 to 800 move', () => { const flows=investmentFlows([entry({txnType:'transfer',accountId:'fund',toAccountId:'bank'})],accounts,'2026-11-01'); expect(flows).toBe(-200); expect(800-1000-flows).toBe(0); });
  it('does not count internal portfolio moves', () => { expect(investmentFlows([entry({accountId:'fund',toAccountId:'deposit'})],accounts,'2026-11-01')).toBe(0); });
  it('does not count counterpart evidence twice', () => { expect(investmentFlows([entry(),entry({id:'credit',transferCounterpartOf:'t'})],accounts,'2026-11-01')).toBe(200); });
  it('uses only dates after previous day and through the new snapshot day', () => { expect(investmentFlows([entry({date:'2026-11-01'}),entry(),entry({date:'2026-11-03'})],accounts,'2026-11-01','2026-11-02')).toBe(200); });
  it('spending and adjustments are not contributions', () => { expect(investmentFlows([entry({txnType:'expense'}),entry({txnType:'adjustment'})],accounts,'2026-11-01')).toBe(0); });
});