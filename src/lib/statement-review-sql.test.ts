// @vitest-environment node
// Exact applied SQL in disposable disk-backed PostgreSQL; no Cloud records touched.
import { PGlite } from '@electric-sql/pglite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll,afterAll,it,expect } from 'vitest';
const storage=mkdtempSync(join(tmpdir(),'ledgerline-reconciliation-'));
let db=new PGlite(join(storage,'postgres'));
const uid='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002',bank='00000000-0000-0000-0000-000000000010',batch='00000000-0000-0000-0000-000000000020';
const review={identity:{bank:'IDFC',identifier:'1234',reference:'original header',confirmed:true,missingIdentifierConfirmed:false,accountId:bank},coverage:{from:'2026-10-01',to:'2026-10-31',reference:'original period',confirmed:true},convention:'asset'};
async function user(id:string){await db.exec(`RESET ROLE;SELECT set_config('app.uid','${id}',false);SET ROLE authenticated;`);}
beforeAll(async()=>{await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('app.uid',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE finance_preferences(owner_id uuid PRIMARY KEY);INSERT INTO finance_preferences VALUES('${uid}'),('${other}');
CREATE TABLE accounts(id uuid PRIMARY KEY,owner_id uuid,name text,kind text,opening_balance numeric,archived boolean);INSERT INTO accounts VALUES('${bank}','${uid}','IDFC Bank','savings',1000,false);
CREATE TABLE import_batches(id uuid PRIMARY KEY,owner_id uuid,account_id uuid,status text,period_from date,period_to date,currency text,opening_balance numeric,closing_balance numeric,balance_verification jsonb DEFAULT '{}',updated_at timestamptz);INSERT INTO import_batches(id,owner_id,account_id,status,currency) VALUES('${batch}','${uid}','${bank}','review','INR');
CREATE TABLE import_rows(id uuid,owner_id uuid,batch_id uuid,line jsonb,proposal jsonb,decision text,duplicate_kind text,duplicate_id uuid,fingerprint text);
CREATE TABLE import_posts(owner_id uuid,account_id uuid,batch_id uuid,fingerprint text,transaction_id uuid,posted_at timestamptz);
CREATE TABLE expenses(id uuid,employee_id uuid,account_id uuid,to_account_id uuid,correction_revision bigint);
CREATE TABLE import_audit(owner_id uuid,batch_id uuid,action text,details jsonb);
GRANT SELECT ON import_batches TO authenticated;`);await db.exec(readFileSync('drizzle/migrations/0042_statement_identity_coverage_and_checkpoints.sql','utf8'));await db.exec(readFileSync('drizzle/migrations/0043_guard_statement_identity_at_atomic_post.sql','utf8'));},20000);
afterAll(async()=>{await db.close();rmSync(storage,{recursive:true,force:true});});
it('owner confirms separate identity and coverage, persisted reload leaves account and money unchanged',async()=>{await user(uid);await db.query('SELECT review_statement_evidence($1,$2::jsonb,$3::jsonb)',[batch,'{}',JSON.stringify(review)]);const result=await db.query<{account_id:string;statement_review:typeof review}>('SELECT account_id,statement_review FROM import_batches');expect(result.rows[0]?.account_id).toBe(bank);expect(result.rows[0]?.statement_review.coverage.to).toBe('2026-10-31');});
it('stale review is rejected instead of overwriting another device',async()=>{await user(uid);await expect(db.query('SELECT review_statement_evidence($1,$2::jsonb,$3::jsonb)',[batch,'{}',JSON.stringify(review)])).rejects.toThrow('changed');});
it('unrelated owner cannot confirm account evidence',async()=>{await user(other);await expect(db.query('SELECT review_statement_evidence($1,$2::jsonb,$3::jsonb)',[batch,'{}',JSON.stringify(review)])).rejects.toThrow('unavailable');});
it('ordinary callers cannot fabricate successful reconciliation checkpoints',async()=>{await user(uid);await expect(db.query('SELECT record_statement_checkpoint($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9::jsonb)',[batch,uid,batch,'{}','[]','[]','[]','fake','{"reconciliation":"Reconciled"}'])).rejects.toThrow('permission denied');});
it('atomic posting rejects unconfirmed identity before any fingerprint can be recorded',async()=>{await db.exec(`RESET ROLE;INSERT INTO import_batches(id,owner_id,account_id,status,currency) VALUES('00000000-0000-0000-0000-000000000021','${uid}','${bank}','review','INR');`);await expect(db.query('INSERT INTO import_posts(owner_id,account_id,batch_id,fingerprint) VALUES($1,$2,$3,$4)',[uid,bank,'00000000-0000-0000-0000-000000000021','unconfirmed'])).rejects.toThrow('Confirm statement account');expect((await db.query("SELECT count(*)::int AS n FROM import_posts WHERE fingerprint='unconfirmed'")).rows).toEqual([{n:0}]);});
it('trusted checkpoint checks exact live snapshots before storing an immutable result',async()=>{await db.exec('RESET ROLE');const b=(await db.query<Record<string,unknown>>("SELECT *,to_char(period_from,'YYYY-MM-DD') AS period_from,to_char(period_to,'YYYY-MM-DD') AS period_to FROM import_batches")).rows[0];if(!b)throw Error('fixture missing');const expected={batch:{account_id:b['account_id'],status:b['status'],period_from:b['period_from'],period_to:b['period_to'],currency:b['currency'],opening_balance:null,closing_balance:null,statement_review:b['statement_review'],balance_verification:{},statement_identity:[]},account:{id:bank,name:'IDFC Bank',kind:'savings',opening_balance:1000,archived:false}};const operation='00000000-0000-0000-0000-000000000100';const args=[operation,uid,batch,JSON.stringify(expected),'[]','[]','[]','valid-hash','{"reconciliation":"Requires Review","balance":"Not Verified"}'];await db.query('SELECT record_statement_checkpoint($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9::jsonb)',args);await db.query('SELECT record_statement_checkpoint($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9::jsonb)',args);expect((await db.query('SELECT count(*)::int AS n FROM statement_checkpoints')).rows).toEqual([{n:1}]);await user(other);expect((await db.query('SELECT * FROM statement_checkpoints')).rows).toHaveLength(0);});
it('isolated saved evidence and checkpoint survive a complete storage close and reopen',async()=>{
 await db.exec('RESET ROLE');
 const before=(await db.query<{id:string;created_at:Date;result:unknown}>('SELECT id,created_at,result FROM statement_checkpoints')).rows;
 expect(before).toHaveLength(1);
 await db.close();
 db=new PGlite(join(storage,'postgres'));
 await user(uid);
 const after=(await db.query<{id:string;created_at:Date;result:unknown}>('SELECT id,created_at,result FROM statement_checkpoints')).rows;
 expect(after).toEqual(before);
 expect(after[0]?.result).toEqual({reconciliation:'Requires Review',balance:'Not Verified'});
 const evidence=(await db.query<{statement_review:typeof review}>('SELECT statement_review FROM import_batches WHERE id=$1',[batch])).rows[0];
 expect(evidence?.statement_review.identity.accountId).toBe(bank);
 expect(evidence?.statement_review.coverage.to).toBe('2026-10-31');
 await user(other);
 expect((await db.query('SELECT * FROM statement_checkpoints')).rows).toEqual([]);
});
it('reopening isolated reconciliation storage does not invent ledger entries or change account balances',async()=>{
 await db.exec('RESET ROLE');
 expect((await db.query('SELECT count(*)::int AS n FROM expenses')).rows).toEqual([{n:0}]);
 expect((await db.query('SELECT id,opening_balance FROM accounts')).rows).toEqual([{id:bank,opening_balance:'1000'}]);
});