import { describe, expect, it } from 'vitest';
import { groupImportRows } from './import-groups';
import type { ImportRow } from './historical-import';
import type { Account } from './ledger';

const accounts: Account[] = [{ id: 'bank', name: 'Bank', kind: 'savings', openingBalance: 0, archived: false }];
const row: ImportRow = { id: 'a', fingerprint: 'a', line: { date: '2026-04-01', description: 'UPI SWIGGY 123456', ref: 'a', amount: 100.25, direction: 'debit' }, proposal: { title: 'Food', category: 'Food', scope: 'personal', memberId: null, amount: 999, currency: 'INR', date: '2026-04-01', paymentMethod: 'bank_transfer', accountId: 'bank', txnType: 'expense', tags: [] }, confidence: 'low', review_group: 'Unmatched or uncertain', decision: 'review', duplicate_kind: 'new', duplicate_id: null };
const second: ImportRow = { ...row, id: 'b', fingerprint: 'b', line: { ...row.line, amount: 50.1, direction: 'credit' }, proposal: { ...row.proposal, category: 'Refunds', scope: 'business', txnType: 'refund', organisation: 'Example' } };

describe('Statement grouping', () => {
  it('uses original amounts and separates credits from debits within one merchant', () => {
    const groups = groupImportRows([row, second], 'merchant', accounts);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ label: 'SWIGGY', debit: 100.25, credit: 50.1 });
  });
  it('keeps different suggested categories separate for the same merchant', () => {
    expect(groupImportRows([row, second], 'category', accounts).map(g => [g.key, g.rows.length])).toEqual([['Food', 1], ['Refunds', 1]]);
  });
  it('groups workspaces independently', () => {
    expect(groupImportRows([row, second], 'workspace', accounts).map(g => g.key).sort()).toEqual(['business', 'personal']);
  });
  it('keeps financial transaction types separate', () => {
    expect(groupImportRows([row, second], 'type', accounts).map(g => g.key).sort()).toEqual(['expense', 'refund']);
  });
  it('keeps account identity separate even when account names match', () => {
    const other = { ...accounts[0], id: 'other' };
    expect(groupImportRows([row, { ...second, proposal: { ...second.proposal, accountId: 'other' } }], 'account', [...accounts, other])).toHaveLength(2);
  });
  it('groups missing organisations separately', () => {
    expect(groupImportRows([row, second], 'organisation', accounts).map(g => g.label).sort()).toEqual(['Example', 'No organisation']);
  });
  it('never upgrades uncertain classifications or changes the source', () => {
    const before = structuredClone(row);
    expect(groupImportRows([row], 'confidence', accounts)[0]?.key).toBe('Needs review');
    expect(row).toEqual(before);
    expect(row.decision).toBe('review');
  });
  it('groups incoming and outgoing lines without netting legitimate repeats', () => {
    const groups = groupImportRows([row, { ...row, id: 'repeat' }, second], 'direction', accounts);
    expect(groups.find(g => g.key === 'debit')).toMatchObject({ debit: 200.5, credit: 0 });
    expect(groups.find(g => g.key === 'credit')?.rows).toHaveLength(1);
  });
});