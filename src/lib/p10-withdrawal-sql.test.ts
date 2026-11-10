// @vitest-environment node
// Proposed P10 (unposted entry withdrawal, RB-LED-01) at the SQL level, isolated PGlite only (never Cloud):
//   * installs on the applied schema and on the whole proposed stack P1..P9; rollback restores the exact pre-P10 catalog
//     (including the 0061 undo_opening_balances) and keeps every row and withdrawal history;
//   * confirmed erasure (delete_my_finance_data) and the service path still delete; a signed-in DELETE never does;
//   * opening-balance Undo withdraws the entries it created instead of deleting them.
// The app/API-level cases (server function, PostgREST requests as the signed-in user, readers) are in failure-injection.test.ts.
import { describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { actAs, addUsers, fullSchemaDb, readSql } from "@/test/full-schema-pglite";

const O = "00000000-0000-4000-8000-000000000001";
const V = "00000000-0000-4000-8000-000000000002";
const ACC = "00000000-0000-4000-8000-000000000101";
const D = ".lovable/staged-sql/proposed/";
const P10 = `${D}P10_unposted_entry_withdrawal.sql`;
const P10_RB = `${D}P10_unposted_entry_withdrawal.rollback.sql`;
const STACK = ["P1_security_containment", "P2_v31_role_model", "P4_step_up_and_assistant_limits", "P5_legal_entities_foundation", "P5b_restore_investments", "P6_registers", "P7_balanced_posting", "P8_asset_depreciation_posting", "P9_statement_import_idempotency_and_archive_guards"].map((f) => `${D}${f}.sql`);
const CATALOG = `
  SELECT 'f' k, p.oid::regprocedure::text n, md5(p.prosrc) || coalesce(p.proacl::text, '') || p.prosecdef::text v FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
  UNION ALL SELECT 't', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) || t.tgenabled::text FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
  UNION ALL SELECT 'i', indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
  UNION ALL SELECT 'c', table_name || '.' || column_name, data_type || is_nullable FROM information_schema.columns WHERE table_schema = 'public'
  UNION ALL SELECT 'n', nspname, '' FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1, 2`;
const catalog = async (db: PGlite) => { await actAs(db, null); return (await db.query<{ k: string; n: string; v: string }>(CATALOG)).rows.map((r) => `${r.k}|${r.n}|${r.v}`); };
/** Run as uid (null = superuser/service path) in a transaction; returns "" or the error. keep=false rolls back. */
async function as(db: PGlite, uid: string | null, sql: string, p: unknown[] = [], keep = true): Promise<string> {
  await actAs(db, uid);
  await db.exec("BEGIN");
  try { await db.query(sql, p); await db.exec(keep ? "COMMIT" : "ROLLBACK"); return ""; }
  catch (e) { await db.exec("ROLLBACK"); return (e as Error).message; }
  finally { await actAs(db, null); }
}
async function seed(db: PGlite) {
  await addUsers(db, { [O]: "o@x.in", [V]: "v@x.in" });
  await db.query("INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1,'{}'),($2,'{}') ON CONFLICT (owner_id) DO NOTHING", [O, V]);
  await db.query("INSERT INTO public.accounts(id, owner_id, name, kind) VALUES ($1,$2,'HDFC Savings','savings')", [ACC, O]);
}
const entry = async (db: PGlite, id: string, owner = O, amount = 450) => {
  await actAs(db, null);
  await db.query("INSERT INTO public.expenses(id,employee_id,title,category,amount,original_amount,currency,expense_date,account_id,description) VALUES ($1,$2,'Lunch','Food and beverages',$3,$3,'INR','2026-11-09',$4,'')", [id, owner, amount, owner === O ? ACC : null]);
};
const n = async (db: PGlite, sql: string, p: unknown[] = []) => { await actAs(db, null); return (await db.query<{ n: number }>(sql, p)).rows[0]!.n; };
const E = (k: number) => `00000000-0000-4000-8000-0000000e${String(k).padStart(4, "0")}`;

describe("P10 unposted entry withdrawal (SQL, isolated PGlite)", () => {
  it("installs on the applied schema; rollback restores the exact catalog and keeps rows and withdrawal history", async () => {
    const db = await fullSchemaDb();
    await seed(db);
    const before = await catalog(db);
    await db.exec(readSql(P10));
    await db.exec(readSql(P10)); // re-running is safe
    await entry(db, E(1));
    expect(await as(db, O, "SELECT public.withdraw_entry($1, 'Entered twice by mistake')", [E(1)])).toBe("");
    expect(await as(db, O, "DELETE FROM public.expenses WHERE id = $1", [E(1)])).toMatch(/P10_WITHDRAW_ONLY/);
    expect(await as(db, O, "TRUNCATE public.expenses CASCADE")).toMatch(/P10_WITHDRAW_ONLY|permission denied|P9_/);
    await db.exec(readSql(P10_RB));
    expect(await catalog(db)).toEqual(before);
    await actAs(db, null);
    const w = (await db.query<{ w: { state: string; history: unknown[] } }>("SELECT receipt_details->'withdrawal' w FROM public.expenses WHERE id = $1", [E(1)])).rows[0]!.w;
    expect(w.state).toBe("withdrawn");
    expect(w.history).toHaveLength(1);
    await db.close();
  }, 600_000);

  it("erasure and the service path still delete; another user and a signed-in DELETE never do; opening Undo withdraws", async () => {
    const db = await fullSchemaDb([P10]);
    await seed(db);
    await entry(db, E(2));
    await entry(db, E(3), V);
    expect(await as(db, O, "DELETE FROM public.expenses WHERE employee_id = $1", [O])).toMatch(/P10_WITHDRAW_ONLY/);
    expect(await as(db, V, "DELETE FROM public.expenses WHERE id = $1", [E(2)])).toBe(""); // RLS: matches nothing
    expect(await n(db, "SELECT count(*)::int n FROM public.expenses WHERE id = $1", [E(2)])).toBe(1);
    expect(await as(db, null, "DELETE FROM public.expenses WHERE id = $1", [E(3)], false)).toBe(""); // service path (rolled back)
    expect(await as(db, V, "SELECT public.delete_my_finance_data()")).toBe(""); // confirmed erasure of V's own data
    expect(await n(db, "SELECT count(*)::int n FROM public.expenses WHERE id = $1", [E(3)])).toBe(0);
    expect(await n(db, "SELECT count(*)::int n FROM public.expenses WHERE id = $1", [E(2)])).toBe(1);
    // Opening balances: post, then Undo → the created entries are withdrawn ("Opening balances undone"), never deleted.
    await actAs(db, null);
    const post = "00000000-0000-4000-8000-00000000f001";
    const ids = [E(10), E(11)];
    await db.query("INSERT INTO public.expenses(id,employee_id,title,category,amount,original_amount,currency,expense_date,account_id,description,txn_type) VALUES ($1,$3,'Opening','Opening balance',1000,1000,'INR','2026-04-01',$4,'','adjustment'),($2,$3,'Opening','Opening balance',2000,2000,'INR','2026-04-01',$4,'','adjustment')", [...ids, O, ACC]);
    await db.query("INSERT INTO public.opening_postings(id, owner_id, entity_id, fy, opening_date, lines, exceptions, txn_ids, posted_by, posted_at) VALUES ($1,$2,'c1','2026-27','2026-04-01','[]','[]',$3,$2, now())", [post, O, ids]);
    expect(await as(db, O, "SELECT public.undo_opening_balances($1)", [post])).toBe("");
    expect(await n(db, "SELECT count(*)::int n FROM public.expenses WHERE id = ANY($1) AND receipt_details->'withdrawal'->>'state' = 'withdrawn' AND receipt_details->'withdrawal'->>'reason' = 'Opening balances undone'", [ids])).toBe(2);
    await db.close();
  }, 600_000);

  it("installs on, and rolls back off, the whole proposed stack P1..P9 (catalog exact)", async () => {
    const db = await fullSchemaDb(STACK);
    await seed(db);
    const before = await catalog(db);
    await db.exec(readSql(P10));
    await db.exec(readSql(P10_RB));
    expect(await catalog(db)).toEqual(before);
    await db.close();
  }, 600_000);
});
