import { describe, expect, it } from 'vitest';
import { centreCategoryPreview, centreReview, matchesReview, reviewCounts, selectedReviewSummary, selectReviewIds, confirmableImportRows } from './review-centre';
import { inboxItems } from './inbox';
import { defaultPreferences } from './preferences';
import type { Expense } from './expenses';
const expense = (id: string): Expense => ({ id, title: id, merchant: 'Grab', category: 'Miscellaneous', scope: 'business', memberId: null, splits: [], amount: 100, originalAmount: 100, currency: 'INR', fxRate: 1, paymentMethod: 'upi', reconciledAt: null, statementRef: null, date: '2026-04-01', description: 'Original', receipts: [], accountId: 'bank', txnType: 'expense' });
const accounts = [{ id: 'bank', name: 'Bank', kind: 'savings' as const, openingBalance: 1000, archived: false }];
const rowsFor = (transactions: Expense[]) => { const prefs = defaultPreferences(); return centreReview(inboxItems({ transactions, accounts, commitments: [], prefs, today: '2026-11-01', pendingCount: 0 }), transactions, accounts, prefs.categories.map(c => c.name)); };
describe('V5.10 review selection and counts', () => {
  it('previews eligible category changes while explicitly excluding missing source accounts', () => {
    const rows = rowsFor([expense('safe'), { ...expense('unknown'), accountId: null }]);
    const preview = centreCategoryPreview(rows, 'Groceries');
    expect(preview.records.map(e => e.id)).toEqual(['safe']);
    expect(preview.excluded.map(e => e.id)).toEqual(['unknown']);
    expect(preview.selectedCount).toBe(2);
    expect(preview.remainingIssues).toBeGreaterThan(0);
  });
  it('selects all 91 matching transactions beyond the 40 visible records', () => { const rows = rowsFor(Array.from({ length: 91 }, (_, n) => ({ ...expense(`${n}`), date: `2026-04-${String(n % 28 + 1).padStart(2, '0')}`, originalAmount: n + 1, amount: n + 1 }))); expect(selectReviewIds([], rows).size).toBe(91); expect(selectReviewIds([], rows.slice(0, 40)).size).toBe(40); });
  it('deduplicates stable IDs across pages and repeated selection', () => { const rows = rowsFor([expense('one')]); expect(selectReviewIds(['one'], [...rows, ...rows]).size).toBe(1); });
  it('category resolution retains the missing organisation issue', () => { const before = rowsFor([expense('one')]); const after = rowsFor([{ ...expense('one'), category: 'Groceries' }]); expect(reviewCounts(before)).toMatchObject({ transactions: 1, category: 1, missing: 1, issues: 2, multiple: 1 }); expect(reviewCounts(after)).toMatchObject({ transactions: 1, category: 0, missing: 1, issues: 1 }); });
  it('selection does not change classifications or resolve issues', () => { const rows = rowsFor([expense('one')]); selectReviewIds([], rows); expect(rows[0]?.transaction.category).toBe('Miscellaneous'); const first = rows[0]; expect(first && matchesReview(first, 'missing')).toBe(true); });
  it('selected transaction total includes income, not expenditure only', () => { const rows = rowsFor([expense('one'), { ...expense('two'), txnType: 'income', amount: 250 }]); expect(selectedReviewSummary(rows).total).toBe(350); });
  it('selected amounts distinguish ₹100 expense, ₹250 income and ₹500 card settlement',()=>{const rows=rowsFor([expense('one'),{...expense('two'),txnType:'income',amount:250},{...expense('three'),txnType:'card_payment',amount:500,toAccountId:'unknown'}]);expect(selectedReviewSummary(rows).amounts).toEqual({expenses:100,income:250,transfers:0,settlements:500});});
  it('account ownership never fills organisation responsibility', () => { expect(rowsFor([expense('one')])[0]?.transaction.department).toBeUndefined(); expect(reviewCounts(rowsFor([expense('one')])).missing).toBe(1); });
});
describe("confirmableImportRows", () => {
  const row = (issues: string[], extra: Record<string, unknown> = {}) => ({ transaction: { id: "x" }, issues: issues.map(type => ({ type, description: "" })), group: "ready", evidence: [], targetAccountIds: [], confidence: "high", status: "Ready for Review", ...extra }) as never;
  it("card payment only awaiting import confirmation can be confirmed", () => expect(confirmableImportRows([row(["unverified_import"])])).toHaveLength(1));
  it("rows with other issues or suggestions are excluded", () => expect(confirmableImportRows([row(["unverified_import", "uncategorised"]), row(["unverified_import"], { suggestedType: "card_payment" })])).toHaveLength(0));
});
