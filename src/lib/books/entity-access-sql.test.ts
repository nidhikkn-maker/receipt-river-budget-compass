// @vitest-environment node
// Disposable PostgreSQL only: proves company-level grants on documents and files, including refusals.
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const OWNER = '00000000-0000-4000-8000-000000000001', MEMBER = '00000000-0000-4000-8000-000000000002', STRANGER = '00000000-0000-4000-8000-000000000003';
const db = new PGlite();
const as = (uid: string) => db.exec(`RESET ROLE; SELECT set_config('test.uid','${uid}',false); SET ROLE authenticated;`);
const docs = async () => (await db.query<{ id: string }>('SELECT id FROM public.documents ORDER BY id')).rows.map(r => r.id);
const files = async () => (await db.query<{ name: string }>('SELECT name FROM storage.objects ORDER BY name')).rows.map(r => r.name);
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);
    CREATE TABLE public.finance_preferences(owner_id uuid PRIMARY KEY, data jsonb);
    CREATE TABLE public.documents(id text PRIMARY KEY, owner_id uuid, file_path text);
    CREATE TABLE storage.objects(bucket_id text, name text);
    GRANT USAGE ON SCHEMA auth, storage TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT SELECT, UPDATE ON public.documents TO authenticated; GRANT SELECT ON storage.objects TO authenticated;
    ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY; ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own ON public.documents FOR ALL TO authenticated USING (owner_id = auth.uid());
    CREATE POLICY ownf ON storage.objects FOR SELECT TO authenticated USING (split_part(name,'/',1) = auth.uid()::text);
    INSERT INTO auth.users VALUES ('${OWNER}','owner@x.in',now()),('${MEMBER}','accountant@x.in',now()),('${STRANGER}','other@x.in',now());
    INSERT INTO public.finance_preferences VALUES ('${OWNER}','{"entities":[{"id":"c1"},{"id":"c2"}]}');
  `);
  await db.exec(readFileSync('drizzle/migrations/0075_entity_level_access.sql', 'utf8'));
  await db.exec(`GRANT SELECT ON public.entity_members TO authenticated;
    INSERT INTO public.documents VALUES ('d1','${OWNER}','${OWNER}/c1.pdf','c1'),('d2','${OWNER}','${OWNER}/c2.pdf','c2'),('d3','${OWNER}','${OWNER}/personal.pdf',NULL);
    INSERT INTO storage.objects VALUES ('receipts','${OWNER}/c1.pdf'),('receipts','${OWNER}/c2.pdf'),('receipts','${OWNER}/personal.pdf');`);
}, 20000);
afterAll(() => db.close());
describe('company-level access', () => {
  it('a person without a grant sees no company documents or files', async () => {
    await as(MEMBER); expect(await docs()).toEqual([]); expect(await files()).toEqual([]);
  });
  it('only the owner can grant, and only for their own company', async () => {
    await as(STRANGER); await expect(db.query("SELECT public.grant_entity_access('c1','accountant@x.in',false)")).rejects.toThrow(/Company not found/);
    await as(OWNER); await expect(db.query("SELECT public.grant_entity_access('zz','accountant@x.in',false)")).rejects.toThrow(/Company not found/);
    await expect(db.query("SELECT public.grant_entity_access('c1','nobody@x.in',false)")).rejects.toThrow(/No verified/);
    await db.query("SELECT public.grant_entity_access('c1','Accountant@X.in',false)");
  });
  it('a granted member reads that company only — never other companies or untagged personal files', async () => {
    await as(MEMBER); expect(await docs()).toEqual(['d1']); expect(await files()).toEqual([`${OWNER}/c1.pdf`]);
    expect((await db.query<{ ok: boolean }>(`SELECT public.can_access_entity('${OWNER}','c2',false) ok`)).rows[0]?.ok).toBe(false);
    expect((await db.query<{ ok: boolean }>(`SELECT public.can_access_entity('${OWNER}','c1',true) ok`)).rows[0]?.ok).toBe(false);
  });
  it('the member cannot write documents or grant others', async () => {
    await as(MEMBER);
    await expect(db.query("INSERT INTO public.entity_members(owner_id,entity_id,member_id,member_email) VALUES ($1,'c2',$2,'x')", [OWNER, MEMBER])).rejects.toThrow();
    const u = await db.query("UPDATE public.documents SET file_path='x' WHERE id='d1'"); expect(u.affectedRows).toBe(0);
  });
  it('another stranger still sees nothing', async () => { await as(STRANGER); expect(await docs()).toEqual([]); });
  it('revoking removes access immediately; only the owner can revoke', async () => {
    await as(OWNER); const id = (await db.query<{ id: string }>('SELECT id FROM public.entity_members')).rows[0]!.id;
    await as(MEMBER); await expect(db.query('SELECT public.revoke_entity_access($1)', [id])).rejects.toThrow(/not found/);
    await as(OWNER); await db.query('SELECT public.revoke_entity_access($1)', [id]);
    await as(MEMBER); expect(await docs()).toEqual([]); expect(await files()).toEqual([]);
  });
});
