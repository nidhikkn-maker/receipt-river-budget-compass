// @vitest-environment node
// Isolated in-memory PostgreSQL only: never contacts Lovable Cloud or writes live records.
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const db = new PGlite();
const owner = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const acct = "00000000-0000-0000-0000-0000000000a1";
const post = "00000000-0000-0000-0000-0000000000p1".replace("p", "b");
const txn = "00000000-0000-0000-0000-0000000000c1";
const lines = JSON.stringify([{ txnId: txn, accountId: acct, amount: 50000, sign: 1, title: "Opening balance", description: "" }]);
const call = `SELECT public.post_opening_balances('${post}','e1','2025-26','2026-04-01','${lines}'::jsonb,'[]'::jsonb,NULL)`;
async function asUser(uid: string) { await db.exec(`RESET ROLE; SELECT set_config('app.uid','${uid}',false); SET ROLE authenticated;`); }
beforeAll(async () => {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.uid',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE public.accounts(id uuid primary key, owner_id uuid);
    CREATE TABLE public.documents(id uuid primary key, owner_id uuid);
    CREATE TABLE public.expenses(id uuid primary key, employee_id uuid, title text, merchant text, category text, amount numeric, expense_date date, description text, currency text, payment_method text, scope text, txn_type text, account_id uuid, adjustment_sign int, tags text[], updated_at timestamptz default now());
    GRANT SELECT ON public.expenses TO authenticated;
    INSERT INTO public.accounts VALUES ('${acct}','${owner}');`);
  await db.exec(readFileSync("drizzle/migrations/0061_opening_balance_postings.sql", "utf8").replace(/--> statement-breakpoint/g, ""));
}, 20000);
afterAll(async () => { await db.close(); });
describe("opening-balance posting in isolated PostgreSQL", () => {
  it("posts one dated adjustment and repeating the same request adds nothing", async () => {
    await asUser(owner);
    await db.exec(call); await db.exec(call);
    const r = await db.query<{ txn_type: string; expense_date: string; amount: string }>("SELECT txn_type, expense_date::text, amount::text FROM public.expenses");
    expect(r.rows).toEqual([{ txn_type: "adjustment", expense_date: "2026-04-01", amount: "50000" }]);
  });
  it("another user cannot post to someone else's account", async () => {
    await asUser(other);
    await expect(db.exec(`SELECT public.post_opening_balances('00000000-0000-0000-0000-0000000000b2','e1','2025-26','2026-04-01','${lines.replace(txn, "00000000-0000-0000-0000-0000000000c2")}'::jsonb,'[]'::jsonb,NULL)`)).rejects.toThrow(/Account not found/);
  });
  it("undo removes the entries, then the year can be posted again", async () => {
    await asUser(owner);
    await db.exec(`SELECT public.undo_opening_balances('${post}')`);
    expect((await db.query("SELECT id FROM public.expenses")).rows).toHaveLength(0);
    await db.exec(`SELECT public.post_opening_balances('00000000-0000-0000-0000-0000000000b3','e1','2025-26','2026-04-01','${lines}'::jsonb,'[]'::jsonb,NULL)`);
    expect((await db.query("SELECT id FROM public.expenses")).rows).toHaveLength(1);
  });
});
