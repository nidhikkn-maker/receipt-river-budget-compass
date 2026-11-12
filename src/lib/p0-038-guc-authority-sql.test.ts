// @vitest-environment node
// P0-038: proposed guards no longer trust session settings a client can set with SET / set_config. Each former
// exemption is now a transaction-bound authority row (owner/actor + txid_current()) written only by the SECURITY
// DEFINER operation that owns it and removed before it returns. Every attack below sets the old setting as the
// signed-in caller and attempts the guarded write; the legitimate function path still works; the whole stack P1..P18
// installs in order and rolls back exactly. Inventory: docs/security/p0-038/GUC_INVENTORY.md.
// Isolated in-memory PGlite only (never Cloud or a hosted database).
import { describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { actAs, addUsers, fullSchemaDb, readSql } from "@/test/full-schema-pglite";
import { ACC as PACC, INSERT_EXPENSE, U as PU, activate, attempt, e as pe, errorText, exParams, id as pid, q, seededDb, stepUp as pStepUp } from "@/test/phase3-fixture";

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const O = u(1), M = u(2), V = u(4);
const ACC = u(101);
const D = ".lovable/staged-sql/proposed/";
const f = (n: string) => `${D}${n}.sql`;
const LIGHT = ["P9_statement_import_idempotency_and_archive_guards", "P10_unposted_entry_withdrawal", "P11_backup_restore_receipts", "P13_team_change_requests", "P14_asset_disposal_approval"].map(f);
const STACK = ["P1_security_containment", "P2_v31_role_model", "P4_step_up_and_assistant_limits", "P5_legal_entities_foundation", "P5b_restore_investments", "P6_registers",
  "P7_balanced_posting", "P8_asset_depreciation_posting", "P9_statement_import_idempotency_and_archive_guards", "P10_unposted_entry_withdrawal", "P11_backup_restore_receipts",
  "P13_team_change_requests", "P14_asset_disposal_approval", "P15_export_authorisation", "P16_statement_undo_withdraw", "P17_locked_evidence_storage", "P18_erasure_authority"];
const RETIRED = String.raw`current_setting\('(phase3_p11\.checked|phase3_p10\.writing|phase3_p13\.(applying|deciding)|phase3_p7\.(writer|reversal_insert|reason|request|meta)|phase3_p9\.(claiming|discarding)|phase3_p14\.writing|ledgerline\.(posting_writer|accounting_request|restoring))'`;
const CATALOG = `
  SELECT 'f' k, n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' n, md5(p.prosrc) || coalesce(p.proacl::text, '') || p.prosecdef::text || coalesce(p.proconfig::text, '') || p.provolatile::text v
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_%'
  UNION ALL SELECT 't', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal
  UNION ALL SELECT 'r', c.oid::regclass::text, coalesce(c.relacl::text, '') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ('public', 'storage') AND c.relkind = 'r'
  UNION ALL SELECT 'c', table_name || '.' || column_name, data_type FROM information_schema.columns WHERE table_schema = 'public'
  UNION ALL SELECT 'p', schemaname || '.' || tablename || '.' || policyname, cmd || coalesce(qual, '') || coalesce(with_check, '') FROM pg_policies
  UNION ALL SELECT 'n', nspname, coalesce(nspacl::text, '') FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1, 2`;
const catalog = async (db: PGlite) => { await actAs(db, null); return (await db.query<{ k: string; n: string; v: string }>(CATALOG)).rows.map((r) => `${r.k}|${r.n}|${r.v}`); };
const sql = async <T = Record<string, unknown>>(db: PGlite, s: string, p: unknown[] = []) => { await actAs(db, null); return (await db.query<T>(s, p)).rows; };
/** As uid in one transaction (committed when it succeeds): "" or the error message. Statements run in order. */
const tx = async (db: PGlite, uid: string, steps: [string, unknown[]?][]) => {
  await actAs(db, uid);
  await db.exec("BEGIN");
  try { for (const [s, p] of steps) await db.query(s, p ?? []); await db.exec("COMMIT"); return ""; }
  catch (e) { await db.exec("ROLLBACK"); return (e as Error).message; } finally { await actAs(db, null); }
};
const readsRetired = (db: PGlite) => sql<{ f: string }>(db, `SELECT p.oid::regprocedure::text f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND p.prosrc ~ $1`, [RETIRED]);
const authorityRows = async (db: PGlite) => (await sql<{ n: number }>(db, `SELECT ((SELECT count(*) FROM phase3_p9.authority) + (SELECT count(*) FROM phase3_p10.authority)
  + (SELECT count(*) FROM phase3_p13.authority) + (SELECT count(*) FROM phase3_p11.restore_authority))::int n`))[0]!.n;

async function light() {
  const db = await fullSchemaDb(LIGHT);
  await addUsers(db, { [O]: "o@x.in", [M]: "m@x.in", [V]: "v@x.in" });
  await sql(db, "INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1,'{}'),($2,'{}') ON CONFLICT (owner_id) DO NOTHING", [O, V]);
  await sql(db, "INSERT INTO public.user_roles(user_id, role) VALUES ($1,'manager')", [M]);
  await sql(db, "UPDATE public.role_permissions SET allowed = true WHERE role = 'manager' AND action IN ('view_expenses','edit_expenses','delete_expenses')");
  await sql(db, "INSERT INTO public.accounts(id, owner_id, name, kind, opening_balance) VALUES ($1,$2,'HDFC Savings','savings',10000)", [ACC, O]);
  return db;
}
const entry = async (db: PGlite, id: string, amount = 2400, account: string | null = ACC) =>
  sql(db, "INSERT INTO public.expenses(id,employee_id,title,category,amount,original_amount,currency,expense_date,account_id,description) VALUES ($1,$2,'Team lunch','Food and beverages',$3,$3,'INR','2026-11-09',$4,'')", [id, O, amount, account]);
const amountOf = async (db: PGlite, id: string) => Number((await sql<{ a: string }>(db, "SELECT amount::text a FROM public.expenses WHERE id = $1", [id]))[0]!.a);

describe("P0-038 attacks on P9 / P10 / P11 / P13 / P14 (applied schema + those files)", () => {
  it("P10 phase3_p10.writing: a set setting does not unfreeze or rewrite a withdrawal; Withdraw / Restore entry still work", async () => {
    const db = await light();
    const E = u(901);
    await entry(db, E);
    expect(await tx(db, O, [["SELECT public.withdraw_entry($1,'Duplicate entry')", [E]]])).toBe("");
    for (const set of ["SELECT set_config('phase3_p10.writing', $1, true)", "SELECT set_config('phase3_p10.writing', $1, false)"]) {
      expect(await tx(db, O, [[set, [E]], ["UPDATE public.expenses SET amount = 1 WHERE id = $1", [E]]])).toMatch(/P10_WITHDRAWN/);
      expect(await tx(db, O, [[set, [E]], ["UPDATE public.expenses SET receipt_details = jsonb_set(receipt_details, '{withdrawal,state}', '\"restored\"') WHERE id = $1", [E]]])).toMatch(/P10_WITHDRAWAL_ONLY_BY_FUNCTION/);
    }
    await sql(db, "RESET phase3_p10.writing");
    expect(await amountOf(db, E)).toBe(2400);
    expect(await tx(db, O, [["SELECT public.restore_entry($1,'Not a duplicate')", [E]]])).toBe("");
    expect(await tx(db, O, [["UPDATE public.expenses SET amount = 2500 WHERE id = $1", [E]]])).toBe("");
    expect(await authorityRows(db)).toBe(0);
    // the authority table and its writers are not reachable by a client
    for (const s of ["INSERT INTO phase3_p10.authority(transaction_id, scope, item, actor_id) VALUES (txid_current(), 'writing', $1, auth.uid())", "SELECT phase3_p10.grant_authority('writing', $1)"])
      expect(await tx(db, O, [[s, [E]]])).toMatch(/permission denied/);
    await db.close();
  }, 600_000);

  it("P13 phase3_p13.applying / deciding: a team member's direct money edit and a request decision stay refused; approval still applies", async () => {
    const db = await light();
    const E = u(902);
    await entry(db, E, 2400, null); // no account: the applied account check (RLS) would otherwise refuse a team edit first
    expect(await tx(db, M, [["SELECT set_config('phase3_p13.applying', $1, true)", [E]], ["UPDATE public.expenses SET amount = 1 WHERE id = $1", [E]]])).toMatch(/P13_REQUEST_REQUIRED/);
    expect(await amountOf(db, E)).toBe(2400);
    const rid = (await (async () => { await actAs(db, M); const r = await db.query<{ v: string }>("SELECT public.request_entry_change($1,'correct','Typo in amount','{\"amount\":2000}'::jsonb) v", [E]); await actAs(db, null); return r.rows[0]!.v; })());
    // deciding: no client UPDATE on the request table, setting or not (the requester approving their own request)
    expect(await tx(db, M, [["SELECT set_config('phase3_p13.deciding', $1, true)", [rid]], ["UPDATE public.entry_change_requests SET status = 'approved', decided_at = now(), decided_by = auth.uid(), decision_reason = 'self approved' WHERE id = $1", [rid]]])).toMatch(/permission denied/);
    expect((await sql<{ s: string }>(db, "SELECT status s FROM public.entry_change_requests WHERE id = $1", [rid]))[0]!.s).toBe("pending");
    expect(await tx(db, O, [["SELECT public.decide_entry_change($1, true, 'Agreed, typo')", [rid]]])).toBe("");
    expect(await amountOf(db, E)).toBe(2000);
    expect(await authorityRows(db)).toBe(0);
    // the guard itself (audit history) also refuses the owner who sets the setting
    expect(await tx(db, O, [["SELECT set_config('phase3_p13.deciding', $1, true)", [rid]], ["UPDATE public.entry_change_requests SET decision_reason = 'rewritten' WHERE id = $1", [rid]]])).toMatch(/permission denied|P13_AUDIT_KEPT/);
    await db.close();
  }, 600_000);

  it("P9 phase3_p9.claiming: a set setting does not let a client write statement-line registration; claim / confirm still work", async () => {
    const db = await light();
    const E = u(903), B = u(950);
    await entry(db, E);
    await sql(db, "INSERT INTO public.statement_line_imports(owner_id, account_key, fingerprint, line_date, batch_id, file_label) VALUES ($1,'acc-1','fp-seen','2026-11-01',$2,'nov.csv')", [O, B]);
    expect(await tx(db, O, [["SELECT set_config('phase3_p9.claiming','on',true)"], ["UPDATE public.statement_line_imports SET entry_id = $1, registered_at = now() WHERE fingerprint = 'fp-seen'", [E]]])).toMatch(/P9_LINE_CLAIM/);
    // an INSERT with a registration is stripped to a plain "seen" row
    expect(await tx(db, O, [["SELECT set_config('phase3_p9.claiming','on',true)"], ["INSERT INTO public.statement_line_imports(owner_id, account_key, fingerprint, line_date, batch_id, file_label, entry_id, registered_at) VALUES ($1,'acc-1','fp-forged','2026-11-02',$2,'nov.csv',$3,now())", [O, B, E]]])).toBe("");
    expect(await sql(db, "SELECT entry_id, registered_at FROM public.statement_line_imports WHERE fingerprint = 'fp-forged'")).toEqual([{ entry_id: null, registered_at: null }]);
    const E2 = u(904);
    expect(await tx(db, O, [["SELECT * FROM public.claim_statement_lines('acc-1', $1, 'dec.csv', $2::jsonb)", [B, JSON.stringify([{ fingerprint: "fp-new", line_date: "2026-11-03", entry_id: E2 }])]]])).toBe("");
    await entry(db, E2, 99);
    expect(await tx(db, O, [["SELECT public.confirm_statement_lines(ARRAY[$1::uuid])", [E2]]])).toBe("");
    expect((await sql<{ r: boolean }>(db, "SELECT registered_at IS NOT NULL r FROM public.statement_line_imports WHERE fingerprint = 'fp-new'"))[0]!.r).toBe(true);
    expect(await authorityRows(db)).toBe(0);
    await db.close();
  }, 600_000);

  it("P11 phase3_p11.checked (and P14's restore exemption): the direct restore and a direct disposal stay refused; the checked restore works and is recorded", async () => {
    const db = await light();
    await entry(db, u(905), 450);
    await sql(db, "UPDATE public.finance_preferences SET data = $2::jsonb WHERE owner_id = $1", [O, JSON.stringify({ assets: [{ id: "ast-1", name: "Laptop", cost: 1000, purchaseDate: "2026-04-01" }] })]);
    const one = async (t: string, col = "owner_id") => (await sql<{ j: unknown }>(db, `SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]') j FROM public.${t} x WHERE ${col} = $1`, [O]))[0]!.j;
    const p = { finance_preferences: await one("finance_preferences"), accounts: await one("accounts"), expenses: await one("expenses", "employee_id") };
    const P = JSON.stringify(p);
    for (const set of ["SELECT set_config('phase3_p11.checked','on',true)", "SET LOCAL phase3_p11.checked = 'on'"])
      expect(await tx(db, O, [[set], ["SELECT public.restore_finance_backup($1::jsonb)", [P]]])).toMatch(/P11_RESTORE_CHECK_REQUIRED/);
    const sold = "UPDATE public.finance_preferences SET data = jsonb_set(data, '{assets,0,soldOn}', '\"2026-10-31\"') WHERE owner_id = $1";
    expect(await tx(db, O, [["SELECT set_config('phase3_p11.checked','on',true)"], [sold, [O]]])).toMatch(/P14_DISPOSAL_APPROVAL_REQUIRED/);
    // a ticket is bound to the exact payload, is used once, and cannot be left open at commit
    const other = JSON.stringify({ ...p, expenses: [] });
    expect(await tx(db, O, [["SELECT phase3_p11.open_restore($1::jsonb)", [P]], ["SELECT public.restore_finance_backup($1::jsonb)", [other]]])).toMatch(/P11_RESTORE_CHECK_REQUIRED/);
    expect(await tx(db, O, [["SELECT phase3_p11.open_restore($1::jsonb)", [P]]])).toMatch(/P11_RESTORE_UNRECORDED/);
    expect(await tx(db, O, [["SELECT phase3_p11.close_restore('{}'::jsonb)"]])).toMatch(/P11_RESTORE_CHECK_REQUIRED/);
    for (const s of ["INSERT INTO phase3_p11.restore_authority(transaction_id, actor_id, fingerprint, payload_sha, mode) VALUES (txid_current(), auth.uid(), 'x', 'y', 'first')", "UPDATE phase3_p11.restore_authority SET claimed = true"])
      expect(await tx(db, O, [[s]])).toMatch(/permission denied/);
    expect((await sql<{ n: number }>(db, "SELECT count(*)::int n FROM public.backup_restore_receipts"))[0]!.n).toBe(0);
    // legitimate: the checked restore (it carries a disposal from the backup: P14 lets the restore write it)
    const withSale = JSON.stringify({ ...p, finance_preferences: [{ ...(p.finance_preferences as Record<string, unknown>[])[0], data: { assets: [{ id: "ast-1", name: "Laptop", cost: 1000, purchaseDate: "2026-04-01", soldOn: "2026-10-31" }] } }] });
    await actAs(db, O);
    const r = (await db.query<{ v: { status: string } }>("SELECT public.restore_finance_backup_checked($1::jsonb) v", [withSale])).rows[0]!.v;
    expect(r).toMatchObject({ status: "restored", changed: true });
    expect((await db.query<{ v: { status: string } }>("SELECT public.restore_finance_backup_checked($1::jsonb) v", [withSale])).rows[0]!.v).toMatchObject({ status: "previously_restored", changed: false });
    await actAs(db, null);
    expect((await sql<{ s: string | null }>(db, "SELECT data->'assets'->0->>'soldOn' s FROM public.finance_preferences WHERE owner_id = $1", [O]))[0]!.s).toBe("2026-10-31");
    expect((await sql<{ n: number }>(db, "SELECT count(*)::int n FROM public.backup_restore_receipts WHERE owner_id = $1", [O]))[0]!.n).toBe(1);
    expect(await authorityRows(db)).toBe(0);
    await db.close();
  }, 600_000);
});

describe("P0-038 attacks on P7 (applied schema + P1 P2 P4 P5 P7, books active)", () => {
  it("phase3_p7.reversal_insert / reason / request / meta / writer: no direct reversal, no forged posting audit, no direct posting rows", async () => {
    const db = await seededDb();
    await activate(db, PU.O);
    const orig = pe(25);
    const mirror = `INSERT INTO public.expenses SELECT (jsonb_populate_record(NULL::public.expenses, to_jsonb(o) || jsonb_build_object('id', gen_random_uuid(), 'reverses_entry_id', o.id,
      'receipt_details', jsonb_build_object('reversal', jsonb_build_object('of', o.id, 'reason', 'forged')), 'statement_ref', NULL, 'reconciled_at', NULL, 'transfer_counterpart_of', NULL,
      'created_at', clock_timestamp(), 'updated_at', clock_timestamp(), 'category_revision', 0, 'correction_revision', 0))).* FROM public.expenses o WHERE o.id = $1`;
    const forged = await attempt(db, PU.O, async () => { await q(db, "SELECT set_config('phase3_p7.reversal_insert', $1, true)", [orig]); await q(db, mirror, [orig]); });
    expect(errorText(forged)).toMatch(/P7_REVERSAL_ONLY_BY_FUNCTION/);
    // forged posting audit context on an ordinary save: ignored (reason, request and meta come only from Reverse entry)
    const E = pid(6801);
    const saved = await attempt(db, PU.O, async () => {
      await q(db, "SELECT set_config('phase3_p7.reason', 'Reversed: forged', true), set_config('phase3_p7.request', $1, true), set_config('phase3_p7.meta', $2, true)", [pid(6802), JSON.stringify({ actor: PU.V, priorPeriod: { id: "p-forged" } })]);
      await q(db, INSERT_EXPENSE, exParams({ id: E, acc: PACC.P2, date: "2026-07-02", amount: 100 }));
      return q<{ meta: Record<string, unknown> }>(db, `SELECT b.meta FROM public.posting_batches b JOIN public.posting_events ev ON ev.id = b.event_id WHERE ev.event_key = 'ledger_entry:' || $1`, [E]);
    });
    expect(errorText(saved)).toBe("");
    const metas = saved.ok ? saved.value.map((r) => r.meta) : [];
    expect(metas.length).toBeGreaterThan(0);
    for (const m of metas) { expect(m).toMatchObject({ reason: "Ledger entry saved", actor: PU.O }); expect(m["request"] ?? null).toBeNull(); expect(m["priorPeriod"]).toBeUndefined(); }
    // writer: posting tables have no client write privilege, setting or not
    const direct = await attempt(db, PU.O, async () => { await q(db, "SELECT set_config('phase3_p7.writer','on',true)"); await q(db, "INSERT INTO public.posting_delegations(id, owner_id, entity_key, grantee_id, actions) VALUES ($1,$2,'x',$3,ARRAY['post'])", [pid(6803), PU.O, PU.A]); });
    expect(errorText(direct)).toMatch(/permission denied|P7_WRITER_ONLY/);
    // legitimate: Reverse entry (step-up, reason) records the reversal with its audit context
    const rev = await attempt(db, PU.O, async () => {
      await pStepUp(db, PU.O);
      const r = await q<{ r: { reversalEntryId: string } }>(db, "SELECT public.reverse_ledger_entry($1,$2,$3) r", [pid(6804), orig, "Duplicate of bank import"]);
      const m = await q<{ meta: Record<string, unknown> }>(db, "SELECT meta FROM public.posting_batches WHERE kind = 'reversal' AND meta->>'request' = $1", [pid(6804)]);
      await actAs(db, null); // superuser: the authority table is not readable by clients
      const left = await q<{ n: number }>(db, "SELECT count(*)::int n FROM phase3_p7.authority");
      return { r: r[0]!.r, m, left: left[0]!.n };
    });
    expect(errorText(rev)).toBe("");
    if (rev.ok) { expect(rev.value.m.length).toBeGreaterThan(0); expect(rev.value.m[0]!.meta).toMatchObject({ reason: "Reversed: Duplicate of bank import", actor: PU.O }); expect(rev.value.left).toBe(0); }
    expect(await readsRetired(db)).toEqual([]);
    await db.close();
  }, 600_000);
});

describe("P0-038 attacks on superseded P3 (applied schema + P1 P2 P3)", () => {
  it("ledgerline.posting_writer / accounting_request / restoring: no forged accounting evidence or postings", async () => {
    const db = await fullSchemaDb([f("P1_security_containment"), f("P2_v31_role_model"), f("P3_accounting_posting_layer")]);
    await addUsers(db, { [O]: "o@x.in" });
    await sql(db, "INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1,'{\"entities\":[{\"id\":\"A\",\"name\":\"Alpha\",\"kind\":\"company\"}]}') ON CONFLICT (owner_id) DO NOTHING", [O]);
    await sql(db, "INSERT INTO public.accounts(id, owner_id, name, kind, opening_balance) VALUES ($1,$2,'HDFC current','current',0)", [ACC, O]);
    const R = u(960);
    const evidence = ["INSERT INTO public.expenses(id,employee_id,title,category,amount,original_amount,currency,expense_date,account_id,description,txn_type,adjustment_sign,payment_method,receipt_details) VALUES (gen_random_uuid(),$1,'Forged journal','Accounting',500,500,'INR','2026-11-01',$2,'','adjustment',1,'other',$3::jsonb)",
      [O, ACC, JSON.stringify({ accounting: { requestId: R, primary: true, journal: { id: R } } })]] as [string, unknown[]];
    for (const set of ["SELECT set_config('ledgerline.restoring','on',true)", `SELECT set_config('ledgerline.accounting_request','${R}',true)`])
      expect(await tx(db, O, [[set], evidence])).toMatch(/Accounting evidence requires atomic journal posting/);
    expect(await tx(db, O, [["SELECT set_config('ledgerline.posting_writer','on',true)"], ["INSERT INTO public.accounting_postings(id,owner_id,entity_id,posting_date,kind,idempotency_key) VALUES (gen_random_uuid(),$1,'A','2026-11-01','journal','forged')", [O]]])).toMatch(/permission denied/);
    for (const s of ["SELECT accounting_private.grant_authority('restoring')", "INSERT INTO accounting_private.authority(transaction_id, scope) VALUES (txid_current(), 'restoring')"])
      expect(await tx(db, O, [[s]])).toMatch(/permission denied/);
    expect((await sql<{ n: number }>(db, "SELECT count(*)::int n FROM public.expenses WHERE employee_id = $1", [O]))[0]!.n).toBe(0);
    expect(await readsRetired(db)).toEqual([]);
    await db.close();
  }, 600_000);
});

/** Catalog entries of the read-only disposal audit trail a P14 rollback retains (brief G9). */
const P14_RETAINED = (x: string) => /asset_disposal_requests|phase3_p14_audit|phase3_p14_retained|p14_disposal_requests_follow_erasure/.test(x);
describe("P0-038 stack P1..P18", () => {
  it("installs in order, no installed function trusts a retired setting, and the reverse rollback restores the exact catalog", async () => {
    // P1..P8 first (their own tests cover their rollbacks; P1/P2 keep an archive schema by design), then the files this
    // finding changes or that build on them, P9..P18: exact catalog after rolling those back in reverse order.
    const at = STACK.indexOf("P9_statement_import_idempotency_and_archive_guards");
    const db = await fullSchemaDb(STACK.slice(0, at).map(f));
    const before = await catalog(db);
    for (const n of STACK.slice(at)) { try { await db.exec(readSql(f(n))); } catch (e) { throw new Error(`${n}: ${(e as Error).message}`); } }
    expect(await readsRetired(db)).toEqual([]);
    for (const n of STACK.slice(at).reverse()) { try { await db.exec(readSql(`${D}${n}.rollback.sql`)); } catch (e) { throw new Error(`${n} rollback: ${(e as Error).message}`); } }
    // Exact, except the disposal audit trail the P14 rollback retains by design (brief G9; p14-asset-disposal-sql.test.ts).
    const after = await catalog(db);
    expect(before.filter(P14_RETAINED)).toEqual([]);
    expect(after.filter((x) => !P14_RETAINED(x))).toEqual(before);
    expect(after.filter(P14_RETAINED).some((x) => x.startsWith("n|phase3_p14_retained|"))).toBe(true);
    await db.close();
  }, 600_000);
});
