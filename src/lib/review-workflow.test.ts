import { describe, expect, it } from 'vitest';
import { selectionScope, reviewActionEligibility, reviewStatus } from './review-workflow';
import { centreReview } from './review-centre';
import { inboxItems } from './inbox';
import { defaultPreferences } from './preferences';
import type { Expense } from './expenses';
const accounts = [{ id: 'bank', name: 'Bank', kind: 'savings' as const, openingBalance: 1000, archived: false }];
const entry = (id: string): Expense => ({ id, title: id, category: 'Miscellaneous', scope: 'personal', memberId: null, splits: [], amount: 100, originalAmount: 100, currency: 'INR', fxRate: 1, paymentMethod: 'upi', reconciledAt: null, statementRef: null, date: '2026-04-01', description: 'Original', receipts: [], accountId: 'bank', txnType: 'expense' });
const rowsFor = (entries: Expense[]) => { const prefs = defaultPreferences(); return centreReview(inboxItems({ transactions: entries, accounts, commitments: [], prefs, today: '2026-11-01', pendingCount: 0 }), entries, accounts, prefs.categories.map(c => c.name)); };
describe('guided review safeguards', () => {
  it('reports selected records excluded by changed filters without adding others', () => { const rows = rowsFor([entry('one'), entry('two')]); expect(selectionScope(['one','two','gone'], rows, rows.slice(0,1))).toEqual({total:2,matching:1,hidden:1,obsolete:1}); });
  it('blocks categorisation when every selected record lacks an account', () => { expect(reviewActionEligibility(rowsFor([{...entry('one'), accountId:null}])).category).toBe(false); });
  it('does not mark missing organisation ready for confirmation', () => { const row = rowsFor([{...entry('one'),category:'Groceries',scope:'official'}])[0]; expect(row && reviewStatus(row)).toBe('Needs Review'); expect(reviewActionEligibility(rowsFor([{...entry('one'),category:'Groceries',scope:'official'}])).confirm).toBe(0); });
  it('reopens an edited imported entry until explicitly confirmed', () => { const row=rowsFor([{...entry('one'),category:'Groceries',statementRef:'original',correctionRevision:1}])[0]; expect(row && reviewStatus(row)).toBe('Reopened'); });
});