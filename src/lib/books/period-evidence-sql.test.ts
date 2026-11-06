// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
const db=new PGlite();
const owner='00000000-0000-0000-0000-000000000001';
const other='00000000-0000-0000-0000-000000000002';
const id='00000000-0000-0000-0000-000000000003';
const empty={closedPeriods:[],periodLog:[]};
const change=(action='closed',operation=id,expected:object=empty,reason='Reviewed saved records')=>db.query<{e: Record<string,unknown>}>(`SELECT change_accounting_period($1,$2,'period-one','2025-04-01','2026-03-31',$3,$4::jsonb) e`,[operation,action,reason,JSON.stringify(expected)]);
beforeAll(async()=>{
 await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 CREATE TABLE finance_preferences(owner_id uuid primary key,data jsonb,updated_at timestamptz);
 CREATE TABLE expenses(id uuid primary key,employee_id uuid,expense_date date,amount numeric,reconciled_at timestamptz);
 CREATE TABLE documents(id uuid,owner_id uuid,doc_date date,transaction_id uuid);
 CREATE TABLE expense_history(id uuid,expense_id uuid,action text);
 INSERT INTO finance_preferences VALUES('${owner}','{}',now()),('${other}','{}',now());`);
 await db.exec(readFileSync('.lovable/close-evidence.sql','utf8'));
},20000);
beforeEach(async()=>{
 await db.exec(`SELECT set_config('test.uid','${owner}',false); DELETE FROM period_close_evidence; DELETE FROM expenses; UPDATE finance_preferences SET data='{"books":{"closedPeriods":[],"periodLog":[]}}';
 INSERT INTO expenses VALUES('${id}','${owner}','2025-05-01',1250,now());
 INSERT INTO expenses VALUES('${other}','${other}','2025-05-01',999999,null);`);
});
afterAll(()=>db.close());
it('captures owner-only canonical amount and cryptographic revision, not client counts',async()=>{const r=await change(); const e=r.rows[0]?.e; expect(e?.entryCount).toBe(1); expect(e?.reconciled).toBe(1); expect(e?.ledgerRevision).toMatch(/^[a-f0-9]{64}$/); expect((e?.ledger as {amount:number}[])[0]?.amount).toBe(1250);});
it('retries return exactly one immutable evidence record',async()=>{const a=await change(); const b=await change(); expect(a.rows).toEqual(b.rows); const r=await db.query<{n:number}>('SELECT count(*)::int n FROM period_close_evidence'); expect(r.rows[0]?.n).toBe(1);});
it('refuses reusing an operation ID for another request',async()=>{await change(); await expect(change('closed',id,empty,'Different request')).rejects.toThrow(/already used/);});
it('rejects stale period approval snapshots',async()=>{await expect(change('closed',id,{closedPeriods:[],periodLog:[{at:'fake'}]})).rejects.toThrow(/refresh/);});
it('refuses another owner replaying evidence',async()=>{await change(); await db.exec(`SELECT set_config('test.uid','${other}',false)`); await expect(change()).rejects.toThrow(/already used/);});
it('records reopen separately without changing old evidence',async()=>{const closed=await change(); const p=await db.query<{b:typeof empty}>("SELECT data->'books' b FROM finance_preferences WHERE owner_id='"+owner+"'"); await change('reopened','00000000-0000-0000-0000-000000000004',p.rows[0]?.b,'Accountant correction'); const e=await db.query<{e:unknown}>('SELECT evidence e FROM period_close_evidence WHERE id=$1',[id]); expect(e.rows[0]?.e).toEqual(closed.rows[0]?.e); const r=await db.query<{n:number}>('SELECT count(*)::int n FROM period_close_evidence'); expect(r.rows[0]?.n).toBe(2);});
it('requires at least five characters when reopening',async()=>{await change(); const p=await db.query<{b:typeof empty}>("SELECT data->'books' b FROM finance_preferences WHERE owner_id='"+owner+"'"); await expect(change('reopened','00000000-0000-0000-0000-000000000004',p.rows[0]?.b,'no')).rejects.toThrow(/written reason/);});