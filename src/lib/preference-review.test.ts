import { it,expect } from 'vitest';
import { defaultPreferences } from './preferences';
import { emptyBooks } from './books/types';
import { preferenceReviewSections } from './preference-review';
it('requires approval when disabling policy or changing financial registers',()=>{
 const p={...defaultPreferences(),books:emptyBooks()};
 expect(preferenceReviewSections(p,{...p,books:{...p.books,entityAccounts:{company:['bank']}}})).toEqual(['books.entityAccounts']);
 expect(preferenceReviewSections(p,{...p,books:{...p.books,policy:{require:{capitalise:false} as never}}})).toEqual(['books.policy']);
});
it('does not mistake object key ordering or scheduled prepared journals for financial approval',()=>{
 const p={...defaultPreferences(),books:{...emptyBooks(),entityAccounts:{a:['1'],b:['2']}}};
 expect(preferenceReviewSections(p,{...p,books:{...p.books,entityAccounts:{b:['2'],a:['1']},journals:[{id:'j',assetId:'a',period:'2026-11',amount:100,kind:'book',status:'prepared'}]}})).toEqual([]);
});
import { alignUnchangedSections } from './preference-review';
import { normalizePreferences } from './preferences';
describe('first saves on a new account', () => {
  it('leaves out unchanged protected sections the database does not hold', () => {
    const next = normalizePreferences({});
    const out = alignUnchangedSections({ statementUploads: [] }, next, []) as unknown as Record<string, unknown>;
    expect('entities' in out).toBe(false);
    expect('assets' in out).toBe(false);
    expect('policy' in (out.books as object)).toBe(false);
  });
  it('keeps a changed protected section so it still needs approval', () => {
    const next = { ...normalizePreferences({}), entities: [{ id: 'e1' }] } as never;
    const out = alignUnchangedSections({}, next, ['entities']) as unknown as Record<string, unknown>;
    expect(out.entities).toEqual([{ id: 'e1' }]);
  });
  it('never substitutes the stored value for an existing section', () => {
    const next = { ...normalizePreferences({}), entities: [{ id: 'new' }] } as never;
    const out = alignUnchangedSections({ entities: [{ id: 'old' }] }, next, []) as unknown as Record<string, unknown>;
    expect(out.entities).toEqual([{ id: 'new' }]);
  });
});
