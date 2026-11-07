// @vitest-environment node
// Actual company upload orchestrator + installed STAGED SQL in disposable PostgreSQL.
// Storage bytes/signing are controlled adapters, NOT hosted-service certification.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { companyFilePrefix, uploadCompanyDocument, type CompanyUploadApi } from './company-upload';
import { privateFileUrl } from '../private-files';
const OWNER='00000000-0000-4000-8000-000000000001', EDITOR='00000000-0000-4000-8000-000000000002', OTHER='00000000-0000-4000-8000-000000000003';
let db: PGlite;
const as = (id:string) => db.exec(`RESET ROLE; SELECT set_config('test.uid','${id}',false); SET ROLE authenticated`);
beforeEach(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE SCHEMA storage;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
  CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
  CREATE TABLE finance_preferences(owner_id uuid PRIMARY KEY,data jsonb);
  CREATE TABLE documents(id text PRIMARY KEY,owner_id uuid,file_path text UNIQUE);
  CREATE TABLE storage.objects(bucket_id text,name text PRIMARY KEY,owner_id text);
  GRANT USAGE ON SCHEMA auth,storage TO authenticated; GRANT SELECT,INSERT,UPDATE,DELETE ON documents,storage.objects TO authenticated;
  ALTER TABLE documents ENABLE ROW LEVEL SECURITY; ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE POLICY own ON documents FOR ALL TO authenticated USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
  CREATE POLICY ownfile ON storage.objects FOR ALL TO authenticated USING(split_part(name,'/',1)=auth.uid()::text) WITH CHECK(split_part(name,'/',1)=auth.uid()::text);
  INSERT INTO finance_preferences VALUES('${OWNER}','{"entities":[{"id":"c1"},{"id":"c2"}]}');`);
  await db.exec(readFileSync('drizzle/migrations/0075_entity_level_access.sql','utf8'));
  await db.exec(readFileSync('drizzle/migrations/0078_entity_member_uploads.sql','utf8'));
  await db.exec(readFileSync('.lovable/staged-sql/company-bound-uploads.sql','utf8'));
  await db.exec(`INSERT INTO entity_members(owner_id,entity_id,member_id,member_email,can_write) VALUES('${OWNER}','c1','${EDITOR}','editor@test.invalid',true),('${OWNER}','c2','${OTHER}','other@test.invalid',true);
  INSERT INTO documents VALUES('personal','${OWNER}','${OWNER}/docs/personal.pdf',NULL),('c2-original','${OWNER}','${OWNER}/docs/c2.pdf','c2');`);
},20000);
afterEach(()=>db.close());
const insertFile=(path:string, owner=EDITOR)=>db.query("INSERT INTO storage.objects VALUES('receipts',$1,$2)",[path,owner]);
function api(mode:'ok'|'failure'|'lost'='ok'):CompanyUploadApi {
  return {
    canWrite:async(o,e)=>(await db.query<{ok:boolean}>('SELECT can_access_entity($1,$2,true) ok',[o,e])).rows[0]?.ok===true,
    upload:async(path)=>{await insertFile(path);},
    save:async(id,path)=>{if(mode==='failure')throw Error('metadata failed'); await db.query('INSERT INTO documents VALUES($1,$2,$3,$4)',[id,OWNER,path,'c1']); if(mode==='lost')throw Error('lost response');},
    find:async(id,path)=>(await db.query('SELECT id FROM documents WHERE id=$1 AND file_path=$2',[id,path])).rows.length===1,
    remove:async(path)=>{const r=await db.query('DELETE FROM storage.objects WHERE name=$1',[path]); if(r.affectedRows!==1)throw Error('cleanup refused');},
  };
}
it('upload → private read → revocation keeps exact company original, no personal or cross-company access',async()=>{
  await as(EDITOR); const file=new File(['Date,Debit\n2026-10-01,250'],'broker.csv',{type:'text/csv'});
  await uploadCompanyDocument(OWNER,'c1',file,api());
  const docs=(await db.query<{file_path:string}>('SELECT file_path FROM documents')).rows;
  expect(docs).toHaveLength(1); const path=docs[0]?.file_path; if(!path)throw Error('No original');
  expect(path.startsWith(companyFilePrefix(OWNER,'c1'))).toBe(true);
  const urlApi={canRead:async(p:string)=>(await db.query('SELECT name FROM storage.objects WHERE name=$1',[p])).rows.length===1,sign:async(_p:string,s:number)=>{expect(s).toBe(60);return 'https://controlled.invalid/download';}};
  expect(await privateFileUrl(path,urlApi)).toBe('https://controlled.invalid/download');
  await as(OTHER); expect(await privateFileUrl(path,urlApi)).toBeNull();
  await as(OWNER); const grant=(await db.query<{id:string}>('SELECT id FROM entity_members WHERE member_id=$1',[EDITOR])).rows[0];
  if(!grant)throw Error('Missing grant'); await db.query('SELECT revoke_entity_access($1)',[grant.id]);
  await as(EDITOR); expect(await privateFileUrl(path,urlApi)).toBeNull();
  await expect(uploadCompanyDocument(OWNER,'c1',file,api())).rejects.toThrow(/edit access/);
  await as(OWNER); expect((await db.query('SELECT name FROM storage.objects')).rows).toHaveLength(1);
});
it('an edit grant cannot upload elsewhere, spoof the storage owner, or reference another company original',async()=>{
  await as(EDITOR);
  for(const path of [`${OWNER}/docs/x.pdf`,`${companyFilePrefix(OWNER,'c2')}x.pdf`,`${companyFilePrefix(OWNER,'c1')}../x.pdf`])await expect(insertFile(path)).rejects.toThrow(/row-level security/);
  await expect(insertFile(`${companyFilePrefix(OWNER,'c1')}x.pdf`,OWNER)).rejects.toThrow(/row-level security/);
  await expect(db.query('INSERT INTO documents VALUES($1,$2,$3,$4)',['leak',OWNER,`${OWNER}/docs/c2.pdf`,'c1'])).rejects.toThrow(/exact company/);
  await as(OWNER); await insertFile(`${OWNER}/docs/own.pdf`,OWNER); expect((await db.query('SELECT name FROM storage.objects')).rows).toHaveLength(1);
});
it('owner retagging revokes uploader access too; shared editors cannot replace existing source evidence',async()=>{
  await as(EDITOR);await uploadCompanyDocument(OWNER,'c1',new File(['original'],'original.pdf'),api());
  await db.exec(readFileSync('drizzle/migrations/0076_entity_scoped_transactions.sql','utf8').split('DROP POLICY IF EXISTS "Entity editors update company documents"')[1] ? 'SELECT 1' : 'SELECT 1');
  await db.exec('RESET ROLE; CREATE POLICY editorupdate ON documents FOR UPDATE TO authenticated USING(can_access_entity(owner_id,entity_id,true)) WITH CHECK(can_access_entity(owner_id,entity_id,true));');
  await as(EDITOR);
  await expect(db.query('UPDATE documents SET file_path=$1 WHERE entity_id=$2',[`${companyFilePrefix(OWNER,'c1')}replacement.pdf`,'c1'])).rejects.toThrow(/cannot replace/);
  await as(OWNER);await db.query("UPDATE documents SET entity_id='c2' WHERE entity_id='c1'");
  await as(EDITOR);expect((await db.query('SELECT name FROM storage.objects')).rows).toHaveLength(0);
});
it.each(['failure','lost'] as const)('metadata %s safely cleans only uncommitted originals and keeps committed read-back',async(mode)=>{
  await as(EDITOR); const run=uploadCompanyDocument(OWNER,'c1',new File(['original'],'invoice.pdf'),api(mode));
  if(mode==='failure')await expect(run).rejects.toThrow(/metadata failed/);else await run;
  expect((await db.query('SELECT name FROM storage.objects')).rows).toHaveLength(mode==='failure'?0:1);
  expect((await db.query('SELECT id FROM documents')).rows).toHaveLength(mode==='failure'?0:1);
  if(mode==='lost')expect((await db.query('DELETE FROM storage.objects')).affectedRows).toBe(0);
});