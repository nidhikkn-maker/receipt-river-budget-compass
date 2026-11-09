import { expect,it } from 'vitest';
import { cleanStatementUploads } from './preferences';
it('every upload, finished or not, is kept with sources and receipt links (no completed-upload limit)',()=>{
 const rows=Array.from({length:12},(_,i)=>({id:`run${i}`,at:'2026-11-07',label:'Statement',posted:['p'],reconciled:[],createdAccounts:[],status:'complete'}));
 const partial={...rows[0],id:'unfinished',status:'interrupted',sources:[{documentId:'original',accountId:'bank',file:'statement.csv'}],linkedDrafts:[{draftId:'receipt',transactionId:'p'}]};
 const clean=cleanStatementUploads([...rows,partial]);
 expect(clean).toHaveLength(13);expect(clean.find(r=>r.id==='unfinished')).toMatchObject({status:'interrupted',sources:partial.sources,linkedDrafts:partial.linkedDrafts});
});