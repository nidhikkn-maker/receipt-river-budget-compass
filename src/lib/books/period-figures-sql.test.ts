// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
const db=new PGlite();
const owner='00000000-0000-0000-0000-000000000001';
const other='00000000-0000-0000-0000-000000000002';
const id='00000000-0000-0000-0000-000000000003';
const empty={closedPeriods:[],periodLog:[]};
const figures={version:1,entries:{count:1,income:0,expenses:1250,moves:0,adjustments:0,reconciled:1},gst:{outputTaxable:0,outputTax:0,inputTaxable:0,inputTax:0,rcmCash:0},depreciation:{posted:0,journals:0},balances:{'acc-1':5000}};
const change=(operation=id,figs:object|null=figures,expected:object=empty)=>db.query<{e:Record<string,unknown>}>(`SELECT change_accounting_period($1,'closed','period-one','2025-04-01','2026-03-31','Reviewed saved records',$2::jsonb,$3::jsonb) e`,[operation,JSON.stringify(expected),figs&&JSON.stringify(figs)]);
beforeAll(async()=>{
 await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 CREATE TABLE finance_preferences(owner_id uuid primary key,data jsonb,updated_at timestamptz);
 CREATE TABLE expenses(id uuid primary key,employee_id uuid,expense_date date,amount numeric,reconciled_at timestamptz);
 CREATE TABLE documents(id uuid,owner_id uuid,doc_date date,transaction_id uuid);
 CREATE TABLE expense_history(id uuid,expense_id uuid,action text);
 CREATE TABLE accounts(id uuid,owner_id uuid,name text,kind text,opening_balance numeric);
 INSERT INTO finance_preferences VALUES('${owner}','{}',now()),('${other}','{}',now());`);
 await db.exec(readFileSync('drizzle/migrations/0070_authoritative_period_close_evidence.sql','utf8'));
 await db.exec(readFileSync('drizzle/migrations/0072_period_recovery_authority.sql','utf8'));
 await db.exec(readFileSync('drizzle/migrations/0084_period_figure_snapshots.sql','utf8'));
},20000);
beforeEach(async()=>{
 await db.exec(`SELECT set_config('test.uid','${owner}',false); DELETE FROM period_close_evidence; DELETE FROM expenses; DELETE FROM accounts; UPDATE finance_preferences SET data='{"books":{"closedPeriods":[],"periodLog":[]}}';
 INSERT INTO expenses VALUES('${id}','${owner}','2025-05-01',1250,now());
 INSERT INTO accounts VALUES('00000000-0000-0000-0000-0000000000a1','${owner}','CUB savings','savings',5000),('00000000-0000-0000-0000-0000000000a2','${other}','Not yours','savings',1);`);
});
afterAll(()=>db.close());
it('freezes derived figures, their revision and an owner-only account snapshot into the evidence',async()=>{
 const r=await change(); const e=r.rows[0]?.e;
 expect(e?.['derivedFigures']).toEqual(figures);
 expect(e?.['figureRevision']).toMatch(/^[a-f0-9]{64}$/);
 const accts=e?.['accounts'] as {name:string}[];
 expect(accts.map((a)=>a.name)).toEqual(['CUB savings']);
});
it('keeps the old six-argument call working without figures',async()=>{
 const r=await db.query<{e:Record<string,unknown>}>(`SELECT change_accounting_period($1,'closed','period-one','2025-04-01','2026-03-31','Reviewed saved records',$2::jsonb) e`,[id,JSON.stringify(empty)]);
 expect(r.rows[0]?.e?.['entryCount']).toBe(1);
 expect(r.rows[0]?.e?.['derivedFigures']).toBeUndefined();
});
it('rejects malformed figure sets',async()=>{
 await expect(change(id,{version:2})).rejects.toThrow(/Invalid period figures/);
 await expect(change(id,{version:1,entries:{}})).rejects.toThrow(/Invalid period figures/);
});
it('retries with figures return one immutable evidence record',async()=>{
 const a=await change(); const b=await change(); expect(a.rows).toEqual(b.rows);
 expect((await db.query<{n:number}>('SELECT count(*)::int n FROM period_close_evidence')).rows[0]?.n).toBe(1);
});
