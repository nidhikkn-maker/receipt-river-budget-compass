// @vitest-environment node
// Proposed P11 (P0-023 repeated backup restore detection; P0-033 withdrawals authoritative on restore) at the SQL level,
// isolated PGlite only (never Cloud). App/API-level cases: failure-injection.test.ts R1-R3.
import { describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { actAs, addUsers, fullSchemaDb, readSql } from "@/test/full-schema-pglite";

const O = "00000000-0000-4000-8000-000000000001";
const ACC = "00000000-0000-4000-8000-000000000101";
const E1 = "00000000-0000-4000-8000-0000000e0001";
const D = ".lovable/staged-sql/proposed/";
const P10 = `${D}P10_unposted_entry_withdrawal.sql`;
const P11 = `${D}P11_backup_restore_receipts.sql`;
const P11_RB = `${D}P11_backup_restore_receipts.rollback.sql`;
const STACK = ["P1_security_containment", "P2_v31_role_model", "P4_step_up_and_assistant_limits", "P5_legal_entities_foundation", "P5b_restore_investments", "P6_registers", "P7_balanced_posting", "P8_asset_depreciation_posting", "P9_statement_import_idempotency_and_archive_guards", "P10_unposted_entry_withdrawal"].map((f) => `${D}${f}.sql`);
const CATALOG = `
  SELECT 'f' k, p.oid::regprocedure::text n, md5(p.prosrc) || coalesce(p.proacl::text, '') || p.prosecdef::text v FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
  UNION ALL SELECT 't', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
  UNION ALL SELECT 'c', table_name || '.' || column_name, data_type FROM information_schema.columns WHERE table_schema = 'public'
  UNION ALL SELECT 'n', nspname, '' FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1, 2`;
const catalog = async (db: PGlite) => { await actAs(db, null); return (await db.query<{ k: string; n: string; v: string }>(CATALOG)).rows.map((r) => `${r.k}|${r.n}|${r.v}`); };
async function as<T = unknown>(db: PGlite, uid: string | null, sql: string, p: unknown[] = []): Promise<{ v?: T; e?: string }> {
  await actAs(db, uid);
  try { return { v: (await db.query<{ v: T }>(sql, p)).rows[0]?.v as T }; } catch (e) { return { e: (e as Error).message }; } finally { await actAs(db, null); }
}
async function seed(db: PGlite) {
  await addUsers(db, { [O]: "o@x.in" });
  await db.query("INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1,'{}')", [O]);
  await db.query("INSERT INTO public.accounts(id, owner_id, name, kind, opening_balance) VALUES ($1,$2,'HDFC Savings','savings',10000)", [ACC, O]);
  await db.query("INSERT INTO public.expenses(id,employee_id,title,category,amount,original_amount,currency,expense_date,account_id,description) VALUES ($1,$2,'Lunch','Food and beverages',450,450,'INR','2026-11-09',$3,'')", [E1, O, ACC]);
}
const payload = async (db: PGlite) => {
  await actAs(db, null);
  const one = async (t: string, col = "owner_id") => (await db.query<{ j: unknown }>(`SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]') j FROM public.${t} x WHERE ${col} = $1`, [O])).rows[0]!.j;
  return { finance_preferences: await one("finance_preferences"), accounts: await one("accounts"), expenses: await one("expenses", "employee_id") };
};

describe("P11 backup restore receipts (SQL, isolated PGlite)", () => {
  it("applied schema: direct restore refused; first restore recorded; the same payload again changes nothing; re-restore needs a reason; rollback exact", async () => {
    const db = await fullSchemaDb([P10]);
    await seed(db);
    const before = await catalog(db);
    await db.exec(readSql(P11));
    expect(await catalog(db)).not.toEqual(before);
    const p = await payload(db);
    expect((await as(db, O, "SELECT public.restore_finance_backup($1::jsonb) v", [JSON.stringify(p)])).e).toMatch(/P11_RESTORE_CHECK_REQUIRED/);
    const first = await as<{ status: string; changed: boolean }>(db, O, "SELECT public.restore_finance_backup_checked($1::jsonb) v", [JSON.stringify(p)]);
    expect(first.v).toMatchObject({ status: "restored", changed: true });
    await actAs(db, null);
    await db.query("UPDATE public.expenses SET amount = 500, original_amount = 500 WHERE id = $1", [E1]); // later work
    // same payload with different staged paths and restore history: same fingerprint
    const again = await as<{ status: string; changed: boolean; previous: { records: number; mode: string }[] }>(db, O, "SELECT public.restore_finance_backup_checked($1::jsonb) v", [JSON.stringify({ ...p, finance_preferences: [{ ...(p.finance_preferences as object[])[0], data: { restoreHistory: [{ x: 1 }] } }] })]);
    expect(again.v).toMatchObject({ status: "previously_restored", changed: false });
    expect(again.v!.previous).toEqual([expect.objectContaining({ records: 3, mode: "first" })]);
    expect((await db.query<{ a: string }>("SELECT amount::text a FROM public.expenses WHERE id = $1", [E1])).rows[0]!.a).toBe("500.00");
    expect((await as(db, O, "SELECT public.restore_finance_backup_checked($1::jsonb, NULL, 'abc') v", [JSON.stringify(p)])).e).toMatch(/P11_REASON/);
    expect((await as(db, O, "SELECT public.restore_finance_backup_checked($1::jsonb, NULL, 'Edited by mistake') v", [JSON.stringify(p)])).v).toMatchObject({ status: "restored_again" });
    expect((await db.query<{ a: string }>("SELECT amount::text a FROM public.expenses WHERE id = $1", [E1])).rows[0]!.a).toBe("450.00");
    // receipts are append-only for the owner (no UPDATE/DELETE), and only for the caller's own id
    expect((await as(db, O, "UPDATE public.backup_restore_receipts SET mode = 'first' RETURNING 1 v")).v).toBeUndefined();
    expect((await as(db, O, "DELETE FROM public.backup_restore_receipts RETURNING 1 v")).e ?? "no rows").toMatch(/permission denied|no rows/);
    expect((await db.query<{ n: number }>("SELECT count(*)::int n FROM public.backup_restore_receipts")).rows[0]!.n).toBe(2);
    // rollback refuses while receipts exist, then (operator, KK approval) restores the exact catalog
    await expect(db.exec(readSql(P11_RB))).rejects.toThrow(/restore receipts exist/);
    await db.exec("ROLLBACK");
    await db.exec(readSql(P11_RB).replace("BEGIN;", "BEGIN; SET LOCAL phase3_p11.drop_receipts = 'on';"));
    expect(await catalog(db)).toEqual(before);
    await db.close();
  }, 600_000);

  it("on the whole proposed stack P1..P10: the step-up check stays in force through the checked restore; rollback exact", async () => {
    const db = await fullSchemaDb(STACK);
    await seed(db);
    const before = await catalog(db);
    await db.exec(readSql(P11));
    const p = await payload(db);
    expect((await as(db, O, "SELECT public.restore_finance_backup_checked($1::jsonb) v", [JSON.stringify(p)])).e).toMatch(/STEP_UP_REQUIRED/);
    await actAs(db, null);
    await db.exec("SET ROLE service_role");
    await db.query("SELECT public.record_step_up($1,'password',300)", [O]);
    expect((await as(db, O, "SELECT public.restore_finance_backup_checked($1::jsonb) v", [JSON.stringify(p)])).v).toMatchObject({ status: "restored" });
    expect((await as(db, O, "SELECT public.restore_finance_backup_checked($1::jsonb) v", [JSON.stringify(p)])).v).toMatchObject({ status: "previously_restored", changed: false });
    await actAs(db, null);
    await db.exec(readSql(P11_RB).replace("BEGIN;", "BEGIN; SET LOCAL phase3_p11.drop_receipts = 'on';"));
    expect(await catalog(db)).toEqual(before);
    await db.close();
  }, 600_000);
});
