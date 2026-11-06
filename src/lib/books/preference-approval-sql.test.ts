// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll,afterAll,it,expect } from 'vitest';
const db=new PGlite();const owner='00000000-0000-0000-0000-000000000001';
const update=(data:object)=>db.query('UPDATE finance_preferences SET data=$1::jsonb WHERE owner_id=$2',[JSON.stringify(data),owner]);
const save=(id:string,data:object,revision:number,approved:boolean)=>db.query<{revision:number}>('SELECT save_reviewed_preferences($1,$2::jsonb,$3,$4) revision',[id,JSON.stringify(data),revision,approved]);
beforeAll(async()=>{
 await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.uid',true),'')::uuid $$;
 CREATE TABLE finance_preferences(owner_id uuid PRIMARY KEY,data jsonb,revision bigint DEFAULT 1,updated_at timestamptz DEFAULT now());
 CREATE TABLE document_runs(owner_id uuid,data jsonb);
 CREATE FUNCTION bump() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.revision:=OLD.revision+1;RETURN NEW;END $$;
 CREATE TRIGGER bump BEFORE UPDATE ON finance_preferences FOR EACH ROW EXECUTE FUNCTION bump();
 CREATE FUNCTION restore_finance_backup(payload jsonb,display_name text) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE r jsonb;uid uuid:=auth.uid();BEGIN r:=payload;UPDATE public.finance_preferences SET data=r->'data',updated_at=now() WHERE owner_id=uid;RETURN '{}';END $$;
 INSERT INTO finance_preferences(owner_id,data) VALUES('${owner}','{}');SELECT set_config('app.uid','${owner}',false);`);
 await db.exec(readFileSync('.lovable/staged-sql/reviewed_preferences.sql','utf8'));
},20000);
afterAll(()=>db.close());
it('refuses direct financial writes and policy disabling, but allows ordinary settings',async()=>{
 await expect(update({books:{gstInvoices:[{id:'invoice'}]}})).rejects.toThrow(/reviewed approval/);
 await expect(update({books:{policy:{require:{taxTreatment:false}}}})).rejects.toThrow(/reviewed approval/);
 await update({hideAmounts:true});expect((await db.query<{v:boolean}>("SELECT (data->>'hideAmounts')::boolean v FROM finance_preferences")).rows[0]?.v).toBe(true);
});
it('requires explicit approval, exact revision and preserves retry without double-saving',async()=>{
 const rev=(await db.query<{r:number}>('SELECT revision::int r FROM finance_preferences')).rows[0]?.r??0;
 const id='00000000-0000-0000-0000-000000000010',data={books:{entityAccounts:{co:['bank']}}};
 await expect(save(id,data,rev,false)).rejects.toThrow(/Approve/);
 await expect(save(id,data,rev-1,true)).rejects.toThrow(/Records changed/);
 const r=await save(id,data,rev,true);expect(r.rows[0]?.revision).toBe(rev+1);
 expect((await save(id,data,rev,true)).rows[0]?.revision).toBe(rev+1);
 await expect(save(id,{books:{entityAccounts:{other:['bank']}}},rev,true)).rejects.toThrow(/another change/);
 expect((await db.query<{n:number}>('SELECT count(*)::int n FROM preference_approvals')).rows[0]?.n).toBe(1);
});
it('another owner cannot replay approval or read its audit record',async()=>{
 await db.exec("SELECT set_config('app.uid','00000000-0000-0000-0000-000000000002',false)");
 await expect(save('00000000-0000-0000-0000-000000000010',{books:{entityAccounts:{co:['bank']}}},2,true)).rejects.toThrow(/another change/);
 await db.exec('SET ROLE authenticated');expect((await db.query('SELECT * FROM preference_approvals')).rows).toEqual([]);await db.exec('RESET ROLE');
 await db.exec(`SELECT set_config('app.uid','${owner}',false)`);
});
it('confirmed recovery keeps the approval audit and cannot bypass the guard',async()=>{
 await db.query("SELECT restore_finance_backup($1::jsonb,NULL)",[JSON.stringify({data:{books:{entityAccounts:{co:['bank2']}}}})]);
 expect((await db.query<{n:number}>('SELECT count(*)::int n FROM preference_approvals')).rows[0]?.n).toBe(2);
});
// Compatibility matrix: every existing write path must keep working once the guard is active.
it('server-approved document intake still saves directly',async()=>{
 const rev=(await db.query<{r:number}>('SELECT revision::int r FROM finance_preferences')).rows[0]?.r??0;
 const data={books:{gstInvoices:[{id:'from-document'}]}};
 await db.query('INSERT INTO document_runs VALUES($1,$2::jsonb)',[owner,JSON.stringify({intakeAttempt:{data,expected:rev}})]);
 await update(data);
 expect((await db.query<{v:string}>("SELECT data->'books'->'gstInvoices'->0->>'id' v FROM finance_preferences")).rows[0]?.v).toBe('from-document');
});
it('period close/reopen writes (closedPeriods, periodLog) are not approval-gated',async()=>{
 await update({books:{closedPeriods:[{id:'p1',from:'2025-04-01',to:'2026-03-31',closedOn:'2026-04-10',note:'filed'}],periodLog:[{at:'2026-04-10',action:'closed',periodId:'p1',reason:'filed'}]}});
 expect((await db.query<{n:number}>("SELECT jsonb_array_length(data->'books'->'closedPeriods')::int n FROM finance_preferences")).rows[0]?.n).toBe(1);
});
it('the monthly depreciation cron can still prepare journals',async()=>{
 await update({books:{journals:[{id:'j1',assetId:'a1',period:'2026-10',amount:500,kind:'book',status:'prepared'}]}});
 expect((await db.query<{v:string}>("SELECT data->'books'->'journals'->0->>'status' v FROM finance_preferences")).rows[0]?.v).toBe('prepared');
});
it('finance_operation irregular-bill confirmations still upsert',async()=>{
 await db.query("INSERT INTO finance_preferences(owner_id,data) VALUES('00000000-0000-0000-0000-000000000009','{\"irregularConfirmed\":[\"a\"]}')");
 await db.query("UPDATE finance_preferences SET data=jsonb_set(data,'{irregularConfirmed}',data->'irregularConfirmed'||'\"b\"') WHERE owner_id='00000000-0000-0000-0000-000000000009'");
 expect((await db.query<{n:number}>("SELECT jsonb_array_length(data->'irregularConfirmed')::int n FROM finance_preferences WHERE owner_id='00000000-0000-0000-0000-000000000009'")).rows[0]?.n).toBe(2);
});