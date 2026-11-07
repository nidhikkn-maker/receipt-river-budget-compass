// @vitest-environment node
// Disposable PostgreSQL: company members read tagged transactions; only editors may change them; revoke removes both.
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const OWNER = '00000000-0000-4000-8000-000000000001', MEMBER = '00000000-0000-4000-8000-000000000002';
const db = new PGlite();
const as = (uid: string) => db.exec(`RESET ROLE; SELECT set_config('test.uid','${uid}',false); SET ROLE authenticated;`);
const rows = async () => (await db.query<{ id: string }>('SELECT id FROM public.expenses ORDER BY id')).rows.map(r => r.id);
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);
    CREATE TABLE public.finance_preferences(owner_id uuid PRIMARY KEY, data jsonb);
    CREATE TABLE public.documents(id text PRIMARY KEY, owner_id uuid, file_path text);
    CREATE TABLE public.expenses(id text PRIMARY KEY, employee_id uuid, entity_id text, amount numeric);
    CREATE TABLE storage.objects(bucket_id text, name text);
    GRANT USAGE ON SCHEMA auth, storage TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT SELECT, UPDATE ON public.documents, public.expenses TO authenticated;
    ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY; ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own ON public.expenses FOR ALL TO authenticated USING (employee_id = auth.uid());
    INSERT INTO auth.users VALUES ('${OWNER}','owner@x.in',now()),('${MEMBER}','acct@x.in',now());
    INSERT INTO public.finance_preferences VALUES ('${OWNER}','{"entities":[{"id":"c1"},{"id":"c2"}]}');
  `);
  await db.exec(readFileSync('drizzle/migrations/0075_entity_level_access.sql', 'utf8'));
  await db.exec(readFileSync('drizzle/migrations/0076_entity_scoped_transactions.sql', 'utf8'));
  await db.exec(readFileSync('drizzle/migrations/0077_my_shared_companies.sql', 'utf8'));
  await db.exec(`UPDATE public.finance_preferences SET data='{"entities":[{"id":"c1","name":"Krupa Ltd"},{"id":"c2","name":"Other"}]}'`);
  await db.exec(`GRANT SELECT ON public.entity_members TO authenticated;
    INSERT INTO public.expenses VALUES ('t1','${OWNER}','c1',100),('t2','${OWNER}','c2',200),('t3','${OWNER}',NULL,300);`);
}, 20000);
afterAll(() => db.close());
describe('company-scoped transactions', () => {
  it('no grant: nothing visible', async () => { await as(MEMBER); expect(await rows()).toEqual([]); });
  it('view-only grant: reads only that company, cannot edit', async () => {
    await as(OWNER); await db.query("SELECT public.grant_entity_access('c1','acct@x.in',false)");
    await as(MEMBER); expect(await rows()).toEqual(['t1']);
    const mine = (await db.query<{ company_name: string; can_write: boolean }>('SELECT company_name, can_write FROM public.my_shared_companies()')).rows;
    expect(mine).toEqual([{ company_name: 'Krupa Ltd', can_write: false }]);
    expect((await db.query("UPDATE public.expenses SET amount=1 WHERE id='t1'")).affectedRows).toBe(0);
  });
  it('edit grant: can edit that company only and cannot move it to another company or personal', async () => {
    await as(OWNER); await db.query("SELECT public.grant_entity_access('c1','acct@x.in',true)");
    await as(MEMBER);
    expect((await db.query("UPDATE public.expenses SET amount=150 WHERE id='t1'")).affectedRows).toBe(1);
    expect((await db.query("UPDATE public.expenses SET amount=1 WHERE id IN ('t2','t3')")).affectedRows).toBe(0);
    await expect(db.query("UPDATE public.expenses SET entity_id='c2' WHERE id='t1'")).rejects.toThrow();
    await expect(db.query("UPDATE public.expenses SET entity_id=NULL WHERE id='t1'")).rejects.toThrow();
  });
  it('revoke removes read and edit', async () => {
    await as(OWNER); const id = (await db.query<{ id: string }>('SELECT id FROM public.entity_members WHERE revoked_at IS NULL')).rows[0]!.id;
    await db.query('SELECT public.revoke_entity_access($1)', [id]);
    await as(MEMBER); expect(await rows()).toEqual([]);
    expect((await db.query('SELECT * FROM public.my_shared_companies()')).rows).toEqual([]);
    expect((await db.query("UPDATE public.expenses SET amount=1 WHERE id='t1'")).affectedRows).toBe(0);
  });
});
