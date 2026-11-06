// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
const db=new PGlite();
const owner='00000000-0000-0000-0000-000000000001', other='00000000-0000-0000-0000-000000000002', doc='00000000-0000-0000-0000-000000000003', op='00000000-0000-0000-0000-000000000004';
let revision=0;
const seedRun=async(uid:string,id:string,docId:string,data:object,lock:boolean,expected:number)=>{await db.query(`DELETE FROM document_runs WHERE data->'intakeAttempt'->>'id'=$1`,[id]);await db.query(`INSERT INTO document_runs(owner_id,data) VALUES ($1,jsonb_build_object('intakeAttempt',jsonb_build_object('id',$2::text,'documentId',$3::text,'data',$4::jsonb,'lock',$5,'expected',$6::bigint)))`,[uid,id,docId,JSON.stringify(data),lock,expected]);};
const commit=async(expected=revision,id=op,lock=true,data:object={books:{holdings:[{id:'h1',quantity:10}]}})=>{const uid=(await db.query<{u:string}>(`SELECT nullif(current_setting('test.uid',true),'') u`)).rows[0]?.u??owner;await seedRun(uid,id,doc,data,lock,expected);return db.query<{revision:number}>('SELECT commit_document_intake_reviewed($1,$2,$3::jsonb,$4,$5)::int revision',[id,doc,JSON.stringify(data),lock,expected]);};
beforeAll(async()=>{
 await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 CREATE TABLE finance_preferences(owner_id uuid primary key,data jsonb,updated_at timestamptz);
 CREATE TABLE documents(id uuid primary key,owner_id uuid,evidence_locked boolean);
 CREATE TABLE document_runs(owner_id uuid,data jsonb);
 CREATE FUNCTION commit_document_intake(uuid,jsonb,boolean) RETURNS void LANGUAGE sql AS $$ SELECT $$;
 INSERT INTO finance_preferences VALUES('${owner}','{}',now()),('${other}','{}',now()); INSERT INTO documents VALUES('${doc}','${owner}',false);`);
 await db.exec(readFileSync('drizzle/migrations/0071_revision_checked_document_intake.sql','utf8'));
 await db.exec(readFileSync('drizzle/migrations/0074_typed_document_intake_validation.sql','utf8'));
 await db.exec(readFileSync('drizzle/migrations/0079_intake_server_approval.sql','utf8'));
},20000);
beforeEach(async()=>{await db.exec(`SELECT set_config('test.uid','${owner}',false); DELETE FROM document_intake_commits; DELETE FROM document_runs; UPDATE documents SET evidence_locked=false; UPDATE finance_preferences SET data='{}';`);const r=await db.query<{r:number}>(`SELECT revision::int r FROM finance_preferences WHERE owner_id='${owner}'`);revision=r.rows[0]?.r??0;});
afterAll(()=>db.close());
it('fresh commit advances one revision and locks evidence',async()=>{const r=await commit();expect(r.rows[0]?.revision).toBe(revision+1);const d=await db.query<{locked:boolean}>('SELECT evidence_locked locked FROM documents');expect(d.rows[0]?.locked).toBe(true);});
it('stale commit after an ordinary preference write changes neither records nor lock',async()=>{await db.exec(`UPDATE finance_preferences SET data='{"name":"newer"}' WHERE owner_id='${owner}'`);await expect(commit()).rejects.toThrow(/Records changed/);const r=await db.query<{name:string}>(`SELECT data->>'name' name FROM finance_preferences WHERE owner_id='${owner}'`);expect(r.rows[0]?.name).toBe('newer');const d=await db.query<{locked:boolean}>('SELECT evidence_locked locked FROM documents');expect(d.rows[0]?.locked).toBe(false);});
it('retries a completed locked save without increment or duplicates',async()=>{const a=await commit();const b=await commit();expect(a.rows).toEqual(b.rows);const r=await db.query<{n:number}>('SELECT count(*)::int n FROM document_intake_commits');expect(r.rows[0]?.n).toBe(1);});
it('rejects another operation on locked evidence',async()=>{await commit();await expect(commit(revision+1,'00000000-0000-0000-0000-000000000005')).rejects.toThrow(/locked/);});
it('refuses cross-owner documents even with their current revision',async()=>{await db.exec(`SELECT set_config('test.uid','${other}',false)`);const r=await db.query<{r:number}>(`SELECT revision::int r FROM finance_preferences WHERE owner_id='${other}'`);await expect(commit(r.rows[0]?.r)).rejects.toThrow(/Review the document/);});
it('refuses a commit that no approved run retained, and one that differs from the approved payload',async()=>{
 await expect(db.query('SELECT commit_document_intake_reviewed($1,$2,$3::jsonb,true,$4)',[op,doc,'{}',revision])).rejects.toThrow(/Review the document/);
 await seedRun(owner,op,doc,{books:{holdings:[{id:'h1',quantity:10}]}},true,revision);
 await expect(db.query('SELECT commit_document_intake_reviewed($1,$2,$3::jsonb,true,$4)',[op,doc,'{"books":{"holdings":[{"id":"h1","quantity":99}]}}',revision])).rejects.toThrow(/does not match the approved review/);
 await expect(db.query('SELECT commit_document_intake_reviewed($1,$2,$3::jsonb,false,$4)',[op,doc,'{"books":{"holdings":[{"id":"h1","quantity":10}]}}',revision])).rejects.toThrow(/does not match the approved review/);
});
it('a committed retry still succeeds after the run attempt is removed',async()=>{
 const a=await commit();
 await db.exec(`DELETE FROM document_runs`);
 const b=await commit();
 expect(a.rows).toEqual(b.rows);
});
it('keeps document unlocked when no lock requested',async()=>{await commit(revision,op,false);const d=await db.query<{locked:boolean}>('SELECT evidence_locked locked FROM documents');expect(d.rows[0]?.locked).toBe(false);});
it('one of two same-revision saves succeeds and the other is rejected',async()=>{await commit(revision,op,false);await expect(commit(revision,'00000000-0000-0000-0000-000000000005',false)).rejects.toThrow(/Records changed/);const r=await db.query<{n:number}>('SELECT count(*)::int n FROM document_intake_commits');expect(r.rows[0]?.n).toBe(1);});