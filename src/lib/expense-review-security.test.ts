// @vitest-environment node
// Actual retained legacy function and migration revocations, disposable PostgreSQL only.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, expect, it } from 'vitest';
const db = new PGlite();
const owner='00000000-0000-4000-8000-000000000001';
const reviewer='00000000-0000-4000-8000-000000000002';
const expense='00000000-0000-4000-8000-000000000003';
beforeAll(async()=>{
 await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.uid',true),'')::uuid $$;
 CREATE TABLE expenses(id uuid PRIMARY KEY, employee_id uuid, department text, status text, amount numeric);
 CREATE TABLE expense_history(expense_id uuid,actor_id uuid,action text,note text);
 CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
 CREATE FUNCTION my_department() RETURNS text LANGUAGE sql AS $$ SELECT 'Engineering'::text $$;
 INSERT INTO expenses VALUES('${expense}','${owner}','Engineering','pending_manager',12.34);`);
 const source=readFileSync('drizzle/migrations/0000_expenses_core.sql','utf8');
 const start=source.indexOf('CREATE OR REPLACE FUNCTION public.review_expense');
 const end=source.indexOf('-- Receipt files:',start);
 if(start<0||end<0)throw Error('Legacy review definition missing');
 await db.exec(source.slice(start,end));
 const revoke=readFileSync('drizzle/migrations/0002_personal_family_tracker.sql','utf8').split('\n').find(line=>line.startsWith('REVOKE EXECUTE ON FUNCTION public.review_expense'));
 if(!revoke)throw Error('Retired approval revocation missing');
 await db.exec(revoke);
},20000);
afterAll(()=>db.close());
async function denied(role:'authenticated'|'anon',uid:string,decision:string){
 await db.exec(`SELECT set_config('app.uid','${uid}',false); SET ROLE ${role}`);
 try { await expect(db.query('SELECT review_expense($1,$2,NULL)',[expense,decision])).rejects.toThrow(/permission denied/); }
 finally { await db.exec('RESET ROLE'); }
 expect((await db.query<{status:string;amount:string}>('SELECT status,amount FROM expenses')).rows).toEqual([{status:'pending_manager',amount:'12.34'}]);
 expect((await db.query('SELECT * FROM expense_history')).rows).toEqual([]);
}
it('signed-in reviewers cannot invoke the retired approve operation even when role helpers would allow it',()=>denied('authenticated',reviewer,'approve'));
it('signed-in owners cannot invoke retired reimbursement or mutate money/history',()=>denied('authenticated',owner,'reimburse'));
it('anonymous callers cannot invoke the retained legacy approval function',()=>denied('anon','','approve'));