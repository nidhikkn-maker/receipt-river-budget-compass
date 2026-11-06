// @vitest-environment node
// Disposable PostgreSQL only: proves edit-grant members can add company documents and files, and everyone else cannot.
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const OWNER = '00000000-0000-4000-8000-000000000001', EDITOR = '00000000-0000-4000-8000-000000000002', VIEWER = '00000000-0000-4000-8000-000000000003', STRANGER = '00000000-0000-4000-8000-000000000004';
const db = new PGlite();
const as = (uid: string) => db.exec(`RESET ROLE; SELECT set_config('test.uid','${uid}',false); SET ROLE authenticated;`);
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);
    CREATE TABLE public.finance_preferences(owner_id uuid PRIMARY KEY, data jsonb);
    CREATE TABLE public.documents(id text PRIMARY KEY, owner_id uuid, entity_id text, file_path text);
    CREATE TABLE storage.objects(bucket_id text, name text);
    GRANT USAGE ON SCHEMA auth, storage TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.documents TO authenticated; GRANT SELECT, INSERT ON storage.objects TO authenticated;
    ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY; ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own ON public.documents FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
    CREATE POLICY ownf ON storage.objects FOR ALL TO authenticated USING (split_part(name,'/',1) = auth.uid()::text) WITH CHECK (split_part(name,'/',1) = auth.uid()::text);
    INSERT INTO auth.users VALUES ('${OWNER}','owner@x.in',now()),('${EDITOR}','editor@x.in',now()),('${VIEWER}','viewer@x.in',now()),('${STRANGER}','other@x.in',now());
    INSERT INTO public.finance_preferences VALUES ('${OWNER}','{"entities":[{"id":"c1"},{"id":"c2"}]}');
  `);
  await db.exec(readFileSync('drizzle/migrations/0075_entity_level_access.sql', 'utf8'));
  await db.exec(readFileSync('drizzle/migrations/0078_entity_member_uploads.sql', 'utf8'));
  await db.exec(`GRANT SELECT ON public.entity_members TO authenticated;
    INSERT INTO public.entity_members(owner_id, entity_id, member_id, member_email, can_write) VALUES
      ('${OWNER}','c1','${EDITOR}','editor@x.in',true),
      ('${OWNER}','c1','${VIEWER}','viewer@x.in',false),
      ('${OWNER}','c2','${VIEWER}','viewer@x.in',true);`);
}, 20000);
afterAll(() => db.close());
const insDoc = (id: string, owner: string, ent: string | null) =>
  db.query('INSERT INTO public.documents(id, owner_id, entity_id, file_path) VALUES ($1,$2,$3,$4)', [id, owner, ent, `${owner}/docs/${id}.pdf`]);
const insFile = (name: string) => db.query('INSERT INTO storage.objects(bucket_id, name) VALUES ($1,$2)', ['receipts', name]);
describe('company member uploads', () => {
  it('an edit-grant member adds a document owned by the owner and tagged to that company', async () => {
    await as(EDITOR);
    await insDoc('ed1', OWNER, 'c1');
    const r = await db.query<{ id: string }>("SELECT id FROM public.documents WHERE id = 'ed1'");
    expect(r.rows.map((x) => x.id)).toEqual(['ed1']);
  });
  it('the same member cannot add untagged or other-company documents under the owner', async () => {
    await as(EDITOR);
    await expect(insDoc('ed2', OWNER, null)).rejects.toThrow(/row-level security/);
    await expect(insDoc('ed3', OWNER, 'c2')).rejects.toThrow(/row-level security/);
    await expect(insDoc('ed4', STRANGER, 'c1')).rejects.toThrow(/row-level security/);
  });
  it('a view-only member cannot add documents at all', async () => {
    await as(VIEWER);
    await expect(insDoc('v1', OWNER, 'c1')).rejects.toThrow(/row-level security/);
  });
  it('an edit grant on one company never covers another', async () => {
    await as(VIEWER); // viewer can edit c2 but only views c1
    await insDoc('v2', OWNER, 'c2');
    await expect(insDoc('v3', OWNER, 'c1')).rejects.toThrow(/row-level security/);
  });
  it('edit members upload files into the granting owner prefix only', async () => {
    await as(EDITOR);
    await insFile(`${OWNER}/docs/ed1.pdf`);
    await expect(insFile(`${STRANGER}/docs/x.pdf`)).rejects.toThrow(/row-level security/);
    await as(VIEWER);
    await insFile(`${OWNER}/docs/v2.pdf`); // viewer edits c2, so the owner prefix is open for uploads
    await as(STRANGER);
    await expect(insFile(`${OWNER}/docs/s.pdf`)).rejects.toThrow(/row-level security/);
  });
  it('revoking the grant closes both document and file uploads immediately', async () => {
    await as(OWNER);
    const gid = (await db.query<{ id: string }>(`SELECT id FROM public.entity_members WHERE member_id = '${EDITOR}'`)).rows[0]!.id;
    await db.query('SELECT public.revoke_entity_access($1)', [gid]);
    await as(EDITOR);
    await expect(insDoc('ed5', OWNER, 'c1')).rejects.toThrow(/row-level security/);
    await expect(insFile(`${OWNER}/docs/ed5.pdf`)).rejects.toThrow(/row-level security/);
  });
});
