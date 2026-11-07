import type { Expense } from './expenses';
import { nextAfter, type Commitment, type Frequency } from './planning';
const normal = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function recurringSeed(e: Expense, intervalDays: number | null) {
  if ((e.txnType ?? 'expense') !== 'expense') throw Error('Use the dedicated movement or income plan for this financial type.');
  if (!e.merchant || !e.accountId || /^(upi|imps|neft|payment|transfer)$/.test(normal(e.merchant))) throw Error('Confirm a specific merchant and source account first.');
  const frequency: Frequency = intervalDays && intervalDays >= 26 && intervalDays <= 35 ? 'monthly' : intervalDays && intervalDays >= 350 && intervalDays <= 380 ? 'yearly' : intervalDays === 7 ? 'weekly' : intervalDays ? 'custom' : 'monthly';
  return { name: e.merchant, kind: 'subscription' as const, direction: 'out' as const, amount: e.amount, frequency, intervalDays: frequency === 'custom' ? intervalDays : null,
    nextDue: nextAfter(e.date, frequency, intervalDays), accountId: e.accountId, category: e.category, confirmed: true, essential: false, status: 'active' as const };
}
export function recurringDuplicates(draft: Omit<Commitment, 'id'>, commitments: Commitment[]) {
  return commitments.filter(c => c.status === 'active' && c.direction === draft.direction && c.accountId === draft.accountId && normal(c.name) === normal(draft.name));
}
export function recurringSelection(entries: Expense[]) {
  const first = entries[0];
  if (!first) throw Error('Select a transaction first.');
  recurringSeed(first, null);
  if (entries.some(e => (e.txnType ?? 'expense') !== 'expense' || normal(e.merchant ?? '') !== normal(first.merchant ?? '') || e.accountId !== first.accountId || e.currency !== first.currency || e.scope !== first.scope || e.department !== first.department)) throw Error('Select one merchant, account, currency and responsibility group for a recurring profile.');
  return first;
}