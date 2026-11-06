// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
const db = new PGlite();
const owner='00000000-0000-0000-0000-000000000001', doc='00000000-0000-0000-0000-000000000002', op='00000000-0000-0000-0000-000000000003';
let revision=0;
const commit=async(data:object) =>{await db.query(`INSERT INTO document_runs(owner_id,data) VALUES ($1,jsonb_build_object('intakeAttempt',jsonb_build_object('id',$2::text,'documentId',$3::text,'data',$4::jsonb,'lock',true,'expected',$5::bigint)))`,[owner,op,doc,JSON.stringify(data),revision]);return db.query<{r:number}>('SELECT commit_document_intake_reviewed($1,$2,$3::jsonb,true,$4)::int r',[op,doc,JSON.stringify(data),revision]);};
const holding={id:'h1',name:'Printed fund',kind:'mutual_fund',quantity:50,sharePct:100,source:'Statement'};
beforeAll(async()=>{
 await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${owner}'::uuid $$;
 CREATE TABLE finance_preferences(owner_id uuid primary key,data jsonb,updated_at timestamptz);
 CREATE TABLE documents(id uuid primary key,owner_id uuid,evidence_locked boolean,doc_type text);
 CREATE TABLE document_runs(owner_id uuid,data jsonb);
 CREATE FUNCTION commit_document_intake(uuid,jsonb,boolean) RETURNS void LANGUAGE sql AS $$ SELECT $$;
 INSERT INTO finance_preferences VALUES('${owner}','{}',now()); INSERT INTO documents VALUES('${doc}','${owner}',false,'mutual_fund_statement');`);
 await db.exec(readFileSync('drizzle/migrations/0071_revision_checked_document_intake.sql','utf8'));
 await db.exec(readFileSync('drizzle/migrations/0074_typed_document_intake_validation.sql','utf8'));
 await db.exec(readFileSync('drizzle/migrations/0079_intake_server_approval.sql','utf8'));
},20000);
beforeEach(async()=>{
 await db.exec(`DELETE FROM document_intake_commits; DELETE FROM document_runs; UPDATE finance_preferences SET data='{}'; UPDATE documents SET evidence_locked=false,doc_type='mutual_fund_statement'`);
 revision=(await db.query<{r:number}>('SELECT revision::int r FROM finance_preferences')).rows[0]?.r??0;
});
afterAll(()=>db.close());
it('accepts typed fund quantities and retries once without a second revision',async()=>{
 const a=await commit({books:{holdings:[holding]}}); const b=await commit({books:{holdings:[holding]}});
 expect(a.rows[0]?.r).toBe(revision+1); expect(a.rows).toEqual(b.rows);
});
it('rejects string amounts and changes neither records nor evidence lock',async()=>{
 await expect(commit({books:{holdings:[{...holding,quantity:'50'}]}})).rejects.toThrow(/quantity/);
 expect((await db.query<{data:unknown}>('SELECT data FROM finance_preferences')).rows[0]?.data).toEqual({});
 expect((await db.query<{locked:boolean}>('SELECT evidence_locked locked FROM documents')).rows[0]?.locked).toBe(false);
});
it('rejects negative quantities and ownership exceeding 100 percent',async()=>{
 await expect(commit({books:{holdings:[{...holding,quantity:-1}]}})).rejects.toThrow(/quantity/);
 await expect(commit({books:{holdings:[{...holding,sharePct:101}]}})).rejects.toThrow(/exceeds 100/);
});
it('rejects document-type inconsistent records',async()=>{
 await expect(commit({assets:[{id:'a1',name:'Asset',cost:100,inUse:'2026-04-01',kind:'computer',bookMethod:'slm'}]})).rejects.toThrow(/document type/);
});
it('permits company creation with all descriptive fields blank',async()=>{
 await db.exec("UPDATE documents SET doc_type='incorporation'");
 await commit({entities:[{id:'e1',name:'',kind:'company',pan:'',gstins:[]}]});
 expect((await db.query<{data:{entities:{name:string}[]}}>('SELECT data FROM finance_preferences')).rows[0]?.data.entities[0]?.name).toBe('');
});
it('rejects malformed lists and impossible dates',async()=>{
 await expect(commit({books:{holdings:{id:'h1'}}})).rejects.toThrow(/record list/);
 await db.exec("UPDATE documents SET doc_type='asset_invoice'");
 await expect(commit({assets:[{id:'a1',name:'Asset',cost:100,inUse:'2026-02-30',kind:'computer',bookMethod:'slm'}]})).rejects.toThrow(/calendar date/);
});
it('rejects reversed lease dates and missing property links',async()=>{
 await db.exec("UPDATE documents SET doc_type='lease_agreement'");
 await expect(commit({books:{leases:[{id:'l1',rent:100,start:'2026-06-01',end:'2026-05-01',propertyId:'p1'}]}})).rejects.toThrow(/lease facts/);
 await expect(commit({books:{leases:[{id:'l1',rent:100,start:'2026-05-01',end:'2026-06-01',propertyId:''}]}})).rejects.toThrow(/lease facts/);
});
it('preserves unchanged legacy rows while validating new typed rows',async()=>{
 await db.exec(`UPDATE finance_preferences SET data='{"assets":[{"legacy":true}]}'`);
 revision=(await db.query<{r:number}>('SELECT revision::int r FROM finance_preferences')).rows[0]?.r??0;
 await commit({assets:[{legacy:true}],books:{holdings:[holding],leases:[],gstInvoices:[]}});
 expect((await db.query<{data:{assets:unknown[]}}>('SELECT data FROM finance_preferences')).rows[0]?.data.assets).toEqual([{legacy:true}]);
});