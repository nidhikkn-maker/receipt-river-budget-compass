import { describe, expect, it } from 'vitest';
import { verifiedRecovery } from './review-recovery';
import { defaultPreferences } from './preferences';
import type { Expense } from './expenses';
const e: Expense = { id: 'test', title: 'Test', amount: 1, originalAmount: 1, currency: 'INR', fxRate: 1, date: '2026-04-01', category: 'Other', scope: 'official', memberId: null, splits: [], receipts: [], description: 'Source', merchant: null, paymentMethod: 'upi', reconciledAt: null, statementRef: null, paymentInstrumentId: 'method' };
const accounts = [{ id: 'bank', name: 'Personal bank', kind: 'savings' as const, archived: false, openingBalance: 0 }];
const prefs = { ...defaultPreferences(), tags: [{ group: 'Organisation', name: 'AET' }], paymentInstruments: [{ id: 'method', nickname: 'Verified', type: 'upi' as const, accountId: 'bank' }] };
describe('verified missing-detail recovery', () => {
  it('recovers source only from a saved active instrument and never legal ownership', () => { expect(verifiedRecovery(e, accounts, prefs).account).toBe('bank'); expect(verifiedRecovery({ ...e, paymentInstrumentId: null }, accounts, prefs).account).toBeUndefined(); expect(verifiedRecovery(e, accounts, prefs).organisation).toBeUndefined(); });
  it('retains confirmed source and refuses archived instrument evidence', () => { expect(verifiedRecovery({ ...e, accountId: 'another' }, accounts, prefs).account).toBeUndefined(); expect(verifiedRecovery(e, accounts, { ...prefs, paymentInstruments: [{ ...prefs.paymentInstruments[0], id: 'method', nickname: 'Verified', type: 'upi', accountId: 'bank', archived: true }] }).account).toBeUndefined(); });
  it('recovers only a unique configured saved organisation tag, never narrative claims', () => { expect(verifiedRecovery({ ...e, tags: ['Organisation: AET'] }, accounts, prefs).organisation).toBe('AET'); expect(verifiedRecovery({ ...e, tags: ['Organisation: Unknown'] }, accounts, prefs).organisation).toBeUndefined(); expect(verifiedRecovery({ ...e, department: 'Existing', tags: ['Organisation: AET'] }, accounts, prefs).organisation).toBeUndefined(); });
});