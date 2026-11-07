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