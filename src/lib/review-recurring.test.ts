import { describe, expect, it } from 'vitest';
import { recurringDuplicates, recurringSeed } from './review-recurring';
import type { Expense } from './expenses';
const entry: Expense = { id: 'sample', title: 'Software', merchant: 'Software vendor', amount: 500, originalAmount: 6, fxRate: 83.333, currency: 'USD', date: '2026-04-30', category: 'Software', scope: 'personal', memberId: null, splits: [], receipts: [], description: 'Source text', paymentMethod: 'credit_card', accountId: 'card', reconciledAt: null, statementRef: null, txnType: 'expense' };
describe('review recurring profiles', () => {
  it('uses stored INR planning amount and existing calendar month rules without creating expenses', () => { const draft = recurringSeed(entry, 30); expect(draft.amount).toBe(500); expect(draft.nextDue).toBe('2026-05-30'); expect(entry.originalAmount).toBe(6); expect(entry.txnType).toBe('expense'); });
  it('blocks generic merchants and non-expense movements', () => { expect(() => recurringSeed({ ...entry, merchant: 'UPI' }, null)).toThrow('specific merchant'); expect(() => recurringSeed({ ...entry, txnType: 'card_payment' }, null)).toThrow('dedicated'); });
  it('detects active same-account profiles but not different owners accounts or paused profiles', () => { const draft = recurringSeed(entry, 30); expect(recurringDuplicates(draft, [{ ...draft, id: 'existing', name: 'SOFTWARE VENDOR' }, { ...draft, id: 'other', accountId: 'bank' }, { ...draft, id: 'paused', status: 'paused' }]).map(c => c.id)).toEqual(['existing']); });
});