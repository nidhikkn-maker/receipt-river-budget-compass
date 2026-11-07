import { expect, it } from 'vitest';
import { merchantGroupingChanges, merchantReviewSnapshot, reverseMerchantGrouping } from './merchant-management';
import type { Expense } from './expenses';
it('preview covers indirect aliases and binds original fields and new entries', () => {
 const entries=[{id:'a',merchant:'Alias',amount:1.01},{id:'b',merchant:'Middle',amount:2.02}] as Expense[];
 const before={alias:'middle',middle:'target'},after={alias:'middle'};
 expect(merchantGroupingChanges(entries,before,after).map(c=>c.id)).toEqual(['a','b']);
 expect(merchantReviewSnapshot(entries,before,after)).not.toBe(merchantReviewSnapshot([...entries,{...entries[0],id:'c'}] as Expense[],before,after));
 const event={id:'merge',date:'2026-11-07',title:'merge',before:after,after:before,entryIds:['a','b']};
 expect(reverseMerchantGrouping({...before,unrelated:'other'},event)).toEqual({...after,unrelated:'other'});
 expect(()=>reverseMerchantGrouping({...before,middle:'later'},event)).toThrow('changed later');
 expect(()=>reverseMerchantGrouping({...before,new:'middle'},event)).toThrow('newer merchant');
});