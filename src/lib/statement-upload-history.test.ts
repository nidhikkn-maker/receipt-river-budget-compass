import { expect,it } from 'vitest';
import { cleanStatementUploads } from './preferences';
it('unfinished uploads survive the ten-completed-upload retention limit with sources and receipt links',()=>{
 const rows=Array.from({length:12},(_,i)=>({id:`run${i}`,at:'2026-11-07',label:'Statement',posted:['p'],reconciled:[],createdAccounts:[],status:'complete'}));
 const partial={...rows[0],id:'unfinished',status:'interrupted',sources:[{documentId:'original',accountId:'bank',file:'statement.csv'}],linkedDrafts:[{draftId:'receipt',transactionId:'p'}]};
 const clean=cleanStatementUploads([...rows,partial]);
 expect(clean).toHaveLength(11);expect(clean.find(r=>r.id==='unfinished')).toMatchObject({status:'interrupted',sources:partial.sources,linkedDrafts:partial.linkedDrafts});
});