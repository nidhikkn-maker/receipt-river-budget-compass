// @vitest-environment node
import { expect, it } from 'vitest';
import { atomicStatementUndo, type AtomicUndoApi } from './atomic-undo';
const result = {posted:['a','b'],reconciled:[],evidence:[{id:'a',ref:'source-a'},{id:'b',ref:'source-b'}]};
const expected = [{id:'a',ref:'source-a',revision:1},{id:'b',ref:'source-b',revision:1}];
const rows = expected.map(x=>({id:x.id,statement_ref:x.ref,correction_revision:x.revision,amount:x.id==='a'?250:480}));
it('whole financial reversal uses one atomic commit, not per-row writes',async()=>{
 let commits=0; const api:AtomicUndoApi={receipt:async()=>false,rows:async()=>rows,commit:async(_id,items)=>{commits++;expect(items.map(x=>x.snapshot['amount'])).toEqual([250,480]);}};
 await atomicStatementUndo('op',result,expected,api);expect(commits).toBe(1);
});
it('later revision refuses all financial writes',async()=>{
 let commits=0;await expect(atomicStatementUndo('op',result,expected,{receipt:async()=>false,rows:async()=>[rows[0] ?? {},{...rows[1],correction_revision:2}],commit:async()=>{commits++;}})).rejects.toThrow('changed');expect(commits).toBe(0);
});
it('lost Undo response reads durable receipt before reporting success, replay needs no rows',async()=>{
 let committed=false,reads=0;const api:AtomicUndoApi={receipt:async()=>committed,rows:async()=>{reads++;return rows;},commit:async()=>{committed=true;throw Error('response lost');}};
 await atomicStatementUndo('op',result,expected,api);await atomicStatementUndo('op',result,[],api);expect(reads).toBe(1);
});
it('missing staged authority fails closed with zero financial writes',async()=>{
 let commits=0;await expect(atomicStatementUndo('op',result,expected,{receipt:async()=>{throw Error('awaiting approval');},rows:async()=>rows,commit:async()=>{commits++;}})).rejects.toThrow('approval');expect(commits).toBe(0);
});