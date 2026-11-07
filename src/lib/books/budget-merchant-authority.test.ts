// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, expect, it } from 'vitest';
const db = new PGlite();
const owner = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const entryId = '00000000-0000-0000-0000-000000000003';
let seq = 20;
const revision = async () => (await db.query<{r:number}>('SELECT revision::int r FROM finance_preferences WHERE owner_id=$1',[owner])).rows[0]?.r ?? 0;
const data = async () => (await db.query<{data:Record<string,unknown>}>('SELECT data FROM finance_preferences WHERE owner_id=$1',[owner])).rows[0]?.data ?? {};
const save = async (next:object, rev?:number, id?:string) => db.query('SELECT save_reviewed_preferences($1,$2::jsonb,$3,false)',[
 id ?? `00000000-0000-0000-0000-${String(seq++).padStart(12,'0')}`,JSON.stringify(next),rev ?? await revision()]);
const snapshot = [{id:entryId,merchant:'Alpha',amount:0.3,date:'2026-11-01',currency:'INR',originalAmount:0.3,title:'Original'}];
const event = (before:object,after:object,extra:object={}) => ({id:`e${seq++}`,date:'2026-11-07',title:'Reviewed merge',before,after,entryIds:[entryId],entrySnapshot:snapshot,...extra});
beforeAll(async () => {
 await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.uid',true),'')::uuid $$;
 CREATE TABLE finance_preferences(owner_id uuid PRIMARY KEY,data jsonb,revision bigint DEFAULT 1,updated_at timestamptz DEFAULT now());
 CREATE FUNCTION bump() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.revision:=OLD.revision+1; RETURN NEW; END $$;
 CREATE TRIGGER bump BEFORE UPDATE ON finance_preferences FOR EACH ROW EXECUTE FUNCTION bump();
 CREATE TABLE expenses(id uuid PRIMARY KEY,employee_id uuid,merchant text,amount numeric,expense_date date,currency text,original_amount numeric,title text);
 INSERT INTO expenses VALUES('${entryId}','${owner}','Alpha',0.3,'2026-11-01','INR',0.3,'Original');
 INSERT INTO finance_preferences(owner_id,data) VALUES('${owner}','{}'),('${other}','{}');
 SELECT set_config('app.uid','${owner}',false);`);
 await db.exec(readFileSync('drizzle/migrations/0080_reviewed_preference_saves.sql','utf8'));
 await db.exec(readFileSync('.lovable/staged-sql/budget-merchant-authority.sql','utf8'));
},20000);
afterAll(()=>db.close());

it('rejects incomplete promised dimensions through actual save RPC and direct writes without revisions or audit',async()=>{
 const before=await revision(); const next={trips:[{id:'t',budget:100,completeBudgetDimensions:['workspace'],workspaceBudgets:[{amount:90}]}]};
 await expect(save(next)).rejects.toThrow(/match the primary budget/);
 await expect(db.query('UPDATE finance_preferences SET data=$1 WHERE owner_id=$2',[JSON.stringify(next),owner])).rejects.toThrow(/match the primary budget/);
 expect(await revision()).toBe(before); expect((await db.query('SELECT * FROM preference_approvals')).rows).toHaveLength(0);
});
it('persists independently reconciled workspace/traveller/currency decimal plans and replays exactly once',async()=>{
 const next={trips:[{id:'t',budget:0.3,completeBudgetDimensions:['workspace','traveller','currency'],workspaceBudgets:[{amount:0.1},{amount:0.2}],travellerBudgets:[{amount:0.3}],currencyBudgets:[{amount:0.1,planningRate:3}]}]};
 const rev=await revision(), id='00000000-0000-0000-0000-000000000100';
 await save(next,rev,id); await save(next,rev,id);
 expect(await data()).toEqual(next); expect(await revision()).toBe(rev+1);
 await expect(save({...next,trips:[{...next.trips[0],budget:0.4}]})).rejects.toThrow(/match the primary budget/);
});
it('rejects invalid rates and unknown dimensions, but permits unpromised partial plans',async()=>{
 await expect(save({trips:[{budget:100,completeBudgetDimensions:['currency'],currencyBudgets:[{amount:100,planningRate:0}]}]})).rejects.toThrow(/exchange rate/);
 await expect(save({trips:[{budget:100,completeBudgetDimensions:['invented']}]})).rejects.toThrow(/Invalid complete/);
 await save({trips:[{id:'t',budget:100,workspaceBudgets:[{amount:90}]}]});
 expect((await data())['trips']).toEqual([{id:'t',budget:100,workspaceBudgets:[{amount:90}]}]);
});
it('persists reviewed merchant changes, retains exact sources and denies history deletion or mutation',async()=>{
 const e=event({}, {alpha:'beta'}); await save({merchantAliases:e.after,merchantGroupingHistory:[e]});
 const saved=await data(), rev=await revision();
 await expect(save({...saved,merchantGroupingHistory:[]})).rejects.toThrow(/append-only/);
 await expect(save({...saved,merchantGroupingHistory:[{...e,title:'Tampered'},event(e.after,{alpha:'gamma'})],merchantAliases:{alpha:'gamma'}})).rejects.toThrow(/cannot be edited/);
 await expect(save({...saved,merchantAliases:{alpha:'gamma'}})).rejects.toThrow(/append-only/);
 expect(await revision()).toBe(rev); expect(await data()).toEqual(saved);
 expect((await db.query('SELECT merchant,amount,currency,original_amount,title FROM expenses')).rows[0]).toEqual({merchant:'Alpha',amount:'0.3',currency:'INR',original_amount:'0.3',title:'Original'});
});
it('refuses stale affected-record approval and another owner replay',async()=>{
 const saved=await data(), history=saved['merchantGroupingHistory'] as ReturnType<typeof event>[];
 const e=event({alpha:'beta'},{alpha:'gamma'});
 await db.exec(`UPDATE expenses SET amount=0.4 WHERE id='${entryId}'`);
 await expect(save({merchantAliases:e.after,merchantGroupingHistory:[...history,e]})).rejects.toThrow(/Affected merchant records changed/);
 await db.exec(`UPDATE expenses SET amount=0.3 WHERE id='${entryId}'`);
 await db.exec(`SELECT set_config('app.uid','${other}',false)`);
 await expect(save({merchantAliases:e.after,merchantGroupingHistory:[e]},1)).rejects.toThrow(/does not match|Affected merchant/);
 await db.exec(`SELECT set_config('app.uid','${owner}',false)`);
});
it('reverses a reviewed merge exactly, retains both events and rejects repeated reversal',async()=>{
 const saved=await data(), history=saved['merchantGroupingHistory'] as ReturnType<typeof event>[];
 const first=history[0]; if(!first) throw Error('Expected persisted merge');
 const undo=event(first.after,first.before,{reverses:first.id});
 await save({merchantAliases:{},merchantGroupingHistory:[...history,undo]});
 expect((await data())['merchantGroupingHistory']).toEqual([...history,undo]);
 const again=event({}, {alpha:'beta'},{reverses:first.id});
 await expect(save({merchantAliases:again.after,merchantGroupingHistory:[...history,undo,again]})).rejects.toThrow(/already reversed/);
});
it('refuses stale cross-device revisions and hides owner audit from other authenticated owners',async()=>{
 await expect(save(await data(),0)).rejects.toThrow(/Records changed/);
 await db.exec(`SELECT set_config('app.uid','${other}',false); SET ROLE authenticated;`);
 expect((await db.query('SELECT * FROM preference_approvals')).rows).toEqual([]);
 await db.exec(`RESET ROLE; SELECT set_config('app.uid','${owner}',false)`);
});