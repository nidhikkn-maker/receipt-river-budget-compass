import { describe, expect, it } from 'vitest';
import { importRuleMatches, matchingImportRules, stageImport, type ImportRule } from './historical-import';
import type { Expense } from './expenses';

const line = { ref: 'r1', date: '2026-04-12', description: 'SWIGGY ORDER lunch', amount: 500, direction: 'debit' as const };
const rule: ImportRule = { id: 'r', merchant: 'SWIGGY', account_id: 'bank', enabled: true, mappings: { category: 'Food', scope: 'official' } };
const ctx = { accountId: 'bank', currency: 'INR', accounts: [{ id: 'bank', name: 'Bank', kind: 'savings' as const, openingBalance: 0, archived: false }], transactions: [] as Expense[], categories: [{ name: 'Food', archived: false }] };
describe('Extended import rule safeguards', () => {
  it('matches description as literal case-insensitive text', () => {
    expect(importRuleMatches({ ...rule, conditions: { description: 'LUNCH' } }, line, 'bank', 'INR')).toBe(true);
    expect(importRuleMatches({ ...rule, conditions: { description: '.*' } }, line, 'bank', 'INR')).toBe(false);
  });
  it('keeps debit rules off credited refunds', () => expect(importRuleMatches({ ...rule, conditions: { direction: 'debit' } }, { ...line, direction: 'credit' }, 'bank', 'INR')).toBe(false));
  it('uses inclusive original-currency bounds', () => {
    const bounded = { ...rule, conditions: { minAmount: 500, maxAmount: 500, currency: 'INR' } };
    expect(importRuleMatches(bounded, line, 'bank', 'INR')).toBe(true);
    expect(importRuleMatches(bounded, { ...line, amount: 501 }, 'bank', 'INR')).toBe(false);
    expect(importRuleMatches(bounded, line, 'bank', 'USD')).toBe(false);
  });
  it('rejects invalid bounds and different accounts', () => {
    expect(importRuleMatches({ ...rule, conditions: { minAmount: NaN } }, line, 'bank', 'INR')).toBe(false);
    expect(importRuleMatches(rule, line, 'other', 'INR')).toBe(false);
  });
  it('uses higher priority but leaves equal-priority conflicts unresolved', () => {
    const other = { ...rule, id: 'other', mappings: { scope: 'business' as const }, priority: 10 };
    expect(matchingImportRules([rule, other], line, 'bank', 'INR')).toMatchObject({ top: [other], conflict: false });
    expect(matchingImportRules([{ ...rule, priority: 10 }, other], line, 'bank', 'INR').conflict).toBe(true);
  });
  it('never copies money, identity, destination or approval from a rule', () => {
    const mapped = { ...rule, mappings: { ...rule.mappings, amount: 1, date: '2026-01-01', currency: 'USD', accountId: 'other', toAccountId: 'other', reviewed: true, categoryConfirmed: true, duplicateOverride: true } };
    const row = stageImport([line], ctx, [mapped], new Set())[0];
    expect(row?.proposal).toMatchObject({ amount: 500, date: '2026-04-12', currency: 'INR', accountId: 'bank', toAccountId: null });
    expect(row?.proposal.reviewed).toBeUndefined();
    expect(row?.proposal.duplicateOverride).toBeUndefined();
    expect(row?.decision).toBe('review');
  });
  it('transaction-type hints do not approve transfers or supply a destination', () => {
    const row = stageImport([line], ctx, [{ ...rule, mappings: { txnType: 'transfer' } }], new Set())[0];
    expect(row?.proposal.txnType).toBe('transfer');
    expect(row?.proposal.toAccountId).toBeNull();
    expect(row?.decision).toBe('review');
  });
  it('merges safe classification tags without linking a trip', () => {
    const row = stageImport([line], ctx, [{ ...rule, mappings: { tags: ['Office', 'Office', 'Trip: Paris'], organisation: 'Acme', reimbursable: true } }], new Set())[0];
    expect(row?.proposal.tags).toEqual(['Office']);
    expect(row?.proposal.organisation).toBe('Acme');
    expect(row?.proposal.reimbursable).toBe(true);
  });
});