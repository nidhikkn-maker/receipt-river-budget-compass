import type { Account, Txn } from '../ledger';
import { isMove } from '../ledger';
/** Net external cash crossing the portfolio boundary. Internal portfolio transfers cancel. */
export function investmentFlows(entries: Txn[], accounts: Account[], after: string, through?: string): number {
  const portfolio = new Set(accounts.filter((a) => ['investment', 'fixed_deposit'].includes(a.kind)).map((a) => a.id));
  let total = 0;
  for (const t of entries) {
    if (t.transferCounterpartOf || t.date <= after || (through && t.date > through) || !isMove(t.txnType)) continue;
    const source = !!t.accountId && portfolio.has(t.accountId);
    const target = !!t.toAccountId && portfolio.has(t.toAccountId);
    if (target && !source) total += t.amount;
    if (source && !target) total -= t.amount;
  }
  return Math.round(total * 100) / 100;
}