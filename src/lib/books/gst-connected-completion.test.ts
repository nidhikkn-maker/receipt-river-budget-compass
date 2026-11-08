// @vitest-environment node
import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {emptyBooks} from './types';
import {gstReconciliation,replaceGstDrafts} from './gst-reconciliation';
import {gstr1,gstr3b,matchGstPayments} from './gst';
import {withStates} from './audit';
import type {Expense} from '../expenses';
import type {EntityProfile} from '../entities';
import type {VaultDoc} from '../documents';
const gstin='33AAAAA0000A1Z1';
const entities:EntityProfile[]=[{id:'A',name:'Alpha',kind:'company',pan:'',gstins:[gstin],booksFrom:'2026-27'},{id:'B',name:'Beta',kind:'company',pan:'',gstins:['29BBBBB0000B1Z1'],booksFrom:'2026-27'}];
const books={...emptyBooks(),entityAccounts:{A:['a'],B:['b']},gstInvoices:[{id:'invoice',gstin,kind:'sales' as const,number:'1',date:'2026-10-01',party:'Customer',partyGstin:'',taxable:1000,igst:0,cgst:90,sgst:90,cess:0,docId:'invoice-original'}]};
const payment:Expense={id:'payment',title:`GST ${gstin}`,merchant:null,category:'Tax',scope:'business',memberId:null,splits:[],receipts:[],amount:180,originalAmount:180,currency:'INR',fxRate:1,date:'2026-10-20',description:'',paymentMethod:'bank_transfer',accountId:'a'};
it('ambiguous payments cannot certify liability and stable IDs cannot pay two months',()=>{
 const p={id:'p',date:'2026-10-20',amount:180,text:'GST'};
 expect(matchGstPayments([{period:'2026-10',amount:180}],[p,{...p,id:'q'}])[0]?.paymentId).toBeNull();
 expect(matchGstPayments([{period:'2026-10',amount:180},{period:'2026-11',amount:180}],[p,p]).map(r=>r.paymentId)).toEqual(['p',null]);
});
it('other company and unnamed multi-registration payments cannot settle liability',()=>{
 expect(gstReconciliation(books,entities,[{...payment,accountId:'b'}],'2026-11-08').map(i=>i.key)).toContain(`recon:gst:${gstin}:2026-10:payment`);
 expect(gstReconciliation(books,[{id:'A',name:'Alpha',kind:'company',pan:'',gstins:[gstin,'GA'],booksFrom:'2026-27'}], [{...payment,title:'GST'}],'2026-11-08')).toHaveLength(1);
});
it('original -> frozen draft -> exception -> saved correction -> retry/restart stays owner-isolated',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'gst-connected-'));let db=new PGlite(join(dir,'db'));
 try{
 await db.exec(`CREATE ROLE authenticated;CREATE TABLE state(owner text PRIMARY KEY,data jsonb);ALTER TABLE state ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE ON state TO authenticated;CREATE POLICY own ON state TO authenticated USING(owner=current_setting('app.owner')) WITH CHECK(owner=current_setting('app.owner'));`);
 const asOwner=async(who:string)=>{await db.exec('RESET ROLE');await db.query("select set_config('app.owner',$1,false)",[who]);await db.exec('SET ROLE authenticated');};
 await asOwner('owner');
 const frozen={...books,savedDrafts:[{id:'one',ref:gstin,form:'GSTR-1',period:'2026-10',createdAt:'2026-10-02',data:gstr1(books.gstInvoices,gstin,'2026-10')},{id:'three',ref:gstin,form:'GSTR-3B',period:'2026-10',createdAt:'2026-10-02',data:gstr3b(books.gstInvoices,gstin,'2026-10')}]};
 const changed={...frozen,gstInvoices:frozen.gstInvoices.map(i=>({...i,cgst:100,sgst:100})),gstFilings:[{id:'filing',gstin,period:'2026-10',form:'GSTR-3B',arn:'ARN123',filedOn:'2026-10-20',docId:'return'}]};
 const doc={id:'return',docType:'gst_return',entityId:'A',fields:['output tax','itc claimed','net payable'].map((label,index)=>({label,value:index===1?'0':'200',status:'confirmed',page:1,quote:'Synthetic printed total',confidence:'high'}))} as VaultDoc;
 let state={books:changed,entries:[{...payment,amount:200,originalAmount:200,accountId:'b'}],docs:[doc]};
 const save=async()=>db.query(`INSERT INTO state VALUES('owner',$1::jsonb) ON CONFLICT(owner) DO UPDATE SET data=excluded.data`,[JSON.stringify(state)]);
 const reload=async()=>{state=(await db.query<{data:typeof state}>('SELECT data FROM state')).rows[0]?.data??state;};
 await save();await db.close();db=new PGlite(join(dir,'db'));await asOwner('owner');await reload();
 const exceptions=()=>gstReconciliation(state.books,entities,state.entries,'2026-11-08',state.docs);
 expect(exceptions()).toHaveLength(3);expect(exceptions().every(i=>i.to==='/tax'&&i.evidence.includes('invoice-original'))).toBe(true);
 expect(withStates(exceptions(),exceptions().map(i=>({key:i.key,status:'resolved',note:'Only note',at:'2026-11-08'}))).open).toHaveLength(3);
 state.entries=[{...payment,amount:200,originalAmount:200}];state.books.savedDrafts=replaceGstDrafts(state.books.savedDrafts,state.books.savedDrafts.map(d=>({...d,id:'new',data:d.form==='GSTR-1'?gstr1(state.books.gstInvoices,gstin,'2026-10'):gstr3b(state.books.gstInvoices,gstin,'2026-10')}))) as typeof state.books.savedDrafts;
 await save();await save();await db.close();db=new PGlite(join(dir,'db'));await asOwner('owner');await reload();
 expect(exceptions()).toEqual([]);expect(state.books.savedDrafts.map(d=>d.id)).toEqual(['one','three']);expect(state.entries).toHaveLength(1);
 state.docs=[{...doc,entityId:'B'}];expect(exceptions()[0]?.text).toContain('not comparable');
 state.docs=[{...doc,fields:doc.fields?.map(f=>({...f,status:'read'}))}];expect(exceptions()[0]?.text).toContain('not comparable');
 state.docs=[{...doc,fields:doc.fields?.map(f=>({...f,value:f.label==='net payable'?'180':f.value}))}];expect(exceptions()[0]?.text).toContain('filed figures differ');
 await asOwner('other');expect((await db.query('SELECT * FROM state')).rows).toEqual([]);
 }finally{await db.close();rmSync(dir,{recursive:true,force:true});}
},30000);
