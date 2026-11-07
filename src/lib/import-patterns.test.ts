import { describe, expect, it } from 'vitest';
import { importPatterns } from './import-patterns';
import { groupImportRows } from './import-groups';
import type { ImportRow } from './historical-import';

const row: ImportRow = { id: 'a', fingerprint: 'a', line: { date: '2026-04-01', description: 'SWIGGY 123456', ref: 'a', amount: 100, direction: 'debit' }, proposal: { title: 'Food', merchant: null, description: 'Original', category: 'Food', scope: 'personal', memberId: null, amount: 999, currency: 'INR', date: '2026-04-01', paymentMethod: 'bank_transfer', accountId: 'bank', txnType: 'expense', tags: [] }, confidence: 'low', review_group: 'Unmatched or uncertain', decision: 'review', duplicate_kind: 'new', duplicate_id: null };
const monthly = ['2026-04-01', '2026-05-01', '2026-06-01'].map((date, i) => ({ ...row, id: String(i), fingerprint: String(i), line: { ...row.line, date, amount: 100 + i } }));
describe('Statement recurring patterns', () => {
  it('uses the existing cadence detector for three monthly payments', () => expect(importPatterns(monthly)[0]).toMatchObject({ cadence: 31, label: 'SWIGGY · Possible monthly pattern', rows: monthly }));
  it('does not claim a periodic schedule from two payments', () => expect(importPatterns(monthly.slice(0, 2))[0]).toMatchObject({ cadence: null, label: 'SWIGGY · Repeated payments' }));
  it('preserves legitimate same-day repeated payments without deduplication', () => {
    const rows = [row, { ...row, id: 'b', fingerprint: 'b' }];
    expect(importPatterns(rows)[0]).toMatchObject({ cadence: null, rows });
    expect(groupImportRows(rows, 'pattern', [])[0]).toMatchObject({ debit: 200, credit: 0 });
  });
  it('keeps currencies, accounts, money directions and financial types separate', () => {
    const different = [
      { ...row, proposal: { ...row.proposal, currency: 'USD' } }, { ...row, proposal: { ...row.proposal, accountId: 'other' } },
      { ...row, proposal: { ...row.proposal, txnType: 'transfer' as const } }, { ...row, line: { ...row.line, direction: 'credit' as const } },
    ];
    expect(importPatterns([row, ...different])).toEqual([{ key: 'no-pattern', label: 'No reliable pattern', cadence: null, rows: [row, ...different] }]);
  });
  it('does not use duplicates or excluded lines as recurrence evidence', () => {
    for (const duplicate_kind of ['exact', 'likely', 'possible'] as const) {
      const rows = monthly.map(r => ({ ...r, duplicate_kind }));
      expect(importPatterns(rows)[0]).toMatchObject({ key: 'no-pattern', rows });
    }
    expect(importPatterns(monthly.map(r => ({ ...r, decision: 'excluded' })))[0]?.key).toBe('no-pattern');
  });
  it('keeps irregular merchant repeats as repeats rather than subscriptions', () => {
    const irregular = ['2026-04-01', '2026-04-04', '2026-06-01'].map((date, i) => ({ ...monthly[i], ...row, id: String(i), line: { ...row.line, date } }));
    expect(importPatterns(irregular)[0]?.cadence).toBeNull();
  });
  it('covers every input exactly once and never changes approvals or source values', () => {
    const rows = [...monthly, { ...row, id: 'other', line: { ...row.line, description: 'UBER' } }];
    const before = structuredClone(rows);
    expect(importPatterns(rows).flatMap(p => p.rows).map(r => r.id).sort()).toEqual(rows.map(r => r.id).sort());
    expect(rows).toEqual(before);
    expect(groupImportRows(rows, 'pattern', []).reduce((sum, g) => sum + g.debit, 0)).toBe(403);
    expect(rows.every(r => r.decision === 'review')).toBe(true);
  });
});