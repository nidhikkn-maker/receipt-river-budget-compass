// @vitest-environment node
// Actual orchestrator + staged SQL, disposable PostgreSQL; no hosted authority activated.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { atomicStatementUndo } from './atomic-undo';
const owner='00000000-0000-4000-8000-000000000001';
const a='00000000-0000-4000-8000-000000000011',b='00000000-0000-4000-8000-000000000012',op='00000000-0000-4000-8000-000000000021';
it.each(['success','lost-response','mid-delete-failure','stale-revision'] as const)('actual atomic Undo orchestrator → SQL → persistence %s',async mode=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role;CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '${owner}'::uuid$$;
   CREATE TABLE accounts(id uuid,owner_id uuid);
   CREATE TABLE expenses(id uuid PRIMARY KEY,employee_id uuid,amount numeric,statement_ref text,reconciled_at timestamptz,transfer_counterpart_of uuid,correction_revision bigint);
   INSERT INTO expenses VALUES('${a}','${owner}',250,'a',now(),NULL,1),('${b}','${owner}',480,'b',now(),NULL,1);`);
  await db.exec(readFileSync('.lovable/staged-sql/statement-atomic-undo.sql','utf8'));
  const result={posted:[a,b],reconciled:[],evidence:[{id:a,ref:'a'},{id:b,ref:'b'}]};
  const expected=[{id:a,ref:'a',revision:1},{id:b,ref:'b',revision:1}];
  if(mode==='mid-delete-failure')await db.exec(`CREATE FUNCTION fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF OLD.id='${b}'::uuid THEN RAISE EXCEPTION 'injected deletion failure';END IF;RETURN OLD;END$$;CREATE TRIGGER fail BEFORE DELETE ON expenses FOR EACH ROW EXECUTE FUNCTION fail();`);
  if(mode==='stale-revision')await db.exec(`UPDATE expenses SET correction_revision=2 WHERE id='${b}'`);
  const api={receipt:async(id:string)=>(await db.query('SELECT id FROM statement_undo_receipts WHERE owner_id=$1 AND id=$2',[owner,id])).rows.length===1,
   rows:async()=> (await db.query<Record<string,unknown>>('SELECT * FROM expenses ORDER BY id')).rows,
   commit:async(id:string,items:unknown)=>{await db.query('SELECT undo_statement_rows($1,$2::jsonb)',[id,JSON.stringify(items)]);if(mode==='lost-response')throw Error('response interrupted');}};
  if(mode==='mid-delete-failure'||mode==='stale-revision'){
   await expect(atomicStatementUndo(op,result,expected,api)).rejects.toThrow();
   expect((await db.query('SELECT * FROM expenses')).rows).toHaveLength(2);
   expect((await db.query('SELECT * FROM statement_undo_receipts')).rows).toHaveLength(0);
  }else{
   await atomicStatementUndo(op,result,expected,api);
   await atomicStatementUndo(op,result,[],api);
   expect((await db.query('SELECT * FROM expenses')).rows).toHaveLength(0);
   expect((await db.query('SELECT * FROM statement_undo_receipts')).rows).toHaveLength(1);
  }
 }finally{await db.close();}
},20000);