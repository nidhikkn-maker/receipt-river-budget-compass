import { describe, expect, it } from 'vitest';
import { applyReviewRules, reviewCohorts, reviewRuleSeed } from './financial-review-intelligence';
import { categoryReviewPreview, type FinancialReview } from './financial-review';
import type { Expense } from './expenses';
import type { ImportRule } from './historical-import';
const expense: Expense = { id: 'one', title: 'Merchant', merchant: 'Merchant', accountId: 'bank', category: 'Miscellaneous', scope: 'personal', memberId: null, amount: 100, originalAmount: 100, currency: 'INR', fxRate: 1, date: '2026-04-01', description: 'Merchant subscription', txnType: 'expense', splits: [], receipts: [], paymentMethod: 'upi', statementRef: 'statement', reconciledAt: null };
const row = (patch: Partial<Expense> = {}): FinancialReview => ({ transaction: { ...expense, ...patch }, issues: [], group: 'category', status: 'Unresolved', confidence: 'low', targetAccountIds: [], evidence: [] });
const rule: ImportRule = { id: 'rule', enabled: true, merchant: 'Merchant subscription', account_id: 'bank', mappings: { category: 'Digital subscriptions', scope: 'personal' }, conditions: { currency: 'INR', direction: 'debit' } };
describe('V5.9 confirmed rules and recurring cohorts', () => {
  it('promotes matching saved rules only to a reviewable suggestion, never changes the ledger', () => {
    const source = row(); const result = applyReviewRules([source], [rule], ['Digital subscriptions']);
    expect(result[0]?.group).toBe('ready'); expect(result[0]?.confidence).toBe('high');
    expect(source.transaction.category).toBe('Miscellaneous');
    expect(categoryReviewPreview(result, 'Digital subscriptions').records[0]?.id).toBe('one');
  });
  it('cannot approve another category or ignore original currency and amount conditions', () => {
    const result = applyReviewRules([row()], [rule], ['Digital subscriptions']);
    expect(() => categoryReviewPreview(result, 'Groceries')).toThrow();
    expect(applyReviewRules([row({ originalAmount: 50, amount: 1000 })], [{ ...rule, conditions: { minAmount: 60 } }], ['Digital subscriptions'])[0]?.group).toBe('category');
  });
  it('keeps equal-priority rule conflicts unresolved', () => {
    expect(applyReviewRules([row()], [rule, { ...rule, id: 'other', mappings: { category: 'Groceries' } }], ['Digital subscriptions', 'Groceries'])[0]?.group).toBe('conflict');
  });
  it('does not confuse organisation responsibility or reimbursement with account ownership', () => {
    for (const mappings of [{ ...rule.mappings, organisation: 'Business' }, { ...rule.mappings, reimbursable: true }, { ...rule.mappings, scope: 'business' as const }]) expect(applyReviewRules([row()], [{ ...rule, mappings }], ['Digital subscriptions'])[0]?.group).toBe('category');
  });
  it('financial type from a confirmed rule is reviewed before assigning an expense category', () => {
    const result = applyReviewRules([row()], [{ ...rule, mappings: { txnType: 'card_payment', category: 'Groceries' } }], ['Groceries']);
    expect(result[0]?.group).toBe('type'); expect(result[0]?.suggestedType).toBe('card_payment');
    expect(() => categoryReviewPreview(result, 'Groceries')).toThrow();
  });
  it('does not promote rows with missing account evidence', () => {
    const missing = { ...row(), group: 'missing' as const };
    expect(applyReviewRules([missing], [rule], ['Digital subscriptions'])[0]?.group).toBe('missing');
  });
  it('partitions merchant cohorts by ownership, reimbursement, organisation and financial type', () => {
    const rows = [row(), row({ id: 'two' }), row({ id: 'three', scope: 'business' }), row({ id: 'four', department: 'Other' }), row({ id: 'five', memberId: 'family' }), row({ id: 'six', txnType: 'income' })];
    const cohorts = reviewCohorts(rows, []);
    expect(cohorts).toHaveLength(1); expect(cohorts[0]?.rows.map(r => r.transaction.id)).toEqual(['one', 'two']);
  });
  it('identifies cadence and price changes without creating subscription expenses', () => {
    const rows = [row(), row({ id: 'two', date: '2026-05-01' }), row({ id: 'three', date: '2026-06-01', originalAmount: 120 })];
    const before = JSON.stringify(rows); const c = reviewCohorts(rows, []);
    expect(c[0]?.cadence).toBe(31); expect(c[0]?.changedAmount).toBe(true); expect(c[0]?.profileIds).toEqual([]); expect(JSON.stringify(rows)).toBe(before);
  });
  it('same-day repeated payments do not prove recurring cadence', () => {
    expect(reviewCohorts([row(), row({ id: 'two' }), row({ id: 'three' })], [])[0]?.cadence).toBeNull();
  });
  it('rule seeds exclude approval, money changes and reimbursement grants', () => {
    const seed = reviewRuleSeed(expense, 'Groceries');
    expect(seed.account_id).toBe('bank'); expect(seed.conditions?.currency).toBe('INR');
    expect(seed.mappings).toEqual({ category: 'Groceries', scope: 'personal', organisation: '', txnType: 'expense' });
    expect(() => reviewRuleSeed({ ...expense, merchant: 'UPI' }, 'Groceries')).toThrow();
  });
});