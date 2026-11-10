// @vitest-environment node
// Proposed P13 (P0-022: team users never delete financial records or audit history; permission-scoped withdrawal /
// correction requests with authorised approval; entity separation) at the SQL level, isolated PGlite only (never Cloud).
// API-level cases (PostgREST-shaped requests as each signed-in user): failure-injection.test.ts T1-T3.
import { describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { actAs, addUsers, fullSchemaDb, readSql } from "@/test/full-schema-pglite";

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const O = u(1), M = u(2), F = u(3), X = u(4), M2 = u(5);
const ACC = u(101);
const D = ".lovable/staged-sql/proposed/";
const P9 = `${D}P9_statement_import_idempotency_and_archive_guards.sql`, P10 = `${D}P10_unposted_entry_withdrawal.sql`;
const P11 = `${D}P11_backup_restore_receipts.sql`, P13 = `${D}P13_team_change_requests.sql`, P13_RB = `${D}P13_team_change_requests.rollback.sql`;
const STACK = ["P1_security_containment", "P2_v31_role_model", "P4_step_up_and_assistant_limits", "P5_legal_entities_foundation", "P5b_restore_investments", "P6_registers", "P7_balanced_posting", "P8_asset_depreciation_posting"].map((f) => `${D}${f}.sql`);
const CATALOG = `
  SELECT 'f' k, p.oid::regprocedure::text n, md5(p.prosrc) || coalesce(p.proacl::text, '') || p.prosecdef::text v FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
  UNION ALL SELECT 't', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
  UNION ALL SELECT 'c', table_name || '.' || column_name, data_type FROM information_schema.columns WHERE table_schema = 'public'
  UNION ALL SELECT 'p', tablename || '.' || policyname, cmd || permissive || array_to_string(roles, ',') || coalesce(qual, '') || coalesce(with_check, '') FROM pg_policies WHERE schemaname = 'public'
  UNION ALL SELECT 'n', nspname, '' FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1, 2`;
const catalog = async (db: PGlite) => { await actAs(db, null); return (await db.query<{ k: string; n: string; v: string }>(CATALOG)).rows.map((r) => `${r.k}|${r.n}|${r.v}`); };
/** Run as uid in its own transaction (committed); returns the first row's v or the error message. */
async function as<T = unknown>(db: PGlite, uid: string | null, sql: string, p: unknown[] = []): Promise<{ v?: T; e?: string; n?: number }> {
  await actAs(db, uid);
  await db.exec("BEGIN");
  try { const r = await db.query<{ v: T }>(sql, p); await db.exec("COMMIT"); return { v: r.rows[0]?.v as T, n: r.affectedRows ?? r.rows.length }; }
  catch (e) { await db.exec("ROLLBACK"); return { e: (e as Error).message }; } finally { await actAs(db, null); }
}
async function seedTeam(db: PGlite, entities = false) {
  await addUsers(db, { [O]: "o@x.in", [M]: "m@x.in", [F]: "f@x.in", [X]: "x@x.in", [M2]: "m2@x.in" });
  await db.query("INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1,'{}') ON CONFLICT (owner_id) DO NOTHING", [O]);
  await db.query("INSERT INTO public.user_roles(user_id, role) VALUES ($1,'manager'),($2,'finance'),($3,'manager')", [M, F, M2]);
  await db.query("UPDATE public.role_permissions SET allowed = true WHERE (role = 'manager' AND action IN ('view_expenses','edit_expenses','delete_expenses')) OR (role = 'finance' AND action IN ('view_expenses','approve'))");
  await db.query("INSERT INTO public.accounts(id, owner_id, name, kind, opening_balance) VALUES ($1,$2,'HDFC Savings','savings',10000)", [ACC, O]);
  if (entities) await db.query("INSERT INTO public.entity_members(owner_id, entity_id, member_id, member_email, can_write) VALUES ($1,'c1',$2,'m@x.in',true),($1,'c1',$3,'f@x.in',true),($1,'c2',$4,'m2@x.in',true)", [O, M, F, M2]);
}
const entry = async (db: PGlite, id: string, amount: number, entity: string | null = null) => {
  await actAs(db, null);
  await db.query("INSERT INTO public.expenses(id,employee_id,title,category,amount,original_amount,currency,expense_date,account_id,description,entity_id) VALUES ($1,$2,'Team lunch','Food and beverages',$3,$3,'INR','2026-11-09',$4,'',$5)", [id, O, amount, ACC, entity]);
};
const row = async (db: PGlite, id: string) => { await actAs(db, null); return (await db.query<{ j: Record<string, unknown> }>("SELECT to_jsonb(e) j FROM public.expenses e WHERE id = $1", [id])).rows[0]?.j; };

describe("P13 team change requests (SQL, isolated PGlite)", () => {
  it("applied schema + P9 + P10: team deletes and money edits refused; request → owner/Finance decision applies it; audit kept; rollback exact", async () => {
    const db = await fullSchemaDb([P9, P10]);
    await seedTeam(db);
    const E1 = u(901), E2 = u(902);
    await entry(db, E1, 2400);
    await entry(db, E2, 1200);
    const before = await catalog(db);
    // Recorded before P13 (rolled back): a manager with "delete team expenses" switched on is refused only by P10.
    expect((await as(db, M, "DELETE FROM public.expenses WHERE id = $1", [E1])).e).toMatch(/P10_WITHDRAW_ONLY/);
    await db.exec(readSql(P13));
    expect((await as(db, M, "DELETE FROM public.expenses WHERE id = $1 RETURNING 1 v", [E1])).e ?? "matched no row").toMatch(/P10_WITHDRAW_ONLY|matched no row/);
    // direct money edit by a team member: refused (the approved correction below is audited with its actor)
    expect((await as(db, M, "UPDATE public.expenses SET amount = 1 WHERE id = $1", [E1])).e).toMatch(/P13_REQUEST_REQUIRED/);
    // requests
    expect((await as(db, X, "SELECT public.request_entry_change($1,'withdraw','Duplicate of E2') v", [E1])).e).toMatch(/P13_NOT_PERMITTED/);
    expect((await as(db, O, "SELECT public.request_entry_change($1,'withdraw','Duplicate of E2') v", [E1])).e).toMatch(/P13_NOT_PERMITTED/);
    const r1 = (await as<string>(db, M, "SELECT public.request_entry_change($1,'withdraw','Duplicate of E2') v", [E1])).v!;
    expect((await as(db, M, "SELECT public.request_entry_change($1,'correct','Typo in the title',$2::jsonb) v", [E1, '{"title":"x"}'])).e).toMatch(/P13_PENDING/);
    expect((await as(db, M, "SELECT public.decide_entry_change($1, true, 'Looks right') v", [r1])).e).toMatch(/P13_NOT_PERMITTED/); // requester
    expect((await as(db, X, "SELECT public.decide_entry_change($1, true, 'Looks right') v", [r1])).e).toMatch(/P13_NOT_PERMITTED/);
    expect((await as<{ status: string }>(db, O, "SELECT public.decide_entry_change($1, true, 'Agreed, duplicate') v", [r1])).v).toMatchObject({ status: "approved" });
    const w = ((await row(db, E1))!["receipt_details"] as { withdrawal: { state: string; by: string; history: { requestId: string; requestedBy: string }[] } }).withdrawal;
    expect(w).toMatchObject({ state: "withdrawn", by: O });
    expect(w.history[0]).toMatchObject({ requestId: r1, requestedBy: M });
    expect((await as<{ replayed: boolean }>(db, O, "SELECT public.decide_entry_change($1, false, 'Changed my mind') v", [r1])).v).toMatchObject({ status: "approved", replayed: true });
    // correction approved by Finance (approve switch); fields outside the whitelist refused
    expect((await as(db, M, "SELECT public.request_entry_change($1,'correct','Wrong account',$2::jsonb) v", [E2, '{"account_id":"x"}'])).e).toMatch(/P13_INVALID/);
    const r2 = (await as<string>(db, M, "SELECT public.request_entry_change($1,'correct','Bill says 1,250.00',$2::jsonb) v", [E2, '{"amount":1250,"title":"Team dinner"}'])).v!;
    expect((await as(db, F, "SELECT public.decide_entry_change($1, true, 'Checked the bill') v", [r2])).e).toBeUndefined();
    expect(await row(db, E2)).toMatchObject({ amount: 1250, original_amount: 1250, title: "Team dinner" });
    // decisions and audit are kept
    expect((await as(db, O, "UPDATE public.entry_change_requests SET status = 'rejected'")).n ?? 0).toBe(0); // no client write path
    expect((await as(db, null, "SELECT count(*)::int v FROM public.transaction_audit WHERE transaction_id = $1 AND actor_id = $2", [E2, F])).v).toBeGreaterThan(0);
    expect((await as(db, O, "DELETE FROM public.transaction_audit WHERE owner_id = $1", [O])).n ?? 0).toBe(0); // RLS: no delete path
    expect((await as(db, O, "TRUNCATE public.transaction_audit")).e).toMatch(/P13_AUDIT_KEPT|permission denied/);
    expect((await as(db, O, "TRUNCATE public.expense_history CASCADE")).e).toMatch(/P13_AUDIT_KEPT|permission denied/);
    // rollback refuses while requests exist, then (approved) restores the exact catalog including the team delete policy
    await expect(db.exec(readSql(P13_RB))).rejects.toThrow(/change requests or recorded audit actors exist/);
    await db.exec("ROLLBACK");
    await db.exec(readSql(P13_RB).replace("BEGIN;", "BEGIN; SET LOCAL phase3_p13.drop_requests = 'on';"));
    expect(await catalog(db)).toEqual(before);
    await db.close();
  }, 600_000);

  it("whole stack P1..P11 + P13: entity separation for requests and approvals; confirmed erasure still works; rollback exact", async () => {
    const db = await fullSchemaDb([...STACK, P9, P10, P11]);
    await seedTeam(db, true);
    const C1 = u(911), C2 = u(912);
    await entry(db, C1, 3000, "c1");
    await entry(db, C2, 4000, "c2");
    const before = await catalog(db);
    await db.exec(readSql(P13));
    // M is a writer for company c1 only; M2 for c2 only; F approves for c1 only.
    expect((await as(db, M, "SELECT public.request_entry_change($1,'withdraw','Duplicate entry') v", [C2])).e).toMatch(/P13_NOT_PERMITTED/);
    const r1 = (await as<string>(db, M, "SELECT public.request_entry_change($1,'withdraw','Duplicate entry') v", [C1])).v!;
    const r2 = (await as<string>(db, M2, "SELECT public.request_entry_change($1,'correct','Bill says 3,950.00',$2::jsonb) v", [C2, '{"amount":3950}'])).v!;
    expect((await as(db, F, "SELECT count(*)::int v FROM public.entry_change_requests")).v).toBe(1); // sees c1 only
    expect((await as(db, F, "SELECT public.decide_entry_change($1, true, 'Checked the bill') v", [r2])).e).toMatch(/P13_NOT_PERMITTED/);
    expect((await as(db, F, "SELECT public.decide_entry_change($1, true, 'Checked, duplicate') v", [r1])).v).toMatchObject({ status: "approved" });
    expect((await as(db, M2, "SELECT count(*)::int v FROM public.entry_change_requests")).v).toBe(1); // own request only
    expect((await as(db, O, "SELECT public.decide_entry_change($1, false, 'Bill is 4,000.00') v", [r2])).v).toMatchObject({ status: "rejected" });
    expect(await row(db, C2)).toMatchObject({ amount: 4000 });
    await db.exec(readSql(P13_RB).replace("BEGIN;", "BEGIN; SET LOCAL phase3_p13.drop_requests = 'on';"));
    expect(await catalog(db)).toEqual(before);
    await db.exec(readSql(P13));
    await actAs(db, null);
    await db.exec("SET ROLE service_role");
    await db.query("SELECT public.record_step_up($1,'password',300)", [O]);
    expect((await as(db, O, "SELECT public.delete_my_finance_data() v")).e).toBeUndefined(); // erasure of the owner's own data
    expect((await as(db, null, "SELECT count(*)::int v FROM public.expenses WHERE employee_id = $1", [O])).v).toBe(0);
    await db.close();
  }, 600_000);
});
