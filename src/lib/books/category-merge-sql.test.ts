// @vitest-environment node
// Staged SQL only, isolated PGlite. No Cloud policies/records changed.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, expect, it } from 'vitest';
const db=new PGlite(); const owner='00000000-0000-4000-8000-000000000001'; const other='00000000-0000-4000-8000-000000000002'; const op='00000000-0000-4000-8000-000000000010';
const preview=async()=> (await db.query<{p:object}>("SELECT preview_category_merge('Meals','Travel') p")).rows[0]?.p;
const commit=(p:object|undefined,id=op)=>db.query('SELECT commit_category_merge($1,$2::jsonb)',[id,JSON.stringify(p)]);
beforeAll(async()=>{
 await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.uid',true),'')::uuid $$;
 CREATE TABLE finance_preferences(owner_id uuid PRIMARY KEY,data jsonb,revision bigint DEFAULT 1);
 CREATE TABLE expenses(id uuid PRIMARY KEY,employee_id uuid,category text,amount numeric,allocations jsonb,source text);
 CREATE TABLE commitments(id uuid PRIMARY KEY,owner_id uuid,category text,amount numeric);
 CREATE TABLE category_budgets(owner_id uuid,category text,monthly_amount numeric,updated_at timestamptz DEFAULT '2026-11-01',PRIMARY KEY(owner_id,category));
 CREATE FUNCTION bump() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.revision:=OLD.revision+1; RETURN NEW; END $$;
 CREATE TRIGGER bump BEFORE UPDATE ON finance_preferences FOR EACH ROW EXECUTE FUNCTION bump();
 SELECT set_config('app.uid','${owner}',false);`);
 await db.exec(readFileSync('.lovable/staged-sql/category-merge.sql','utf8'));
 const data={categories:[{name:'Meals',archived:false},{name:'Travel',archived:false}],budgets:[{id:'scoped',kind:'category',value:'Meals',amount:40,period:'annual'}],trips:[{id:'trip',budget:100,budgetLines:[{category:'Meals',amount:40},{category:'Travel',amount:60}]}],unchanged:'kept'};
 for(const uid of [owner,other]) {
  await db.query('INSERT INTO finance_preferences(owner_id,data) VALUES($1,$2)',[uid,JSON.stringify(data)]);
  await db.query('INSERT INTO expenses VALUES($1,$1,$2,100,$3,$4)',[uid,'Meals',JSON.stringify([{category:'Meals',amount:40,tags:['original']},{category:'Travel',amount:60}]),'original.pdf']);
  await db.query('INSERT INTO commitments VALUES($1,$1,$2,12.34)',[uid,'Meals']);
  await db.query("INSERT INTO category_budgets VALUES($1,'Meals',0.1),($1,'Travel',0.2)",[uid]);
 }
},20000);
afterAll(()=>db.close());
it('authoritative preview is read-only; stale monetary or preference edits refuse every merge write',async()=>{
 const p=await preview(); expect((await db.query('SELECT * FROM category_merge_operations')).rows).toHaveLength(0);
 await db.query('UPDATE expenses SET amount=101 WHERE employee_id=$1',[owner]);
 await expect(commit(p)).rejects.toThrow('Records changed');
 expect((await db.query<{category:string}>('SELECT category FROM commitments WHERE owner_id=$1',[owner])).rows[0]?.category).toBe('Meals');
 await db.query('UPDATE expenses SET amount=100 WHERE employee_id=$1',[owner]);
});
it('atomic merge preserves split amounts/tags/original, scoped/trip plans, and decimal monthly sum; retry is exact',async()=>{
 const p=await preview(); const result=await commit(p);
 const entry=(await db.query<{amount:string;category:string;allocations:object[];source:string}>('SELECT * FROM expenses WHERE employee_id=$1',[owner])).rows[0];
 expect(entry).toMatchObject({amount:'100',category:'Travel',source:'original.pdf',allocations:[{category:'Travel',amount:40,tags:['original']},{category:'Travel',amount:60}]});
 const pref=(await db.query<{data:Record<string,unknown>;revision:number}>('SELECT * FROM finance_preferences WHERE owner_id=$1',[owner])).rows[0];
 expect(pref?.revision).toBe(2); expect(pref?.data).toMatchObject({unchanged:'kept',categories:[{name:'Travel'}],budgets:[{value:'Travel',amount:40}],trips:[{budget:100,budgetLines:[{category:'Travel',amount:40},{category:'Travel',amount:60}]}]});
 expect((await db.query<{n:string}>('SELECT monthly_amount n FROM category_budgets WHERE owner_id=$1',[owner])).rows[0]?.n).toBe('0.3');
 expect((await commit(p)).rows).toEqual(result.rows);
 expect((await db.query('SELECT * FROM category_merge_operations')).rows).toHaveLength(1);
});
it('new records invalidate an approved preview before any write',async()=>{
 await db.exec(`SELECT set_config('app.uid','${other}',false)`);
 const p=await preview();
 const id='00000000-0000-4000-8000-000000000099';
 await db.query('INSERT INTO commitments VALUES($1,$2,$3,0.01)',[id,other,'Meals']);
 await expect(commit(p,id)).rejects.toThrow('Records changed');
 expect((await db.query<{category:string}>('SELECT category FROM expenses WHERE employee_id=$1',[other])).rows[0]?.category).toBe('Meals');
 await db.query('DELETE FROM commitments WHERE id=$1',[id]);
});
it('failed preference guard rolls back entries, commitments and monthly budgets together',async()=>{
 await db.exec(`SELECT set_config('app.uid','${other}',false);
 CREATE FUNCTION reject_test_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Isolated write failure'; END $$;
 CREATE TRIGGER reject_test_write BEFORE UPDATE ON finance_preferences FOR EACH ROW EXECUTE FUNCTION reject_test_write();`);
 const p=await preview();
 await expect(commit(p,'00000000-0000-4000-8000-000000000011')).rejects.toThrow('Isolated write failure');
 expect((await db.query<{c:string}>('SELECT category c FROM expenses WHERE employee_id=$1',[other])).rows[0]?.c).toBe('Meals');
 expect((await db.query<{c:string}>('SELECT category c FROM commitments WHERE owner_id=$1',[other])).rows[0]?.c).toBe('Meals');
 expect((await db.query('SELECT * FROM category_budgets WHERE owner_id=$1',[other])).rows).toHaveLength(2);
 expect((await db.query('SELECT * FROM category_merge_operations WHERE owner_id=$1',[other])).rows).toHaveLength(0);
 await db.exec('DROP TRIGGER reject_test_write ON finance_preferences;');
});
it('another owner cannot replay or read the operation and retains every financial record',async()=>{
 await db.exec(`SELECT set_config('app.uid','${other}',false)`);
 await expect(commit(await preview())).rejects.toThrow('Operation ID already used');
 await db.exec('SET ROLE authenticated'); expect((await db.query('SELECT * FROM category_merge_operations')).rows).toEqual([]); await db.exec('RESET ROLE');
 expect((await db.query<{c:string}>('SELECT category c FROM expenses WHERE employee_id=$1',[other])).rows[0]?.c).toBe('Meals');
});
it('reversal refuses later edits, restores original splits/budgets without financial writes, retains audit and replays',async()=>{
 await db.exec(`SELECT set_config('app.uid','${other}',false)`);
 await expect(db.query('SELECT undo_category_merge($1)',[op])).rejects.toThrow('Merge not available');
 await db.exec(`SELECT set_config('app.uid','${owner}',false)`);
 await db.query('UPDATE expenses SET amount=101 WHERE employee_id=$1',[owner]);
 await expect(db.query('SELECT undo_category_merge($1)',[op])).rejects.toThrow('Records changed');
 expect((await db.query<{n:string}>('SELECT monthly_amount n FROM category_budgets WHERE owner_id=$1',[owner])).rows[0]?.n).toBe('0.3');
 await db.query('UPDATE expenses SET amount=100 WHERE employee_id=$1',[owner]);
 const reversed=await db.query('SELECT undo_category_merge($1)',[op]);
 expect((await db.query<{category:string;amount:string;source:string;allocations:unknown}>('SELECT * FROM expenses WHERE employee_id=$1',[owner])).rows[0]).toMatchObject({category:'Meals',amount:'100',source:'original.pdf',allocations:[{category:'Meals',amount:40,tags:['original']},{category:'Travel',amount:60}]});
 expect((await db.query<{category:string;monthly_amount:string}>('SELECT * FROM category_budgets WHERE owner_id=$1 ORDER BY category',[owner])).rows).toMatchObject([{category:'Meals',monthly_amount:'0.1'},{category:'Travel',monthly_amount:'0.2'}]);
 expect((await db.query('SELECT undo_category_merge($1)',[op])).rows).toEqual(reversed.rows);
 expect((await db.query('SELECT * FROM category_merge_operations WHERE reversed_at IS NOT NULL')).rows).toHaveLength(1);
 expect((await db.query<{date:string}>("SELECT updated_at::date::text date FROM category_budgets WHERE owner_id=$1",[owner])).rows.map(r=>r.date)).toEqual(['2026-11-01','2026-11-01']);
 await expect(commit((await db.query<{request:object}>('SELECT request FROM category_merge_operations WHERE id=$1',[op])).rows[0]?.request)).rejects.toThrow('already reversed');
});
it('closed-period write refusal rolls the entire merge back and refuses undo without discarding its audit',async()=>{
 await db.exec(`SELECT set_config('app.uid','${other}',false);
 CREATE FUNCTION closed_test_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Closed period'; END $$;
 CREATE TRIGGER closed_test_guard BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION closed_test_guard();`);
 const id='00000000-0000-4000-8000-000000000098';
 await expect(commit(await preview(),id)).rejects.toThrow('Closed period');
 expect((await db.query<{category:string}>('SELECT category FROM commitments WHERE owner_id=$1',[other])).rows[0]?.category).toBe('Meals');
 expect((await db.query('SELECT * FROM category_merge_operations WHERE id=$1',[id])).rows).toEqual([]);
 await db.exec('DROP TRIGGER closed_test_guard ON expenses');
 await commit(await preview(),id);
 await db.exec('CREATE TRIGGER closed_test_guard BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION closed_test_guard()');
 await expect(db.query('SELECT undo_category_merge($1)',[id])).rejects.toThrow('Closed period');
 expect((await db.query<{reversed_at:unknown}>('SELECT reversed_at FROM category_merge_operations WHERE id=$1',[id])).rows[0]?.reversed_at).toBeNull();
 expect((await db.query<{category:string}>('SELECT category FROM commitments WHERE owner_id=$1',[other])).rows[0]?.category).toBe('Travel');
 await db.exec('DROP TRIGGER closed_test_guard ON expenses');
});