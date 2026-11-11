// @vitest-environment node
// Proposed P9 B4 (Track A, 11 Nov 2026): payees are archive-only in the database too. Payees are not a table; they are the
// owner-preferences list finance_preferences.data.payees (payees.ts), referred to by expenses.payee_id (0046) and
// accounts.details.payeeId. WS-E (records-archive.ts ARCHIVED_TABLES "payees") made them archive-only in the app; P9 B4
// keeps every stored payee when a signed-in write leaves one out, so an API "delete" can never leave payee_id dangling.
// Isolated PGlite only (applied migrations + proposed SQL). Never Cloud.
import { describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { actAs, addUsers, fullSchemaDb, readSql } from "@/test/full-schema-pglite";

const D = ".lovable/staged-sql/proposed/";
const P9 = `${D}P9_statement_import_idempotency_and_archive_guards.sql`, P9_RB = `${D}P9_statement_import_idempotency_and_archive_guards.rollback.sql`;
const P18 = `${D}P18_erasure_authority.sql`;
const STACK = ["P1_security_containment", "P2_v31_role_model", "P4_step_up_and_assistant_limits", "P5_legal_entities_foundation", "P5b_restore_investments", "P6_registers", "P7_balanced_posting", "P8_asset_depreciation_posting", "P9_statement_import_idempotency_and_archive_guards", "P10_unposted_entry_withdrawal", "P11_backup_restore_receipts", "P13_team_change_requests", "P14_asset_disposal_approval", "P15_export_authorisation", "P16_statement_undo_withdraw", "P17_locked_evidence_storage"].map((f) => `${D}${f}.sql`);
const O = "0000000d-0000-4000-8000-0000000000d1", V = "0000000d-0000-4000-8000-0000000000d2";
const CATALOG = `
  SELECT 'f' k, n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' n, md5(p.prosrc) || coalesce(p.proacl::text, '') || p.prosecdef::text || coalesce(p.proconfig::text, '') v
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_%'
  UNION ALL SELECT 't', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) || t.tgenabled::text FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal
  UNION ALL SELECT 'c', table_schema || '.' || table_name || '.' || column_name, data_type || is_nullable FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  UNION ALL SELECT 'n', nspname, coalesce(nspacl::text, '') FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1, 2`;
type Db = PGlite;
const sql = async <R = Record<string, unknown>>(db: Db, q: string, p: unknown[] = []) => { await actAs(db, null); return (await db.query<R>(q, p)).rows; };
const catalog = async (db: Db) => (await sql<{ k: string; n: string; v: string }>(db, CATALOG)).map((r) => `${r.k}|${r.n}|${r.v}`);
/** As uid in one transaction (committed on success); "" or the error text. */
async function tx(db: Db, uid: string | null, q: string, p: unknown[] = []): Promise<string> {
  await actAs(db, uid);
  await db.exec("BEGIN");
  try { await db.query(q, p); await db.exec("COMMIT"); return ""; } catch (e) { await db.exec("ROLLBACK"); return (e as Error).message; } finally { await actAs(db, null); }
}
const payee = (id: string, name: string, archived = false) => ({ id, name, type: "individual", identifiers: [], accountDetails: "", accountVerified: false, organisation: "", preferredCategory: "", archived });
const stored = async (db: Db, owner = O) => ((await sql<{ data: { payees?: { id: string; name: string; archived: boolean }[] } }>(db, "SELECT data FROM public.finance_preferences WHERE owner_id = $1", [owner]))[0]?.data.payees ?? []).map((p) => `${p.id}:${p.name}${p.archived ? ":archived" : ""}`);

async function seed(db: Db) {
  await addUsers(db, { [O]: "o@x.in", [V]: "v@x.in" });
  const acc = crypto.randomUUID();
  await sql(db, "INSERT INTO public.accounts(id, owner_id, name, kind) VALUES ($1,$2,'HDFC','savings')", [acc, O]);
  await sql(db, "INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1,$2::jsonb),($3,$4::jsonb) ON CONFLICT (owner_id) DO UPDATE SET data = EXCLUDED.data",
    [O, JSON.stringify({ payees: [payee("a", "Asha"), payee("b", "Ravi Traders")] }), V, JSON.stringify({ payees: [payee("v1", "Vendor")] })]);
  await sql(db, "INSERT INTO public.expenses(id,employee_id,title,category,amount,original_amount,currency,expense_date,account_id,payee_id,description) VALUES (gen_random_uuid(),$1,'Rent','Housing',15000,15000,'INR','2026-11-01',$2,'b','')", [O, acc]);
}
const WITHOUT_B = JSON.stringify([payee("a", "Asha")]);

describe("P9 B4: payees are archive-only (SQL, isolated PGlite)", () => {
  it("a signed-in write that drops a payee keeps the stored payee; edits and archive still save; whole-row delete and truncate are refused", async () => {
    const db = await fullSchemaDb([P9]);
    await seed(db);
    // before: removing a payee through the API leaves the entry's payee_id dangling (the gap)
    expect(await stored(db)).toEqual(["a:Asha", "b:Ravi Traders"]);
    // direct table write (API) dropping "b", and one dropping the whole list: both keep "b"
    expect(await tx(db, O, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{payees}', $2::jsonb) WHERE owner_id = $1", [O, WITHOUT_B])).toBe("");
    expect(await stored(db)).toEqual(["a:Asha", "b:Ravi Traders"]);
    expect(await tx(db, O, "UPDATE public.finance_preferences SET data = data - 'payees' WHERE owner_id = $1", [O])).toBe("");
    expect(await stored(db)).toEqual(["a:Asha", "b:Ravi Traders"]);
    expect(await tx(db, O, "UPDATE public.finance_preferences SET data = '{}'::jsonb WHERE owner_id = $1", [O])).toBe("");
    expect(await stored(db)).toEqual(["a:Asha", "b:Ravi Traders"]);
    // the entry still resolves to a stored payee
    expect((await sql<{ n: number }>(db, "SELECT count(*)::int n FROM public.expenses e JOIN public.finance_preferences f ON f.owner_id = e.employee_id, jsonb_array_elements(f.data->'payees') p WHERE e.employee_id = $1 AND p->>'id' = e.payee_id", [O]))[0]!.n).toBe(1);
    // edits and archive (the app's only removal) still save as sent
    const edited = JSON.stringify([payee("a", "Asha K"), payee("b", "Ravi Traders", true)]);
    expect(await tx(db, O, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{payees}', $2::jsonb) WHERE owner_id = $1", [O, edited])).toBe("");
    expect(await stored(db)).toEqual(["a:Asha K", "b:Ravi Traders:archived"]);
    // adding still works; another owner's payees are untouched and out of reach
    expect(await tx(db, O, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{payees}', (data->'payees') || $2::jsonb) WHERE owner_id = $1", [O, JSON.stringify([payee("c", "Meena")])])).toBe("");
    expect(await stored(db)).toEqual(["a:Asha K", "b:Ravi Traders:archived", "c:Meena"]);
    expect(await tx(db, V, "UPDATE public.finance_preferences SET data = '{}'::jsonb WHERE owner_id = $1", [O])).toBe("");
    expect(await stored(db)).toEqual(["a:Asha K", "b:Ravi Traders:archived", "c:Meena"]);
    expect(await stored(db, V)).toEqual(["v1:Vendor"]);
    // deleting the row that holds the payees, or truncating it, is refused for the owner
    expect(await tx(db, O, "DELETE FROM public.finance_preferences WHERE owner_id = $1", [O])).toMatch(/P9_PREFERENCES_KEPT/);
    expect(await tx(db, O, "TRUNCATE public.finance_preferences CASCADE")).toMatch(/P9_ARCHIVE_ONLY/);
    expect(await stored(db)).toEqual(["a:Asha K", "b:Ravi Traders:archived", "c:Meena"]);
    await db.close();
  }, 300_000);

  it("restoring an older backup without a payee keeps that payee; the service path and confirmed erasure still remove payees", async () => {
    const db = await fullSchemaDb([P9]);
    await seed(db);
    const older = { finance_preferences: [{ data: { payees: [payee("a", "Asha (backup)")] } }] };
    expect(await tx(db, O, "SELECT public.restore_finance_backup($1::jsonb)", [JSON.stringify(older)])).toBe("");
    expect(await stored(db)).toEqual(["a:Asha (backup)", "b:Ravi Traders"]);
    // service / operator path (no signed-in user, not the API roles) is unchanged
    expect(await tx(db, null, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{payees}', '[]'::jsonb) WHERE owner_id = $1", [V])).toBe("");
    expect(await stored(db, V)).toEqual([]);
    // confirmed erasure of the caller's own data removes the preferences row, so the payees go with it
    expect(await tx(db, O, "SELECT public.delete_my_finance_data()")).toBe("");
    expect((await sql<{ n: number }>(db, "SELECT count(*)::int n FROM public.finance_preferences WHERE owner_id = $1", [O]))[0]!.n).toBe(0);
    await db.close();
  }, 300_000);

  it("whole proposed stack + P18: P18 installs over B4 (no session setting to rewrite), payees stay archive-only, authorised erasure removes them", async () => {
    const db = await fullSchemaDb([...STACK]);
    await seed(db);
    await db.exec(readSql(P18));
    expect((await sql<{ src: string }>(db, "SELECT prosrc src FROM pg_proc WHERE proname = 'keep_payees'"))[0]!.src).not.toMatch(/current_setting/);
    expect(await tx(db, O, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{payees}', $2::jsonb) WHERE owner_id = $1", [O, WITHOUT_B])).toBe("");
    expect(await stored(db)).toEqual(["a:Asha", "b:Ravi Traders"]);
    // the old client-settable exemption opens nothing
    expect(await tx(db, O, "WITH s AS (SELECT set_config('ledgerline.erasing', 'on', true) v) DELETE FROM public.finance_preferences WHERE owner_id = $1 AND (SELECT v FROM s) = 'on'", [O])).toMatch(/P9_PREFERENCES_KEPT/);
    await actAs(db, null); await db.exec("SET ROLE service_role"); await db.query("SELECT public.record_step_up($1,'password',300)", [O]); await actAs(db, null);
    expect(await tx(db, O, "SELECT public.delete_my_finance_data()")).toBe("");
    expect((await sql<{ n: number }>(db, "SELECT count(*)::int n FROM public.finance_preferences WHERE owner_id = $1", [O]))[0]!.n).toBe(0);
    expect(await stored(db, V)).toEqual(["v1:Vendor"]);
    await db.close();
  }, 600_000);

  it("rollback restores the exact pre-P9 catalog and leaves the payees as stored; P9 installs again", async () => {
    const db = await fullSchemaDb([]);
    await seed(db);
    const before = await catalog(db);
    await db.exec(readSql(P9));
    expect(await catalog(db)).not.toEqual(before);
    expect(await tx(db, O, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{payees}', $2::jsonb) WHERE owner_id = $1", [O, WITHOUT_B])).toBe("");
    await db.exec(readSql(P9_RB));
    expect(await catalog(db)).toEqual(before);
    expect(await stored(db)).toEqual(["a:Asha", "b:Ravi Traders"]);
    // without P9 the drop goes through (the gap B4 closes)
    expect(await tx(db, O, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{payees}', $2::jsonb) WHERE owner_id = $1", [O, WITHOUT_B])).toBe("");
    expect(await stored(db)).toEqual(["a:Asha"]);
    await db.exec(readSql(P9));
    expect(await tx(db, O, "UPDATE public.finance_preferences SET data = '{}'::jsonb WHERE owner_id = $1", [O])).toBe("");
    expect(await stored(db)).toEqual(["a:Asha"]);
    await db.close();
  }, 300_000);
});
