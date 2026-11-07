import { describe, expect, it } from 'vitest';
import { learningMappings, learningTargets, similarImportRows } from './import-learning';
import type { ImportRow } from './historical-import';

const source: ImportRow = { id: 'a', fingerprint: 'a', line: { ref: 'a', description: 'SWIGGY 123456', date: '2026-04-01', amount: 100, direction: 'debit' }, proposal: { title: 'Food', merchant: null, description: 'Original', category: 'Food', scope: 'personal', memberId: null, amount: 100, currency: 'INR', date: '2026-04-01', paymentMethod: 'bank_transfer', accountId: 'bank', txnType: 'expense' }, review_group: 'Suggested classification', confidence: 'medium', decision: 'review', duplicate_kind: 'new', duplicate_id: null };
const other: ImportRow = { ...source, id: 'b', fingerprint: 'b', line: { ...source.line, amount: 200 } };
describe('Classification learning', () => {
  it('applies once only to the reviewed source', () => expect(learningTargets(source, [source, other], new Set(), new Set(['b']), 'one')).toEqual([source]));
  it('limits selected-similar changes to selected matching rows', () => expect(learningTargets(source, [source, other], new Set(), new Set(['b']), 'selected')).toEqual([other]));
  it('keeps confirmed, posted, excluded and duplicate records unchanged', () => {
    const locked = [
      { ...other, fingerprint: 'posted' }, { ...other, decision: 'approved' as const },
      { ...other, proposal: { ...other.proposal, reviewed: true } }, { ...other, decision: 'excluded' as const },
      ...(['exact', 'likely', 'possible'] as const).map(duplicate_kind => ({ ...other, duplicate_kind })),
    ];
    expect(similarImportRows(source, [source, ...locked], new Set(['posted']))).toEqual([source]);
  });
  it('does not conflate merchants, directions, types, accounts or currencies', () => {
    const different = [ { ...other, line: { ...other.line, description: 'UBER' } }, { ...other, line: { ...other.line, direction: 'credit' as const } },
      ...[{ txnType: 'transfer' as const }, { accountId: 'card' }, { currency: 'USD' }].map(patch => ({ ...other, proposal: { ...other.proposal, ...patch } })) ];
    expect(similarImportRows(source, [other, ...different], new Set())).toEqual([other]);
  });
  it('stores only reusable classifications, never money, identities or approval', () => {
    expect(learningMappings({ ...source.proposal, reviewed: true, categoryConfirmed: true, duplicateOverride: true, toAccountId: 'card', tags: ['Trip: Old'], memberId: 'person', organisation: 'Office' })).toEqual({ category: 'Food', scope: 'personal', organisation: 'Office' });
  });
  it('cannot remember an unresolved check category', () => expect(learningMappings({ category: 'Miscellaneous — check' })).toEqual({}));
  it('never changes the source or silently approves matches', () => {
    const before = structuredClone([source, other]);
    expect(learningTargets(source, [source, other], new Set(), new Set(), 'matching')).toHaveLength(2);
    expect([source, other]).toEqual(before);
    expect(other.decision).toBe('review');
  });
});