import { expect, it } from 'vitest';
import { accountBalance } from './ledger';
import { amortize, emiSplit, forecast, foreclosure, goalProgress, safeToSpend } from './planning';

it('isolated ledger → forecast → safe-to-spend retains cents and holds reserves without posting', () => {
  const txns = [{ id: "a", amount: 0.1, txnType: 'income' as const, accountId: 'bank', date: '2026-11-01' }, { id: "b", amount: 0.2, txnType: 'income' as const, accountId: 'bank', date: '2026-11-01' }];
  const snapshot = JSON.stringify(txns);
  const balance = accountBalance({ id: 'bank', name: 'Test', kind: 'savings', openingBalance: 1.005, archived: false }, txns);
  expect(balance).toBe(1.31);
  const input = { today: '2026-11-01', days: 1, startBalance: balance, commitments: [], extraOut: [{ date: '2026-11-02', name: 'Bill', amount: 0.3 }], reserves: 0.1, minBalance: 0.2 };
  expect(forecast(input).series.at(-1)).toMatchObject({ balance: 1.01, outflow: 0.3 });
  expect(safeToSpend(input).amount).toBe(0.71);
  expect(JSON.stringify(txns)).toBe(snapshot);
});
it('loan schedule and EMI split share exact half-up cents and conserve principal', () => {
  // Monthly interest: 100.50 × 12 / 1200 = 1.005, rounds to 1.01.
  const schedule = amortize(100.5, 12, 51.51);
  expect(schedule.schedule[0]).toEqual({ month: 1, interest: 1.01, principal: 50.5, balance: 50 });
  expect(emiSplit(100.5, 12, 51.51)).toEqual({ interest: 1.01, principal: 50.5, total: 51.51 });
  expect(schedule.schedule.at(-1)?.balance).toBe(0);
  expect(schedule.totalInterest).toBe(1.51);
});
it('foreclosure charges and goal remainder use the same financial boundaries', () => {
  expect(foreclosure(100.5, 1)).toEqual({ charge: 1.01, total: 101.51 });
  expect(goalProgress({ target: 0.3, saved: 0.1, monthly: 0.1 }, '2026-11-01')).toMatchObject({ remaining: 0.2, months: 2, eta: '2027-01-01' });
});