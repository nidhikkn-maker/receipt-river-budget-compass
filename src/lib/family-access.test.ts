// @vitest-environment node
// Isolated in-memory PostgreSQL only: never contacts Lovable Cloud or writes live records.
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { familyAccessSql } from "./family-access-sql";

const db = new PGlite();
const owner = "00000000-0000-0000-0000-000000000001";
const member = "00000000-0000-0000-0000-000000000002";
const outsider = "00000000-0000-0000-0000-000000000003";
const invite = "00000000-0000-0000-0000-000000000004";
const request = "00000000-0000-0000-0000-000000000005";
async function asUser(uid: string) { await db.exec(`RESET ROLE; SELECT set_config('app.uid','${uid}',false); SET ROLE authenticated;`); }
beforeAll(async () => {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.uid',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE public.family_invites(id uuid, owner_id uuid, accepted_by uuid, revoked boolean);
    CREATE TABLE public.family_requests(id uuid, owner_id uuid, requester_id uuid, invite_id uuid, status text, decision_note text, decided_at timestamptz, evidence_path text);
    GRANT SELECT, INSERT ON public.family_requests TO authenticated;
    ALTER TABLE public.family_requests ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Requester or owner reads requests" ON public.family_requests FOR SELECT TO authenticated USING (requester_id=auth.uid() OR owner_id=auth.uid());
    CREATE POLICY "Linked members send requests" ON public.family_requests FOR INSERT TO authenticated WITH CHECK (false);
    INSERT INTO public.family_invites VALUES ('${invite}','${owner}','${member}',false);
    INSERT INTO public.family_requests VALUES ('${request}','${owner}','${member}','${invite}','pending','',NULL,NULL);`);
  await db.exec(readFileSync("drizzle/migrations/0023_family_invite_owner.sql", "utf8"));
  await db.exec(familyAccessSql);
}, 20000);
afterAll(async () => { await db.close(); });
describe("Family access revocation in isolated PostgreSQL", () => {
  it("active member can read despite having no direct invite table access", async () => {
    await asUser(member);
    expect((await db.query("SELECT id FROM public.family_requests")).rows).toHaveLength(1);
  });
  it("unrelated owner cannot read requests", async () => {
    await asUser(outsider);
    expect((await db.query("SELECT id FROM public.family_requests")).rows).toHaveLength(0);
  });
  it("revocation denies reads, inserts and withdrawals while owner retains records", async () => {
    await db.exec(`RESET ROLE; UPDATE public.family_invites SET revoked=true WHERE id='${invite}';`);
    await asUser(member);
    expect((await db.query("SELECT id FROM public.family_requests")).rows).toHaveLength(0);
    await expect(db.exec(`SELECT public.decide_family_request('${request}','withdrawn','');`)).rejects.toThrow();
    await expect(db.exec(`INSERT INTO public.family_requests VALUES ('00000000-0000-0000-0000-000000000006','${owner}','${member}','${invite}','pending','',NULL,NULL);`)).rejects.toThrow();
    await asUser(owner);
    expect((await db.query("SELECT status FROM public.family_requests")).rows).toEqual([{ status: "pending" }]);
    await db.exec(`SELECT public.decide_family_request('${request}','declined','');`);
    expect((await db.query("SELECT status FROM public.family_requests")).rows).toEqual([{ status: "declined" }]);
  });
});