// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
const db=new PGlite();
const uid='00000000-0000-0000-0000-000000000001';
beforeAll(async()=>{
 await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${uid}'::uuid $$;
 CREATE TABLE finance_preferences(owner_id uuid primary key,data jsonb,updated_at timestamptz); CREATE TABLE expenses(id uuid,employee_id uuid,expense_date date,reconciled_at timestamptz); CREATE TABLE documents(id uuid,owner_id uuid,doc_date date,transaction_id uuid); CREATE TABLE expense_history(id uuid,expense_id uuid);
 INSERT INTO finance_preferences VALUES('${uid}','{}',now());`);
 await db.exec(readFileSync('drizzle/migrations/0070_authoritative_period_close_evidence.sql','utf8'));
 await db.exec(readFileSync('.lovable/period-authority.sql','utf8'));
},20000);
afterAll(()=>db.close());
it('blocks direct closures without evidence while allowing ordinary preference changes',async()=>{
 await expect(db.exec(`UPDATE finance_preferences SET data='{"books":{"closedPeriods":[{"id":"forged"}]}}'`)).rejects.toThrow(/Audit/);
 await db.exec(`UPDATE finance_preferences SET data='{"name":"saved"}'`);
 const r=await db.query<{name:string}>("SELECT data->>'name' name FROM finance_preferences");expect(r.rows[0]?.name).toBe('saved');
});
it('authorized close succeeds, direct reopening fails, marker does not leak to later writes',async()=>{
 await db.query(`SELECT change_accounting_period('00000000-0000-0000-0000-000000000003','closed','p1','2025-04-01','2026-03-31','Reviewed','{"closedPeriods":[],"periodLog":[]}'::jsonb)`);
 await expect(db.exec(`UPDATE finance_preferences SET data='{}'`)).rejects.toThrow(/Audit/);
 const r=await db.query<{n:number}>('SELECT count(*)::int n FROM period_close_evidence');expect(r.rows[0]?.n).toBe(1);
});
it('refuses deleting preference history outside the confirmed erasure path',async()=>{await expect(db.exec('DELETE FROM finance_preferences')).rejects.toThrow(/confirmed account deletion/);});