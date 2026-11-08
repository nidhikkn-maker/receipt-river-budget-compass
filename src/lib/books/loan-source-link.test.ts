import {it,expect} from 'vitest';
import {suggestLinks} from './intake';
it('lender references match complete printed tokens, never a prefix of another loan',()=>{
 const loans=[{id:'short',name:'Vehicle finance',refs:['LN-1234']},{id:'long',name:'Equipment finance',refs:['LN-12345']}];
 expect(suggestLinks('Loan account: LN-12345',[],loans).loanId).toBe('long');
 expect(suggestLinks('Loan account: XLN-12345Z',[],loans).loanId).toBeNull();
});
it('multiple printed lender identities remain unassigned for explicit review',()=>{
 expect(suggestLinks('LN-1234 and LN-12345',[],[{id:'a',name:'First loan',refs:['LN-1234']},{id:'b',name:'Second loan',refs:['LN-12345']}]).loanId).toBeNull();
});
it('literal punctuation in saved loan references is not interpreted as a pattern',()=>{
 expect(suggestLinks('Reference A+B(12).',[],[{id:'a',name:'Finance loan',refs:['A+B(12)']}]).loanId).toBe('a');
});