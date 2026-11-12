// @vitest-environment node
// Proposed P20 (Track A): an audited, reduce-only correction of one claim's money-received citation, run through the
// owner-scoped finance_operation transaction ('correct_claim_receipt') with P19 strict idempotency. The store path
// (receipt-correction.ts submitReceiptCorrection, as store.correctReimbursementReceipt calls it) is driven against the
// real SQL so "case J" (one 5,000 money entry cited by a hotel and a visa claim) can be repaired in the app.
// Isolated in-memory PGlite only (never Cloud or a hosted database). Runs on applied + P19 and on the stack P1..P19.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { actAs, addUsers, fullSchemaDb, readSql } from "@/test/full-schema-pglite";
import { outstandingOf, receivedOf, statusColumn, validateReceipt, type ReimbursementInfo } from "./reimbursements";
import { planReceiptCorrection, submitReceiptCorrection, type ReceiptCorrection } from "./receipt-correction";
import { DEMO_GUEST_STEPS, removeDemoGuestRecords } from "./demo-cleanup";
import type { Expense, ReimbursementStatus } from "./expenses";

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const O = u(1), V = u(2), E = u(3), G = u(4), M = u(5), F = u(6), G2 = u(7), X = u(8), Y = u(9);
const ACC_O = u(101), ACC_V = u(201), ACC_E = u(301), ACC_G = u(401), ACC_F = u(601), ACC_G2 = u(701), ACC_X = u(801), ACC_Y = u(901);
const D = ".lovable/staged-sql/proposed/";
const P19 = `${D}P19_finance_operation_authority.sql`, P20 = `${D}P20_claim_receipt_correction.sql`, P20_RB = `${D}P20_claim_receipt_correction.rollback.sql`;
const STACK = ["P1_security_containment", "P2_v31_role_model", "P4_step_up_and_assistant_limits", "P5_legal_entities_foundation", "P5b_restore_investments", "P6_registers",
  "P7_balanced_posting", "P8_asset_depreciation_posting", "P9_statement_import_idempotency_and_archive_guards", "P10_unposted_entry_withdrawal", "P11_backup_restore_receipts",
  "P13_team_change_requests", "P14_asset_disposal_approval", "P15_export_authorisation", "P16_statement_undo_withdraw", "P17_locked_evidence_storage", "P18_erasure_authority"];
const CATALOG = `
  SELECT 'f' k, n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' n, md5(p.prosrc) || coalesce(p.proacl::text, '') || p.prosecdef::text || coalesce(p.proconfig::text, '') v
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_%'
  UNION ALL SELECT 't', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal
  UNION ALL SELECT 'r', c.oid::regclass::text, coalesce(c.relacl::text, '') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ('public', 'storage') AND c.relkind = 'r'
  UNION ALL SELECT 'c', table_name || '.' || column_name, data_type FROM information_schema.columns WHERE table_schema = 'public'
  UNION ALL SELECT 'p', schemaname || '.' || tablename || '.' || policyname, cmd || coalesce(qual, '') || coalesce(with_check, '') FROM pg_policies
  UNION ALL SELECT 'n', nspname, coalesce(nspacl::text, '') FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1, 2`;
const sql = async <T = Record<string, unknown>>(db: PGlite, s: string, p: unknown[] = []) => { await actAs(db, null); return (await db.query<T>(s, p)).rows; };
const catalog = async (db: PGlite) => (await sql<{ k: string; n: string; v: string }>(db, CATALOG)).map((r) => `${r.k}|${r.n}|${r.v}`);
const num = async (db: PGlite, s: string, p: unknown[] = []) => (await sql<{ n: number }>(db, `SELECT (${s})::int n`, p))[0]!.n;

/** One RPC as a signed-in client (role authenticated, RLS), in its own transaction. */
async function as(db: PGlite, uid: string, s: string, p: unknown[] = []) {
  await actAs(db, uid);
  await db.exec("BEGIN");
  try { const rows = (await db.query<Record<string, unknown>>(s, p)).rows; await db.exec("COMMIT"); return rows; }
  catch (e) { await db.exec("ROLLBACK"); throw e; }
  finally { await actAs(db, null); }
}
/** The store's operation(action, payload): supabase.rpc("finance_operation") with the user's session. */
const rpc = (db: PGlite, uid: string) => async (action: string, payload: Record<string, unknown>) =>
  (await as(db, uid, "SELECT public.finance_operation($1, $2::jsonb) r", [action, JSON.stringify(payload)]))[0]!["r"] as Record<string, unknown>;
/** The claim as the store maps it (refresh after the operation). */
async function load(db: PGlite, id: string): Promise<Expense> {
  const [r] = await sql<{ id: string; amount: string; expense_date: string; title: string; reimbursement_status: ReimbursementStatus; reimbursement: ReimbursementInfo }>(db,
    "SELECT id, amount::text, expense_date::text, title, reimbursement_status, reimbursement FROM public.expenses WHERE id = $1", [id]);
  return { id: r!.id, amount: Number(r!.amount), date: r!.expense_date, title: r!.title, reimbursementStatus: r!.reimbursement_status, reimbursement: r!.reimbursement } as Expense;
}
const audits = (db: PGlite, claim: string) => sql<{ receipt_id: string; txn_id: string; before_amount: string; after_amount: string; before_status: string; after_status: string; reason: string; actor_id: string; operation_key: string }>(db,
  "SELECT receipt_id, txn_id, before_amount::text, after_amount::text, before_status, after_status, reason, actor_id, operation_key FROM public.claim_receipt_corrections WHERE claim_id = $1 ORDER BY created_at", [claim]);

/** Every audit row as stored (superuser view), in a stable order. */
const allAudits = (db: PGlite) => sql(db, "SELECT id::text, owner_id::text, claim_id::text, receipt_id, txn_id, before_amount::text, after_amount::text, before_status, after_status, receipt, reason, actor_id::text, operation_key, created_at::text FROM public.claim_receipt_corrections ORDER BY created_at, id");
/** One statement as another database role (anon, service_role) or as the superuser (null), in its own transaction. */
async function asRole(db: PGlite, role: "anon" | "service_role" | null, s: string, p: unknown[] = []) {
  await actAs(db, null);
  await db.exec("BEGIN");
  try { if (role) await db.exec(`SET LOCAL ROLE ${role}`); const rows = (await db.query(s, p)).rows; await db.exec("COMMIT"); return rows; }
  catch (e) { await db.exec("ROLLBACK"); throw e; }
  finally { await actAs(db, null); }
}

let seq = 5000;
/** Case J fixture: one money-back entry rr (5,000) cited by a hotel claim (hotelCites) and a visa claim (5,000). */
async function caseJ(db: PGlite, hotelCites: number, owner = O, account = ACC_O) {
  const rr = u(++seq), hotel = u(++seq), visa = u(++seq);
  await sql(db, `INSERT INTO public.expenses(id, employee_id, title, category, amount, original_amount, currency, expense_date, account_id, description, txn_type)
    VALUES ($1,$2,'Reimbursement: travel','Travel',5000,5000,'INR','2026-10-25',$3,'','reimbursement')`, [rr, owner, account]);
  const claim = async (id: string, title: string, date: string, cites: number) => sql(db, `INSERT INTO public.expenses(id, employee_id, title, category, amount, original_amount, currency, expense_date, account_id, description, reimbursement, reimbursement_status)
    VALUES ($1,$2,$3,'Travel',5000,5000,'INR',$4,$5,'',$6::jsonb,$7)`,
    [id, owner, title, date, account, JSON.stringify({ kind: "employer", payer: "Alpha Traders", reimbursable: 5000, stage: "submitted", receipts: [{ id: `r-${id}`, txnId: rr, date: "2026-10-25", amount: cites, note: "Bank credit" }] }), cites >= 5000 ? "received" : "pending"]);
  await claim(hotel, "Hotel", "2026-10-10", hotelCites);
  await claim(visa, "Visa", "2026-10-12", 5000);
  return { rr, hotel, visa, visaReceipt: `r-${visa}` };
}

async function setup(extra: string[]) {
  const db = await fullSchemaDb(extra);
  await addUsers(db, { [O]: "o@x.in", [V]: "v@x.in", [E]: "e@x.in", [G]: "", [M]: "m@x.in", [F]: "f@x.in", [G2]: "", [X]: "", [Y]: "y@x.in" });
  for (const [id, acc] of [[O, ACC_O], [V, ACC_V], [E, ACC_E], [G, ACC_G], [F, ACC_F], [G2, ACC_G2], [X, ACC_X], [Y, ACC_Y]]) {
    await sql(db, "INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1,'{}') ON CONFLICT (owner_id) DO NOTHING", [id]);
    await sql(db, "INSERT INTO public.accounts(id, owner_id, name, kind, opening_balance, archived) VALUES ($1,$2,'Savings','savings',50000,false)", [acc, id]);
  }
  // G and G2: visitor demo guests (demo_sessions row, anonymous identity), as start_demo_workspace leaves them.
  await sql(db, "UPDATE auth.users SET is_anonymous = true WHERE id IN ($1, $2)", [G, G2]);
  await sql(db, "INSERT INTO public.demo_sessions(owner_id, label) VALUES ($1,'guest-1'), ($2,'guest-2')", [G, G2]);
  // Spoofing fixtures: X is anonymous but has no demo_sessions row; Y has a demo_sessions row but upgraded to a real account.
  await sql(db, "UPDATE auth.users SET is_anonymous = true WHERE id = $1", [X]);
  await sql(db, "INSERT INTO public.demo_sessions(owner_id, label) VALUES ($1,'upgraded')", [Y]);
  // Supabase's service_role bypasses RLS (BYPASSRLS); the P20 guard, not RLS, must stop it.
  await sql(db, "ALTER ROLE service_role BYPASSRLS");
  // M: a team delegate whose role may delete other people's expenses (0066 "Team expenses: delete").
  await sql(db, "INSERT INTO public.user_roles(user_id, role) VALUES ($1,'manager')", [M]);
  await sql(db, "UPDATE public.role_permissions SET allowed = true WHERE role = 'manager' AND action IN ('view_expenses','edit_expenses','delete_expenses')");
  return db;
}
/** P4 step-up (stack only) before the erasure, as the app's server function records it. */
const stepUp = async (db: PGlite, uid: string) => { await actAs(db, null); await db.exec("SET ROLE service_role"); await db.query("SELECT public.record_step_up($1,'password',300)", [uid]); await actAs(db, null); };
/** The user's confirmed erasure (Settings: delete my data), as the signed-in user. */
const erase = async (db: PGlite, uid: string, stack: boolean) => { if (stack) await stepUp(db, uid); await as(db, uid, "SELECT public.delete_my_finance_data()"); };
/** The hourly demo cleanup's record removal (src/lib/demo-cleanup.ts, as the route runs it) as the service role. */
const demoCleanup = async (db: PGlite, uid: string) => removeDemoGuestRecords((table) => ({ delete: () => ({ eq: async (column: string, value: string) => {
  try { await asRole(db, "service_role", `DELETE FROM public.${table} WHERE ${column} = $1`, [value]); return { error: null }; } catch (error) { return { error }; }
} }) }), uid);
/** A statement's outcome: "" when it committed, else the error message. */
const outcome = (p: Promise<unknown>) => p.then(() => "", (e: Error) => e.message);
/** One corrected claim (visa's citation removed) for the owner; returns the claim id. */
const corrected = async (db: PGlite, owner: string, account: string, op: string) => {
  const j = await caseJ(db, 5000, owner, account);
  await submitReceiptCorrection(await load(db, j.visa), { receiptId: j.visaReceipt, newAmount: 0, reason: "Already counted on the hotel claim", operationId: op }, rpc(db, owner), true);
  return j.visa;
};
const claimRows = (db: PGlite, id: string) => num(db, "SELECT count(*) FROM public.expenses WHERE id = $1", [id]);

describe("receipt correction plan (client rules, no database)", () => {
  const visa = { id: "visa", amount: 5000, date: "2026-10-12", title: "Visa", reimbursementStatus: "received" as const,
    reimbursement: { reimbursable: 5000, receipts: [{ id: "v1", txnId: "rr", date: "2026-10-25", amount: 5000 }] } };
  const ok: ReceiptCorrection = { receiptId: "v1", newAmount: 0, reason: "Already counted on the hotel claim", operationId: "op-1" };
  afterEach(() => { vi.unstubAllGlobals(); });

  it("plans removal and reduction with the status the database will store", () => {
    const rm = planReceiptCorrection(visa, ok);
    expect(rm.info.receipts).toEqual([]);
    expect(rm.status).toBe("pending");
    expect(rm.payload).toEqual({ operationId: "op-1", id: "visa", receiptId: "v1", expectedAmount: 5000, newAmount: 0, reason: "Already counted on the hotel claim" });
    const part = planReceiptCorrection(visa, { ...ok, newAmount: 2000 });
    expect(part.info.receipts).toEqual([{ id: "v1", txnId: "rr", date: "2026-10-25", amount: 2000 }]);
    expect(part.status).toBe("pending");
    expect(planReceiptCorrection(visa, { ...ok, newAmount: 1999.99 }).after).toBe(1999.99);
  });

  it("refuses an increase, no change, a txnId/date/account change, a missing reason, bad amounts and unknown receipts", () => {
    expect(() => planReceiptCorrection(visa, { ...ok, newAmount: 5000.01 })).toThrow(/only reduce/);
    expect(() => planReceiptCorrection(visa, { ...ok, newAmount: 5000 })).toThrow(/only reduce/);
    for (const k of ["txnId", "date", "accountId"]) expect(() => planReceiptCorrection(visa, { ...ok, [k]: "x" } as ReceiptCorrection)).toThrow(/money entry, date and account stay/);
    for (const reason of ["", "   ", undefined]) expect(() => planReceiptCorrection(visa, { ...ok, reason } as ReceiptCorrection)).toThrow(/reason/);
    for (const newAmount of [-1, 0.001, Number.NaN, Infinity]) expect(() => planReceiptCorrection(visa, { ...ok, newAmount })).toThrow(/two decimal places/);
    expect(() => planReceiptCorrection(visa, { ...ok, receiptId: "nope" })).toThrow(/not on the claim/);
    expect(() => planReceiptCorrection(visa, { ...ok, operationId: "" })).toThrow(/operation identifier/);
  });

  it("refuses offline with the claim wording, before any request", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const run = vi.fn();
    await expect(submitReceiptCorrection(visa, ok, run, false)).rejects.toThrow("Reconnect to update this claim");
    expect(run).not.toHaveBeenCalled();
  });

  it("the store's online state decides, never navigator.onLine", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const run = vi.fn(async () => ({ ok: true }));
    await expect(submitReceiptCorrection(visa, ok, run, false)).rejects.toThrow("Reconnect to update this claim");
    expect(run).not.toHaveBeenCalled();
    vi.stubGlobal("navigator", { onLine: false });
    await submitReceiptCorrection(visa, ok, run, true);
    expect(run).toHaveBeenCalledWith("correct_claim_receipt", planReceiptCorrection(visa, ok).payload);
  });
});

for (const [label, extra, stack] of [["applied schema + P19", [P19], false], ["proposed stack P1..P19", [...STACK.map((n) => `${D}${n}.sql`), P19], true]] as const) {
  describe(`P20 claim receipt correction — ${label} (SQL, isolated PGlite)`, () => {
    let db: PGlite;
    let before: string[];
    let afterRollback: string[];
    let idem: { stale: Expense; c: ReceiptCorrection; claim: string } | null = null;
    beforeAll(async () => {
      db = await setup([...extra]);
      before = await catalog(db);
      vi.stubGlobal("navigator", { onLine: true });
    }, 600_000);
    afterAll(async () => { vi.unstubAllGlobals(); await db?.close(); });

    it("before P20 the operation does not exist; P20 installs once", async () => {
      const j = await caseJ(db, 5000);
      await expect(submitReceiptCorrection(await load(db, j.visa), { receiptId: j.visaReceipt, newAmount: 0, reason: "dup", operationId: "pre" }, rpc(db, O), true)).rejects.toThrow(/Unknown operation/);
      await db.exec(readSql(P20));
      await expect(db.exec(readSql(P20))).rejects.toThrow(/already installed/);
      await db.exec("ROLLBACK");
    }, 600_000);

    it("case J: removing visa's citation leaves 5,000 outstanding and a new 5,000 receipt is accepted", async () => {
      const j = await caseJ(db, 5000);
      let visa = await load(db, j.visa);
      expect(() => validateReceipt(visa, 5000)).toThrow(/outstanding/); // the safeguard stays: visa's own receipts total 5,000
      await submitReceiptCorrection(visa, { receiptId: j.visaReceipt, newAmount: 0, reason: "Already counted on the hotel claim", operationId: "j-remove" }, rpc(db, O), true);
      visa = await load(db, j.visa);
      expect(visa.reimbursement?.receipts).toEqual([]);
      expect(visa.reimbursementStatus).toBe("pending");
      expect(statusColumn(visa)).toBe(visa.reimbursementStatus);
      expect(receivedOf(visa)).toBe(0);
      expect(outstandingOf(visa)).toBe(5000);
      expect(() => validateReceipt(visa, 5000)).not.toThrow();
      // hotel and the money entry itself are untouched
      expect((await load(db, j.hotel)).reimbursement?.receipts?.map((r) => [r.txnId, r.amount])).toEqual([[j.rr, 5000]]);
      expect(await num(db, "SELECT count(*) FROM public.expenses WHERE id = $1 AND amount = 5000 AND txn_type = 'reimbursement'", [j.rr])).toBe(1);
      // the new receipt on another (new) money entry now saves through the normal workflow
      await rpc(db, O)("claim_receipt", { operationId: "j-new", id: j.visa, amount: 5000, date: "2026-11-02", accountId: ACC_O });
      visa = await load(db, j.visa);
      expect(visa.reimbursement?.receipts?.map((r) => r.amount)).toEqual([5000]);
      expect(visa.reimbursement?.receipts?.[0]?.txnId).not.toBe(j.rr);
      expect(visa.reimbursementStatus).toBe("received");
      // audit: before/after, reason, actor
      expect(await audits(db, j.visa)).toEqual([{ receipt_id: j.visaReceipt, txn_id: j.rr, before_amount: "5000.00", after_amount: "0.00", before_status: "received", after_status: "pending",
        reason: "Already counted on the hotel claim", actor_id: O, operation_key: "correct_claim_receipt:j-remove" }]);
    }, 600_000);

    it("partial case: visa's citation reduced to 2,000 leaves 3,000 outstanding and a 3,000 receipt is accepted", async () => {
      const j = await caseJ(db, 3000);
      let visa = await load(db, j.visa);
      await submitReceiptCorrection(visa, { receiptId: j.visaReceipt, newAmount: 2000, reason: "3,000 of rr is counted on hotel", operationId: "p-reduce" }, rpc(db, O), true);
      visa = await load(db, j.visa);
      expect(visa.reimbursement?.receipts).toEqual([{ id: j.visaReceipt, txnId: j.rr, date: "2026-10-25", amount: 2000, note: "Bank credit" }]);
      expect(receivedOf(visa)).toBe(2000);
      expect(outstandingOf(visa)).toBe(3000);
      expect(visa.reimbursementStatus).toBe("pending");
      expect(statusColumn(visa)).toBe("pending");
      expect(() => validateReceipt(visa, 3000.01)).toThrow(/outstanding/);
      expect(() => validateReceipt(visa, 3000)).not.toThrow();
      await rpc(db, O)("claim_receipt", { operationId: "p-new", id: j.visa, amount: 3000, date: "2026-11-02", accountId: ACC_O });
      visa = await load(db, j.visa);
      expect(receivedOf(visa)).toBe(5000);
      expect(visa.reimbursementStatus).toBe("received");
      const [a] = await audits(db, j.visa);
      expect([a!.before_amount, a!.after_amount, a!.reason]).toEqual(["5000.00", "2000.00", "3,000 of rr is counted on hotel"]);
    }, 600_000);

    it("the server refuses an increase, a txnId/date/account change, a missing reason, a stale amount and another owner's claim; nothing changes", async () => {
      const j = await caseJ(db, 3000);
      const base = { operationId: "x", id: j.visa, receiptId: j.visaReceipt, expectedAmount: 5000, newAmount: 2000, reason: "dup" };
      const refused = async (uid: string, p: Record<string, unknown>, re: RegExp) => { await expect(rpc(db, uid)("correct_claim_receipt", p)).rejects.toThrow(re); };
      await refused(O, { ...base, operationId: "x1", newAmount: 5000.5 }, /only reduce/);
      await refused(O, { ...base, operationId: "x2", newAmount: 5000 }, /only reduce/);
      await refused(O, { ...base, operationId: "x3", txnId: u(9999) }, /money entry, date and account stay/);
      await refused(O, { ...base, operationId: "x4", date: "2026-11-01" }, /money entry, date and account stay/);
      await refused(O, { ...base, operationId: "x5", accountId: ACC_O }, /money entry, date and account stay/);
      await refused(O, { ...base, operationId: "x6", reason: "  " }, /reason/);
      await refused(O, { ...base, operationId: "x7", reason: undefined }, /reason/);
      await refused(O, { ...base, operationId: "x8", expectedAmount: 4000 }, /changed/);
      await refused(O, { ...base, operationId: "x9", newAmount: 1.005 }, /two decimal places/);
      await refused(O, { ...base, operationId: "x10", newAmount: "0" }, /corrected amount/);
      await refused(O, { ...base, operationId: "x11", receiptId: "nope" }, /not on the claim/);
      // another owner: V cannot correct O's claim (it reads as not found), and the client plan never helps
      await refused(V, { ...base, operationId: "x12" }, /Claim not found/);
      // the correction step is not callable outside the workflow, by clients or by the owner role without authority
      await expect(as(db, O, "SELECT public.correct_claim_receipt($1::jsonb, 'k')", [JSON.stringify(base)])).rejects.toThrow(/permission denied/);
      await expect(as(db, V, "SELECT public.correct_claim_receipt($1::jsonb, 'k')", [JSON.stringify(base)])).rejects.toThrow(/permission denied/);
      await db.query("SELECT set_config('test.uid', $1, false)", [O]);
      await expect(db.query("SELECT public.correct_claim_receipt($1::jsonb, 'k')", [JSON.stringify(base)])).rejects.toThrow(/Use the payment workflow/);
      // the audit trail is owner-read-only and written only by the workflow
      await expect(as(db, O, "INSERT INTO public.claim_receipt_corrections(owner_id, claim_id, receipt_id, before_amount, after_amount, before_status, after_status, receipt, reason, actor_id, operation_key) VALUES ($1,$2,'r',2,1,'p','p','{}','x',$1,'k')", [O, j.visa])).rejects.toThrow(/permission denied/);
      const visa = await load(db, j.visa);
      expect(visa.reimbursement?.receipts?.map((r) => r.amount)).toEqual([5000]);
      expect(visa.reimbursementStatus).toBe("received");
      expect(await audits(db, j.visa)).toEqual([]);
      expect(await num(db, "SELECT count(*) FROM public.finance_operations WHERE operation_key LIKE 'correct_claim_receipt:x%'")).toBe(0);
      // V's own claim still works for V, and V never sees O's corrections
      const jv = await caseJ(db, 5000, V, ACC_V);
      await submitReceiptCorrection(await load(db, jv.visa), { receiptId: jv.visaReceipt, newAmount: 0, reason: "dup", operationId: "v-own" }, rpc(db, V), true);
      expect((await load(db, jv.visa)).reimbursement?.receipts).toEqual([]);
      expect((await as(db, V, "SELECT count(*)::int n FROM public.claim_receipt_corrections"))[0]!["n"]).toBe(1);
      expect((await as(db, O, "SELECT count(*)::int n FROM public.claim_receipt_corrections WHERE owner_id = $1", [V]))[0]!["n"]).toBe(0);
    }, 600_000);

    it("the stored status matches statusColumn: still received when over-cited, none for a written-off claim", async () => {
      const j = await caseJ(db, 3000);
      const extra = { id: "extra", txnId: j.rr, date: "2026-10-26", amount: 1000 };
      await sql(db, "UPDATE public.expenses SET reimbursement = jsonb_set(reimbursement, '{receipts}', reimbursement->'receipts' || $2::jsonb) WHERE id = $1", [j.visa, JSON.stringify([extra])]);
      let visa = await load(db, j.visa);
      const plan = planReceiptCorrection(visa, { receiptId: "extra", newAmount: 0, reason: "Counted twice", operationId: "st-1" });
      await submitReceiptCorrection(visa, { receiptId: "extra", newAmount: 0, reason: "Counted twice", operationId: "st-1" }, rpc(db, O), true);
      visa = await load(db, j.visa);
      expect([plan.status, visa.reimbursementStatus, statusColumn(visa)]).toEqual(["received", "received", "received"]);
      await sql(db, "UPDATE public.expenses SET reimbursement = reimbursement || '{\"stage\":\"written_off\"}', reimbursement_status = 'none' WHERE id = $1", [j.hotel]);
      const hotel = await load(db, j.hotel);
      const c = { receiptId: `r-${j.hotel}`, newAmount: 1000, reason: "Partly counted on visa", operationId: "st-2" };
      expect(planReceiptCorrection(hotel, c).status).toBe("none");
      await submitReceiptCorrection(hotel, c, rpc(db, O), true);
      const after = await load(db, j.hotel);
      expect([after.reimbursementStatus, statusColumn(after)]).toEqual(["none", "none"]);
      expect((await audits(db, j.hotel)).map((a) => [a.before_status, a.after_status])).toEqual([["none", "none"]]);
    }, 600_000);

    it("an idempotent retry replays without a second change; the same id with a different request is a conflict", async () => {
      const j = await caseJ(db, 3000);
      const c: ReceiptCorrection = { receiptId: j.visaReceipt, newAmount: 2000, reason: "3,000 counted on hotel", operationId: "idem-1" };
      const stale = await load(db, j.visa); // the screen's copy, as a retry after a lost response would still hold it
      idem = { stale, c, claim: j.visa };
      const first = await submitReceiptCorrection(stale, c, rpc(db, O), true);
      const again = await submitReceiptCorrection(stale, c, rpc(db, O), true);
      expect(again.result).toEqual({ ...(first.result as object), replayed: true });
      expect((await load(db, j.visa)).reimbursement?.receipts?.map((r) => r.amount)).toEqual([2000]);
      expect(await audits(db, j.visa)).toHaveLength(1);
      expect(await num(db, "SELECT count(*) FROM public.finance_operations WHERE owner_id = $1 AND operation_key = 'correct_claim_receipt:idem-1'", [O])).toBe(1);
      await expect(submitReceiptCorrection(stale, { ...c, newAmount: 1000 }, rpc(db, O), true)).rejects.toThrow(/P19_IDEMPOTENCY_CONFLICT/);
      // a new correction from the refreshed claim is a new operation
      await submitReceiptCorrection(await load(db, j.visa), { ...c, newAmount: 0, operationId: "idem-2" }, rpc(db, O), true);
      expect((await load(db, j.visa)).reimbursement?.receipts).toEqual([]);
      expect((await audits(db, j.visa)).map((a) => [a.before_amount, a.after_amount])).toEqual([["5000.00", "2000.00"], ["2000.00", "0.00"]]);
      expect(await num(db, "SELECT count(*) FROM phase3_p19.authority")).toBe(0);
    }, 600_000);

    it("K8: deleting a corrected claim (owner, team delegate, operator, statement undo) never removes its corrections", async () => {
      const own = await corrected(db, O, ACC_O, "k8-own");
      const team = await corrected(db, O, ACC_O, "k8-team");
      const op = await corrected(db, O, ACC_O, "k8-op");
      const kept = await allAudits(db);
      // the signed-in owner's direct PostgREST delete (0002 "Own expenses: delete"; P10 refuses it on the stack)
      const ownDelete = await outcome(as(db, O, "DELETE FROM public.expenses WHERE id = $1", [own]));
      // a team delegate allowed to delete other people's expenses (0066 "Team expenses: delete"; P13 drops it on the stack)
      await outcome(as(db, M, "DELETE FROM public.expenses WHERE id = $1", [team]));
      // the operator / service path
      await sql(db, "DELETE FROM public.expenses WHERE id = $1", [op]);
      if (!stack) {
        expect(ownDelete).toBe("");
        expect([await claimRows(db, own), await claimRows(db, team)]).toEqual([0, 0]); // the claim rows really went
      } else {
        expect(ownDelete).toMatch(/P10_WITHDRAW_ONLY/);
      }
      expect(await claimRows(db, op)).toBe(0);
      expect(await allAudits(db)).toEqual(kept);
      for (const c of [own, team, op]) expect(await audits(db, c)).toHaveLength(1);
      // a client-set erasure flag opens nothing: the owner's own delete with it set fails as a whole and the trail stays
      const flagged = await corrected(db, O, ACC_O, "k8-flag");
      const withFlag = await outcome((async () => { await actAs(db, O); await db.exec("BEGIN"); try { await db.query("SELECT set_config('ledgerline.erasing','on',true)"); await db.query("DELETE FROM public.expenses WHERE id = $1", [flagged]); await db.exec("COMMIT"); } catch (e) { await db.exec("ROLLBACK"); throw e; } finally { await actAs(db, null); } })());
      // applied: the follow-up runs as the signed-in caller, who holds no DELETE on the trail; stack: P10 refuses first
      expect(withFlag).toMatch(stack ? /P10_WITHDRAW_ONLY/ : /permission denied for table claim_receipt_corrections/);
      expect(await claimRows(db, flagged)).toBe(1);
      expect(await audits(db, flagged)).toHaveLength(1);
      await expect(as(db, O, "DELETE FROM public.claim_receipt_corrections WHERE claim_id = $1", [flagged])).rejects.toThrow(/permission denied/);
      // the operator cannot delete or change a correction directly either
      await expect(sql(db, "DELETE FROM public.claim_receipt_corrections WHERE claim_id = $1", [own])).rejects.toThrow(/P20_AUDIT_KEPT/);
      await expect(sql(db, "UPDATE public.claim_receipt_corrections SET reason = 'x' WHERE claim_id = $1", [own])).rejects.toThrow(/P20_AUDIT_KEPT/);
      await expect(sql(db, "TRUNCATE public.claim_receipt_corrections")).rejects.toThrow(/P20_AUDIT_KEPT/);
      // statement undo of a never-posted, uncorrected row is unaffected: it deletes as before (P16 withdraws on the stack)
      const line = u(++seq);
      await sql(db, "INSERT INTO public.expenses(id, employee_id, title, category, amount, original_amount, currency, expense_date, account_id, description, statement_ref) VALUES ($1,$2,'UPI transfer','Other',120,120,'INR','2026-11-03',$3,'','stmt-1#1')", [line, O, ACC_O]);
      const undo = await outcome(as(db, O, "DELETE FROM public.expenses WHERE id = $1 AND employee_id = $2", [line, O]));
      if (!stack) { expect(undo).toBe(""); expect(await claimRows(db, line)).toBe(0); } else expect(undo).toMatch(/P10_WITHDRAW_ONLY/);
      expect(await allAudits(db)).toHaveLength(kept.length + 1);
    }, 600_000);

    it("E1: confirmed erasure removes that owner's corrections only (also one whose claim was already gone)", async () => {
      const a = await corrected(db, E, ACC_E, "e1-a");
      const b = await corrected(db, E, ACC_E, "e1-b");
      await sql(db, "DELETE FROM public.expenses WHERE id = $1", [b]); // claim gone earlier; its correction stays until erasure
      const others = (await allAudits(db)).filter((r) => r["owner_id"] !== E);
      expect((await allAudits(db)).filter((r) => r["owner_id"] === E).map((r) => r["claim_id"]).sort()).toEqual([a, b].sort());
      await erase(db, E, stack);
      expect(await num(db, "SELECT count(*) FROM public.claim_receipt_corrections WHERE owner_id = $1", [E])).toBe(0);
      expect(await num(db, "SELECT count(*) FROM public.expenses WHERE employee_id = $1", [E])).toBe(0);
      expect(await allAudits(db)).toEqual(others);
      if (stack) expect(await num(db, "SELECT count(*) FROM phase3_p18.erasure_authority")).toBe(0);
    }, 600_000);

    it("E2: the demo cleanup removes an anonymous guest's corrections; the service role cannot remove anyone else's", async () => {
      await corrected(db, G, ACC_G, "e2-g");
      const others = (await allAudits(db)).filter((r) => r["owner_id"] !== G);
      const target = others.find((r) => r["owner_id"] === O)!;
      // not a demo guest: the service role (RLS bypassed, as on Supabase) and the operator are refused by the guard
      await expect(asRole(db, "service_role", "DELETE FROM public.claim_receipt_corrections WHERE owner_id = $1", [O])).rejects.toThrow(/P20_AUDIT_KEPT/);
      await expect(sql(db, "DELETE FROM public.claim_receipt_corrections WHERE id = $1", [target["id"]])).rejects.toThrow(/P20_AUDIT_KEPT/);
      expect(await allAudits(db)).toEqual(expect.arrayContaining(others));
      expect(DEMO_GUEST_STEPS.map((x) => x.table)).toContain("claim_receipt_corrections");
      expect(await demoCleanup(db, G)).toEqual({ ok: true });
      expect(await num(db, "SELECT count(*) FROM public.claim_receipt_corrections WHERE owner_id = $1", [G])).toBe(0);
      expect(await num(db, "SELECT count(*) FROM public.expenses WHERE employee_id = $1", [G])).toBe(0);
      expect(await allAudits(db)).toEqual(others);
    }, 600_000);

    it("E2 spoofing: an anonymous user without a demo session, or an upgraded account that still has one, is refused", async () => {
      await corrected(db, X, ACC_X, "spoof-x");
      await corrected(db, Y, ACC_Y, "spoof-y");
      const kept = await allAudits(db);
      for (const who of [X, Y]) {
        await expect(asRole(db, "service_role", "DELETE FROM public.claim_receipt_corrections WHERE owner_id = $1", [who])).rejects.toThrow(/P20_AUDIT_KEPT/);
        await expect(sql(db, "DELETE FROM public.claim_receipt_corrections WHERE owner_id = $1", [who])).rejects.toThrow(/P20_AUDIT_KEPT/);
        // the demo cleanup stops at the corrections step and reports it, so the route never deletes the identity
        const result = await demoCleanup(db, who);
        expect(result).toMatchObject({ ok: false, table: "claim_receipt_corrections" });
        expect(result.ok ? "" : result.error).toMatch(/P20_AUDIT_KEPT/);
      }
      expect(await allAudits(db)).toEqual(kept);
    }, 600_000);

    it.runIf(stack)("full stack: the erasure flag in a definer path or a superuser session never opens the guard (P18 authority only)", async () => {
      await corrected(db, O, ACC_O, "flag-guard");
      const kept = await allAudits(db);
      // a SECURITY DEFINER function deleting the caller's corrections, called by the signed-in owner with the flag set
      const definer = await outcome((async () => {
        await actAs(db, null); await db.exec("BEGIN");
        try {
          await db.exec("CREATE FUNCTION public.p20_test_purge() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $f$ DELETE FROM public.claim_receipt_corrections WHERE owner_id = auth.uid() $f$; GRANT EXECUTE ON FUNCTION public.p20_test_purge() TO authenticated");
          await db.query("SELECT set_config('test.uid', $1, true), set_config('ledgerline.erasing', 'on', true)", [O]);
          await db.exec("SET LOCAL ROLE authenticated");
          await db.query("SELECT public.p20_test_purge()");
        } finally { await db.exec("ROLLBACK"); await actAs(db, null); }
      })());
      expect(definer).toMatch(/P20_AUDIT_KEPT/);
      // a superuser session acting for the owner (auth.uid() set) with the flag set
      const superuser = await outcome((async () => {
        await actAs(db, null); await db.exec("BEGIN");
        try {
          await db.query("SELECT set_config('test.uid', $1, true), set_config('ledgerline.erasing', 'on', true)", [O]);
          await db.query("DELETE FROM public.claim_receipt_corrections WHERE owner_id = $1", [O]);
        } finally { await db.exec("ROLLBACK"); await actAs(db, null); }
      })());
      expect(superuser).toMatch(/P20_AUDIT_KEPT/);
      // the expenses follow-up in the same superuser context removes nothing
      const claim = kept.find((r) => r["operation_key"] === "correct_claim_receipt:flag-guard")!["claim_id"] as string;
      await actAs(db, null); await db.exec("BEGIN");
      try {
        await db.query("SELECT set_config('test.uid', $1, true), set_config('ledgerline.erasing', 'on', true)", [O]);
        await db.exec("SAVEPOINT del");
        await db.query("DELETE FROM public.expenses WHERE id = $1", [claim]).catch(() => db.exec("ROLLBACK TO SAVEPOINT del"));
        expect(await num(db, "SELECT count(*) FROM public.claim_receipt_corrections WHERE owner_id = $1", [O])).toBe(kept.filter((r) => r["owner_id"] === O).length);
      } finally { await db.exec("ROLLBACK"); await actAs(db, null); }
      expect(await allAudits(db)).toEqual(kept);
      // no installed function reads the setting with P18 in place (P18's own post-install check)
      expect(await sql(db, "SELECT p.oid::regprocedure::text f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'phase3_p18', 'phase3_p18_private') AND p.prosrc LIKE '%current_setting(''ledgerline.erasing''%'")).toEqual([]);
    }, 600_000);

    it("rollback retains the audit trail read-only (owner-readable, writable by no one); everything else is restored exactly", async () => {
      // corrections whose claims are deleted after the rollback (owner, team delegate, operator), and two owners whose
      // data is removed after it (F: confirmed erasure; G2: demo cleanup)
      const rbOwn = await corrected(db, O, ACC_O, "rb-own"), rbTeam = await corrected(db, O, ACC_O, "rb-team"), rbOp = await corrected(db, O, ACC_O, "rb-op");
      await corrected(db, F, ACC_F, "rb-f");
      await corrected(db, G2, ACC_G2, "rb-g2");
      const kept = await allAudits(db);
      const ownCount = (uid: string) => kept.filter((r) => r["owner_id"] === uid).length;
      expect(ownCount(O)).toBeGreaterThan(0);
      expect(ownCount(V)).toBeGreaterThan(0);

      await db.exec(readSql(P20_RB));
      afterRollback = await catalog(db);
      // nothing P20 added remains except the retained audit trail and its write refusal
      expect(before.filter((x) => !afterRollback.includes(x))).toEqual([]);
      expect(afterRollback.filter((x) => !before.includes(x)).map((x) => x.split("|").slice(0, 2).join("|")).every((n) => /claim_receipt_corrections|phase3_p20_retained|phase3_p20_audit|p20_claim_corrections_follow_erasure/.test(n))).toBe(true);
      expect(afterRollback.filter((x) => /^[fnt]\|/.test(x) && !before.includes(x)).map((x) => x.split("|").slice(0, 2).join("|")).sort()).toEqual([
        "f|phase3_p20_audit.demo_guest(_owner uuid)", "f|phase3_p20_audit.follow_erasure()", "f|phase3_p20_audit.guard()", "f|phase3_p20_audit.removal_allowed(_owner uuid)",
        "f|phase3_p20_audit.track_retained()", "n|phase3_p20_audit", "n|phase3_p20_retained",
        "t|claim_receipt_corrections.claim_receipt_corrections_guard", "t|claim_receipt_corrections.claim_receipt_corrections_no_truncate",
        "t|claim_receipt_corrections.claim_receipt_corrections_retained_record",
        "t|expenses.p20_claim_corrections_follow_erasure"]);
      expect(await num(db, "SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.claim_receipt_corrections'::regclass AND contype = 'f'")).toBe(0);
      const [rec] = await sql<{ rows: string; ok: boolean }>(db, "SELECT r.rows::text, r.table_oid = 'public.claim_receipt_corrections'::regclass::oid AND r.content_md5 = (SELECT md5(coalesce(string_agg(c::text, E'\\n' ORDER BY c.id), '')) FROM public.claim_receipt_corrections c) ok FROM phase3_p20_retained.rollback r");
      expect(rec).toEqual({ rows: String(kept.length), ok: true });
      expect(await num(db, "SELECT count(*) FROM pg_proc WHERE proname = 'correct_claim_receipt'")).toBe(0);
      expect(await num(db, "SELECT count(*) FROM pg_namespace WHERE nspname = 'phase3_p20'")).toBe(0);
      // every row is still there, unchanged, and the rollback is recorded
      expect(await allAudits(db)).toEqual(kept);
      expect((await sql<{ c: string }>(db, "SELECT obj_description('public.claim_receipt_corrections'::regclass, 'pg_class') c"))[0]!.c).toMatch(new RegExp(`P20 rolled back .*: ${kept.length} audit rows retained read-only`));
      // readable by their owner only
      expect((await as(db, O, "SELECT count(*)::int n FROM public.claim_receipt_corrections"))[0]!["n"]).toBe(ownCount(O));
      expect((await as(db, V, "SELECT count(*)::int n FROM public.claim_receipt_corrections"))[0]!["n"]).toBe(ownCount(V));
      expect((await as(db, V, "SELECT count(*)::int n FROM public.claim_receipt_corrections WHERE owner_id = $1", [O]))[0]!["n"]).toBe(0);
      await expect(asRole(db, "anon", "SELECT count(*) FROM public.claim_receipt_corrections")).rejects.toThrow(/permission denied/);
      // not writable by anyone: signed-in owners, the service role, or the table owner (DML; DDL is out of scope)
      const row = kept.find((r) => r["owner_id"] === O)!;
      const ins = ["INSERT INTO public.claim_receipt_corrections(owner_id, claim_id, receipt_id, before_amount, after_amount, before_status, after_status, receipt, reason, actor_id, operation_key) VALUES ($1,$2,'r',2,1,'p','p','{}','x',$1,'forged')", [O, row["claim_id"]]] as const;
      const upd = ["UPDATE public.claim_receipt_corrections SET reason = 'rewritten', after_amount = 0 WHERE id = $1", [row["id"]]] as const;
      const del = ["DELETE FROM public.claim_receipt_corrections WHERE id = $1", [row["id"]]] as const;
      for (const [q, p] of [ins, upd, del]) {
        await expect(as(db, O, q, [...p])).rejects.toThrow(/permission denied/);
        // service_role keeps DELETE for E2 only: the guard refuses a non-guest row (RLS bypassed, as on Supabase)
        await expect(asRole(db, "service_role", q, [...p])).rejects.toThrow(q === del[0] ? /retained audit history/ : /permission denied/);
        await expect(asRole(db, null, q, [...p])).rejects.toThrow(/retained audit history/);
      }
      await expect(as(db, O, "TRUNCATE public.claim_receipt_corrections")).rejects.toThrow(/permission denied/);
      await expect(asRole(db, "service_role", "TRUNCATE public.claim_receipt_corrections")).rejects.toThrow(/permission denied/);
      await expect(asRole(db, null, "TRUNCATE public.claim_receipt_corrections")).rejects.toThrow(/retained audit history/);
      expect(await allAudits(db)).toEqual(kept);
      // the workflow no longer offers the correction
      const j = await caseJ(db, 5000);
      await expect(rpc(db, O)("correct_claim_receipt", { operationId: "after-rb", id: j.visa, receiptId: j.visaReceipt, expectedAmount: 5000, newAmount: 0, reason: "dup" })).rejects.toThrow(/Unknown operation/);
      // deleting the claims (owner, team delegate, operator) leaves every retained row
      const ownDelete = await outcome(as(db, O, "DELETE FROM public.expenses WHERE id = $1", [rbOwn]));
      await outcome(as(db, M, "DELETE FROM public.expenses WHERE id = $1", [rbTeam]));
      await sql(db, "DELETE FROM public.expenses WHERE id = $1", [rbOp]);
      if (!stack) { expect(ownDelete).toBe(""); expect([await claimRows(db, rbOwn), await claimRows(db, rbTeam)]).toEqual([0, 0]); }
      expect(await claimRows(db, rbOp)).toBe(0);
      expect(await allAudits(db)).toEqual(kept);
      // confirmed erasure (F) and the demo cleanup (G2) remove exactly their own owner's rows
      await erase(db, F, stack);
      expect(await allAudits(db)).toEqual(kept.filter((r) => r["owner_id"] !== F));
      expect(await demoCleanup(db, G2)).toEqual({ ok: true });
      expect(await allAudits(db)).toEqual(kept.filter((r) => r["owner_id"] !== F && r["owner_id"] !== G2));
      // permitted E1/E2 deletes keep the rollback record describing the rows that remain
      const [now] = await sql<{ ok: boolean }>(db, "SELECT r.rows = (SELECT count(*) FROM public.claim_receipt_corrections) AND r.content_md5 = (SELECT md5(coalesce(string_agg(c::text, E'\\n' ORDER BY c.id), '')) FROM public.claim_receipt_corrections c) ok FROM phase3_p20_retained.rollback r");
      expect(now!.ok).toBe(true);
    }, 600_000);

    it("re-installing P20 after a rollback keeps every retained row and appends new corrections; a second rollback retains them all", async () => {
      const kept = await allAudits(db);
      await db.exec(readSql(P20));
      expect(await allAudits(db)).toEqual(kept);
      expect(await num(db, "SELECT count(*) FROM pg_namespace WHERE nspname = 'phase3_p20_retained'")).toBe(0);
      expect((await sql<{ t: string }>(db, "SELECT tgname t FROM pg_trigger WHERE tgrelid = 'public.claim_receipt_corrections'::regclass AND NOT tgisinternal ORDER BY 1")).map((r) => r.t))
        .toEqual(["claim_receipt_corrections_guard", "claim_receipt_corrections_no_truncate", "claim_receipt_corrections_retained_record"]);
      expect((await sql<{ c: string }>(db, "SELECT obj_description('public.claim_receipt_corrections'::regclass, 'pg_class') c"))[0]!.c).toMatch(/P20 rolled back .*; P20 re-installed .*: earlier rows kept/);
      const j = await caseJ(db, 3000);
      await submitReceiptCorrection(await load(db, j.visa), { receiptId: j.visaReceipt, newAmount: 2000, reason: "after re-install", operationId: "re-1" }, rpc(db, O), true);
      expect((await load(db, j.visa)).reimbursement?.receipts?.map((r) => r.amount)).toEqual([2000]);
      const now = await allAudits(db);
      expect(now.filter((r) => kept.every((k) => k["id"] !== r["id"])).map((r) => [r["claim_id"], r["before_amount"], r["after_amount"], r["operation_key"]]))
        .toEqual([[j.visa, "5000.00", "2000.00", "correct_claim_receipt:re-1"]]);
      expect(now.filter((r) => kept.some((k) => k["id"] === r["id"]))).toEqual(kept);
      // an operation corrected before the rollback, retried now, replays: no second change, no duplicate audit row
      const claimBefore = await load(db, idem!.claim);
      const auditBefore = await audits(db, idem!.claim);
      const replay = await submitReceiptCorrection(idem!.stale, idem!.c, rpc(db, O), true);
      expect((replay.result as { replayed?: boolean }).replayed).toBe(true);
      expect(await load(db, idem!.claim)).toEqual(claimBefore);
      expect(await audits(db, idem!.claim)).toEqual(auditBefore);
      expect(await num(db, "SELECT count(*) FROM public.claim_receipt_corrections WHERE operation_key = 'correct_claim_receipt:idem-1'")).toBe(1);
      // the installed rules are back: owner-read-only, client writes refused, the workflow writes
      await expect(as(db, O, "DELETE FROM public.claim_receipt_corrections")).rejects.toThrow(/permission denied/);
      expect((await as(db, V, "SELECT count(*)::int n FROM public.claim_receipt_corrections WHERE owner_id = $1", [O]))[0]!["n"]).toBe(0);
      await expect(db.exec(readSql(P20))).rejects.toThrow(/already installed/);
      await db.exec("ROLLBACK");
      // L1: the rollback accepts the guards only in the mode the retained record upkeep accepts ('O'), not ENABLE ALWAYS
      await db.exec("BEGIN");
      await db.exec("ALTER TABLE public.claim_receipt_corrections ENABLE ALWAYS TRIGGER claim_receipt_corrections_guard");
      await expect(db.exec(readSql(P20_RB))).rejects.toThrow(/guards are missing or disabled/);
      await db.exec("ROLLBACK");
      expect(await num(db, "SELECT count(*) FROM pg_namespace WHERE nspname = 'phase3_p20'")).toBe(1);
      // a second rollback retains old and new rows and leaves the same catalog as the first
      await db.exec(readSql(P20_RB));
      expect(await allAudits(db)).toEqual(now);
      expect(await catalog(db)).toEqual(afterRollback);
      // a retained table that lost part of its P20 shape, or is no longer the same table / owner, is never adopted
      const tampered: [string, RegExp][] = [
        [`DO $d$ BEGIN EXECUTE (SELECT format('ALTER TABLE public.claim_receipt_corrections DROP CONSTRAINT %I', conname) FROM pg_constraint
          WHERE conrelid = 'public.claim_receipt_corrections'::regclass AND pg_get_constraintdef(oid) LIKE '%after_amount < before_amount%'); END $d$`, /does not have the P20 audit shape/],
        ["ALTER TABLE public.claim_receipt_corrections DROP CONSTRAINT claim_receipt_corrections_owner_id_operation_key_key", /does not have the P20 audit shape/],
        ["ALTER TABLE public.claim_receipt_corrections ALTER COLUMN reason DROP NOT NULL", /does not have the P20 audit shape/],
        ["ALTER TABLE public.claim_receipt_corrections ALTER COLUMN before_amount TYPE numeric", /does not have the P20 audit shape/],
        ["ALTER TABLE public.claim_receipt_corrections ADD CONSTRAINT stray_fk FOREIGN KEY (claim_id) REFERENCES public.expenses(id) ON DELETE CASCADE NOT VALID", /does not have the P20 audit shape/],
        ["CREATE POLICY \"anyone writes\" ON public.claim_receipt_corrections FOR INSERT TO authenticated WITH CHECK (true)", /triggers or policies P20 did not create/],
        ["CREATE ROLE p20_stray; GRANT INSERT ON public.claim_receipt_corrections TO p20_stray", /unexpected privilege/],
        ["ALTER TABLE public.claim_receipt_corrections OWNER TO service_role", /not the audit trail the P20 rollback retained/],
        [`CREATE TABLE public.crc_copy (LIKE public.claim_receipt_corrections INCLUDING ALL); DROP TABLE public.claim_receipt_corrections; ALTER TABLE public.crc_copy RENAME TO claim_receipt_corrections`, /not the audit trail the P20 rollback retained/],
        ["DROP TABLE phase3_p20_retained.rollback; DROP SCHEMA phase3_p20_retained", /not an audit trail retained by a P20 rollback/],
        // retained rows changed around the guards (superuser with triggers disabled / replica mode) are never adopted
        ["ALTER TABLE public.claim_receipt_corrections DISABLE TRIGGER USER; UPDATE public.claim_receipt_corrections SET reason = 'rewritten', after_amount = 0 WHERE id = (SELECT id FROM public.claim_receipt_corrections ORDER BY id LIMIT 1); ALTER TABLE public.claim_receipt_corrections ENABLE TRIGGER USER", /retained audit rows changed since the P20 rollback/],
        ["ALTER TABLE public.claim_receipt_corrections DISABLE TRIGGER USER; DELETE FROM public.claim_receipt_corrections WHERE id = (SELECT id FROM public.claim_receipt_corrections ORDER BY id LIMIT 1); ALTER TABLE public.claim_receipt_corrections ENABLE TRIGGER USER", /retained audit rows changed since the P20 rollback/],
        ["ALTER TABLE public.claim_receipt_corrections DISABLE TRIGGER claim_receipt_corrections_guard; DELETE FROM public.claim_receipt_corrections WHERE id = (SELECT id FROM public.claim_receipt_corrections ORDER BY id LIMIT 1); ALTER TABLE public.claim_receipt_corrections ENABLE TRIGGER claim_receipt_corrections_guard", /retained audit rows changed since the P20 rollback/],
        ["SET LOCAL session_replication_role = replica; INSERT INTO public.claim_receipt_corrections(owner_id, claim_id, receipt_id, before_amount, after_amount, before_status, after_status, receipt, reason, actor_id, operation_key) SELECT owner_id, claim_id, receipt_id, 2, 1, 'p', 'p', '{}', 'forged', actor_id, 'forged' FROM public.claim_receipt_corrections ORDER BY id LIMIT 1; SET LOCAL session_replication_role = origin", /retained audit rows changed since the P20 rollback/],
      ];
      // M1: rows changed with the guards disabled, then a permitted E2 delete (guards enabled again) must not fold the
      // tampered row into a refreshed record: the record goes stale for good and the re-install refuses
      const launder = `ALTER TABLE public.claim_receipt_corrections DISABLE TRIGGER USER;
        UPDATE public.claim_receipt_corrections SET reason = 'rewritten' WHERE id = (SELECT id FROM public.claim_receipt_corrections ORDER BY id LIMIT 1);
        INSERT INTO public.claim_receipt_corrections(owner_id, claim_id, receipt_id, before_amount, after_amount, before_status, after_status, receipt, reason, actor_id, operation_key)
          SELECT '${G2}', claim_id, receipt_id, before_amount, after_amount, before_status, after_status, receipt, reason, '${G2}', 'launder' FROM public.claim_receipt_corrections ORDER BY id LIMIT 1;
        ALTER TABLE public.claim_receipt_corrections ENABLE TRIGGER USER;
        SET LOCAL ROLE service_role; DELETE FROM public.claim_receipt_corrections WHERE owner_id = '${G2}'; RESET ROLE;`;
      tampered.push([launder, /retained audit rows changed/]);
      await db.exec("BEGIN");
      await db.exec(launder);
      expect(await num(db, "SELECT count(*) FROM public.claim_receipt_corrections WHERE owner_id = $1", [G2])).toBe(0); // the E2 delete was permitted
      expect((await sql<{ m: string }>(db, "SELECT content_md5 m FROM phase3_p20_retained.rollback"))[0]!.m).toMatch(/^stale since /);
      // a later permitted delete never refreshes a stale record
      await db.exec("SET LOCAL ROLE service_role; DELETE FROM public.claim_receipt_corrections WHERE owner_id = '" + G2 + "'; RESET ROLE;");
      expect((await sql<{ m: string }>(db, "SELECT content_md5 m FROM phase3_p20_retained.rollback"))[0]!.m).toMatch(/^stale since /);
      await db.exec("ROLLBACK");
      for (const [ddl, re] of tampered) {
        await db.exec("BEGIN");
        await db.exec(ddl);
        await expect(db.exec(readSql(P20)), ddl).rejects.toThrow(re);
        await db.exec("ROLLBACK");
        expect(await num(db, "SELECT count(*) FROM pg_namespace WHERE nspname = 'phase3_p20'")).toBe(0);
      }
      expect(await allAudits(db)).toEqual(now);
    }, 600_000);
  });
}

// LOW 5: P20's erasure read follows the P18 rewrite pattern in both install orders, so P18's post-install check and the
// P0-038 setting-read inventory hold whether P18 comes after P20 or P20 is (re-)installed after P18.
const P18 = `${D}P18_erasure_authority.sql`, P18_RB = `${D}P18_erasure_authority.rollback.sql`;
/** P18's own post-install check: functions outside phase3_p18 that still read ledgerline.erasing. */
const readsErasing = async (db: PGlite) => (await sql<{ f: string }>(db, `SELECT p.oid::regprocedure::text f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'phase3_p18', 'phase3_p18_private') AND p.prosrc LIKE '%current_setting(''ledgerline.erasing''%'`)).map((r) => r.f);
/** The P0-038 inventory: no function trusts a retired client-settable exemption setting. */
const RETIRED = String.raw`current_setting\('(phase3_p11\.checked|phase3_p10\.writing|phase3_p13\.(applying|deciding)|phase3_p7\.(writer|reversal_insert|reason|request|meta)|phase3_p9\.(claiming|discarding)|phase3_p14\.writing|ledgerline\.(posting_writer|accounting_request|restoring))'`;
const readsRetired = async (db: PGlite) => (await sql<{ f: string }>(db, "SELECT p.oid::regprocedure::text f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND p.prosrc ~ $1", [RETIRED])).map((r) => r.f);
const removalSrc = async (db: PGlite) => (await sql<{ s: string }>(db, "SELECT prosrc s FROM pg_proc WHERE oid = 'phase3_p20_audit.removal_allowed(uuid)'::regprocedure"))[0]!.s;
const removalDef = async (db: PGlite) => (await sql<{ s: string }>(db, "SELECT pg_get_functiondef('phase3_p20_audit.removal_allowed(uuid)'::regprocedure) s"))[0]!.s;
/** The flag attack as the signed-in owner on the trail itself (any outcome) and whether the owner's rows survived. */
const flagAttackKeeps = async (db: PGlite, owner: string) => {
  const was = await num(db, "SELECT count(*) FROM public.claim_receipt_corrections WHERE owner_id = $1", [owner]);
  await actAs(db, null); await db.exec("BEGIN");
  let msg = "";
  try { await db.query("SELECT set_config('test.uid', $1, true), set_config('ledgerline.erasing', 'on', true)", [owner]); await db.query("DELETE FROM public.claim_receipt_corrections WHERE owner_id = $1", [owner]); }
  catch (e) { msg = (e as Error).message; } finally { await db.exec("ROLLBACK"); await actAs(db, null); }
  return { msg, kept: (await num(db, "SELECT count(*) FROM public.claim_receipt_corrections WHERE owner_id = $1", [owner])) === was };
};

describe("P20 and P18 in either order (SQL, isolated PGlite)", () => {
  afterAll(() => { vi.unstubAllGlobals(); });

  it("P18 installed after P20: P18's check passes, the read moves to the authority, P18's rollback restores it, E1 still works", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const db = await setup([P19]);
    try {
      await db.exec(readSql(P20));
      const pre18 = await removalDef(db);
      expect(await readsErasing(db)).toContain("phase3_p20_audit.removal_allowed(uuid)"); // before P18, as the applied guards
      await corrected(db, E, ACC_E, "o18-e");
      await db.exec(readSql(P18)); // P18's own post-install check runs here
      expect(await readsErasing(db)).toEqual([]);
      expect(await readsRetired(db)).toEqual([]);
      expect(await removalSrc(db)).toContain("phase3_p18.erasure_authorised()");
      expect(await flagAttackKeeps(db, E)).toEqual({ msg: expect.stringMatching(/P20_AUDIT_KEPT/), kept: true });
      // P20 rolled back and re-installed after P18: still no setting read
      await db.exec(readSql(P20_RB));
      await db.exec(readSql(P20));
      expect(await readsErasing(db)).toEqual([]);
      expect(await readsRetired(db)).toEqual([]);
      // P18's rollback gives back exactly the pre-P18 read; re-installing P18 moves it again
      await db.exec(readSql(P18_RB));
      expect(await removalDef(db)).toBe(pre18);
      await db.exec(readSql(P18));
      expect(await readsErasing(db)).toEqual([]);
      // E1 through the P18 authority removes the owner's corrections
      await erase(db, E, false);
      expect(await num(db, "SELECT count(*) FROM public.claim_receipt_corrections WHERE owner_id = $1", [E])).toBe(0);
    } finally { await db.close(); }
  }, 600_000);

  it("P20 installed and re-installed after P18 (stack): no function reads the setting; P18's rollback restores the pre-P18 read", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const db = await setup([...STACK.map((n) => `${D}${n}.sql`), P19]);
    try {
      await db.exec(readSql(P20));
      expect(await readsErasing(db)).toEqual([]);
      expect(await readsRetired(db)).toEqual([]);
      expect(await removalSrc(db)).toContain("phase3_p18.erasure_authorised()");
      await corrected(db, O, ACC_O, "o20-o");
      expect(await flagAttackKeeps(db, O)).toEqual({ msg: expect.stringMatching(/P20_AUDIT_KEPT/), kept: true });
      await db.exec(readSql(P20_RB));
      expect(await readsErasing(db)).toEqual([]);
      await db.exec(readSql(P20));
      expect(await readsErasing(db)).toEqual([]);
      expect(await readsRetired(db)).toEqual([]);
      expect(await flagAttackKeeps(db, O)).toEqual({ msg: expect.stringMatching(/P20_AUDIT_KEPT/), kept: true });
      // P18 rolled back: the saved original (the pre-P18 setting read) comes back, as for every P18-rewritten guard
      await db.exec(readSql(P18_RB));
      expect(await readsErasing(db)).toContain("phase3_p20_audit.removal_allowed(uuid)");
      expect(await removalSrc(db)).not.toContain("phase3_p18");
      await db.exec(readSql(P18)); // and P18's post-install check passes again
      expect(await readsErasing(db)).toEqual([]);
    } finally { await db.close(); }
  }, 600_000);
});

// Release gate (review of 6394ac8): the retained record's md5 is over each row's text, and timestamptz text follows the
// session's TimeZone/DateStyle. Every hash (rollback, track_retained, re-install adoption) pins the same settings, so a
// rollback run by an admin in another time zone never makes a later permitted E1/E2 delete look like tampering; and the
// rollback/adoption lock the trail so no delete can commit between their hash and their commit.
describe("P20 retained record ignores session settings; rollback locks the trail (SQL, isolated PGlite)", () => {
  afterAll(() => { vi.unstubAllGlobals(); });
  const KOLKATA = "SET TimeZone = 'Asia/Kolkata'; SET DateStyle = 'SQL, DMY'; SET IntervalStyle = 'sql_standard'";
  const RESET = "RESET TimeZone; RESET DateStyle; RESET IntervalStyle";
  const record = async (db: PGlite) => (await sql<{ m: string; ok: boolean }>(db, `SELECT r.content_md5 m, r.rows = (SELECT count(*) FROM public.claim_receipt_corrections) ok FROM phase3_p20_retained.rollback r`))[0]!;
  const withoutCommit = (s: string) => { const i = s.lastIndexOf("COMMIT;"); expect(i).toBeGreaterThan(0); return s.slice(0, i); };
  const holdsShareRowExclusive = (db: PGlite) => num(db, "SELECT count(*) FROM pg_locks WHERE relation = 'public.claim_receipt_corrections'::regclass AND mode = 'ShareRowExclusiveLock' AND granted AND pid = pg_backend_pid()");

  it("rollback in Asia/Kolkata + 'SQL, DMY': later E2 and E1 deletes keep the record fresh, re-install is accepted; tampering is still refused", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const db = await setup([P19]);
    try {
      await db.exec(readSql(P20));
      await corrected(db, O, ACC_O, "tz-o");
      await corrected(db, G, ACC_G, "tz-g");
      await corrected(db, E, ACC_E, "tz-e");
      await actAs(db, null);
      await db.exec(KOLKATA);
      expect((await sql<{ t: string }>(db, "SELECT now()::text t"))[0]!.t).toMatch(/\+05:30|IST/);
      await db.exec(readSql(P20_RB));
      await db.exec(RESET);
      expect((await record(db)).m).not.toMatch(/^stale/);
      // E2 (demo cleanup, service role, default session) keeps the record fresh
      expect(await demoCleanup(db, G)).toEqual({ ok: true });
      expect(await record(db)).toEqual({ m: expect.not.stringMatching(/^stale/), ok: true });
      // E1 (owner erasure) in another non-UTC session also keeps it fresh
      await db.exec("SET TimeZone = 'America/St_Johns'; SET DateStyle = 'German'");
      await erase(db, E, false);
      await db.exec(RESET);
      expect(await num(db, "SELECT count(*) FROM public.claim_receipt_corrections WHERE owner_id = $1", [E])).toBe(0);
      expect(await record(db)).toEqual({ m: expect.not.stringMatching(/^stale/), ok: true });
      // the re-install, run in yet another session setting, adopts the retained rows
      const kept = await allAudits(db);
      await db.exec(KOLKATA);
      await db.exec(readSql(P20));
      await db.exec(RESET);
      expect(await allAudits(db)).toEqual(kept);
      // a second rollback in Kolkata, then rows changed around the guards: the re-install still refuses
      await db.exec(KOLKATA);
      await db.exec(readSql(P20_RB));
      await db.exec(RESET);
      await db.exec("BEGIN");
      await db.exec("ALTER TABLE public.claim_receipt_corrections DISABLE TRIGGER USER; UPDATE public.claim_receipt_corrections SET reason = 'rewritten'; ALTER TABLE public.claim_receipt_corrections ENABLE TRIGGER USER");
      await expect(db.exec(readSql(P20))).rejects.toThrow(/retained audit rows changed since the P20 rollback/);
      await db.exec("ROLLBACK");
      // tampering, then a permitted delete in a Kolkata session: stale for good, re-install refuses
      await db.exec("BEGIN");
      await db.exec(`ALTER TABLE public.claim_receipt_corrections DISABLE TRIGGER USER; UPDATE public.claim_receipt_corrections SET reason = 'rewritten';
        ALTER TABLE public.claim_receipt_corrections ENABLE TRIGGER USER; ${KOLKATA.replace(/SET /g, "SET LOCAL ")};
        SET LOCAL ROLE service_role; DELETE FROM public.claim_receipt_corrections WHERE owner_id = '${G2}'; RESET ROLE`);
      expect((await record(db)).m).toMatch(/^stale since /);
      await expect(db.exec(readSql(P20))).rejects.toThrow(/retained audit rows changed since the P20 rollback/);
      await db.exec("ROLLBACK");
      await db.exec(RESET);
      // untampered, the retained trail is still adoptable
      await db.exec(readSql(P20));
      expect(await allAudits(db)).toEqual(kept);
    } finally { await db.close(); }
  }, 600_000);

  it("the rollback and the re-install adoption hold SHARE ROW EXCLUSIVE on the trail from before their first hash to commit", async () => {
    const rb = readSql(P20_RB), inst = readSql(P20);
    const lock = "LOCK TABLE public.claim_receipt_corrections IN SHARE ROW EXCLUSIVE MODE";
    const body = rb.slice(rb.indexOf("BEGIN;"));
    expect(body.indexOf(lock)).toBeGreaterThan(0);
    expect(body.indexOf(lock)).toBeLessThan(body.indexOf("md5("));
    const ib = inst.slice(inst.indexOf("BEGIN;"));
    expect(ib.indexOf(lock)).toBeGreaterThan(0);
    expect(ib.indexOf(lock)).toBeLessThan(ib.indexOf("string_agg(c::text"));
    vi.stubGlobal("navigator", { onLine: true });
    const db = await setup([P19]);
    try {
      await db.exec(readSql(P20));
      await corrected(db, O, ACC_O, "lk-o");
      await actAs(db, null);
      await db.exec(withoutCommit(rb));
      expect(await holdsShareRowExclusive(db)).toBe(1);
      await db.exec("COMMIT");
      expect((await record(db)).m).not.toMatch(/^stale/);
      await db.exec(withoutCommit(inst));
      expect(await holdsShareRowExclusive(db)).toBe(1);
      await db.exec("COMMIT");
      expect(await num(db, "SELECT count(*) FROM pg_namespace WHERE nspname = 'phase3_p20_retained'")).toBe(0);
    } finally { await db.close(); }
  }, 600_000);

  // The install's later DROP/CREATE TRIGGER take the same lock, so "held at commit" alone proves nothing: a probe placed
  // immediately before the adoption count/md5 compare must already see this backend holding SHARE ROW EXCLUSIVE.
  it("the re-install holds SHARE ROW EXCLUSIVE on the trail at the adoption count/md5 compare (probe), not only from later DDL", async () => {
    const inst = readSql(P20), rb = readSql(P20_RB);
    const lock = "LOCK TABLE public.claim_receipt_corrections IN SHARE ROW EXCLUSIVE MODE;";
    const compare = "IF (SELECT count(*) FROM public.claim_receipt_corrections) IS DISTINCT FROM r.rows";
    expect(inst.split(compare).length).toBe(2);
    expect(inst.split(lock).length).toBe(2);
    const probe = `IF NOT EXISTS (SELECT 1 FROM pg_locks WHERE relation = 'public.claim_receipt_corrections'::regclass AND mode = 'ShareRowExclusiveLock'
        AND granted AND pid = pg_backend_pid()) THEN RAISE EXCEPTION 'probe: trail not locked at the adoption compare'; END IF;
    `;
    const probed = inst.replace(compare, probe + compare);
    const preOnly = (s: string) => { const i = s.indexOf("END $pre$;"); expect(i).toBeGreaterThan(0); return s.slice(0, i + "END $pre$;".length); };
    vi.stubGlobal("navigator", { onLine: true });
    const db = await setup([P19]);
    try {
      await db.exec(readSql(P20));
      await corrected(db, O, ACC_O, "pr-o");
      await actAs(db, null);
      await db.exec(rb);
      // control: without the explicit LOCK the probe fires (nothing earlier in the install locks the trail)
      await expect(db.exec(preOnly(probed.replace(lock, "")))).rejects.toThrow(/probe: trail not locked at the adoption compare/);
      await db.exec("ROLLBACK");
      // as staged: the lock is already held at the compare, and the probed install completes and adopts the trail
      const kept = await allAudits(db);
      await db.exec(probed);
      expect(await allAudits(db)).toEqual(kept);
      expect(await num(db, "SELECT count(*) FROM pg_namespace WHERE nspname = 'phase3_p20_retained'")).toBe(0);
    } finally { await db.close(); }
  }, 600_000);

  it("the rollback refuses a guard disabled after its precheck but before its lock (re-checked under the lock)", async () => {
    const rb = readSql(P20_RB);
    const lockAt = rb.indexOf("LOCK TABLE public.claim_receipt_corrections IN SHARE ROW EXCLUSIVE MODE;");
    const preEnd = rb.indexOf("END $pre$;") + "END $pre$;".length;
    expect(preEnd).toBeGreaterThan(10);
    expect(lockAt).toBeGreaterThan(preEnd);
    vi.stubGlobal("navigator", { onLine: true });
    const db = await setup([P19]);
    try {
      await db.exec(readSql(P20));
      await corrected(db, O, ACC_O, "gd-o");
      await actAs(db, null);
      const before = await catalog(db);
      for (const trigger of ["claim_receipt_corrections_guard", "claim_receipt_corrections_no_truncate"]) {
        await db.exec(rb.slice(0, preEnd)); // BEGIN + precheck passes (guards enabled)
        await db.exec(`ALTER TABLE public.claim_receipt_corrections DISABLE TRIGGER ${trigger}`);
        await expect(db.exec(rb.slice(preEnd))).rejects.toThrow(/guards were disabled or changed after the precheck/);
        await db.exec("ROLLBACK");
        expect(await catalog(db)).toEqual(before);
        expect(await num(db, "SELECT count(*) FROM pg_namespace WHERE nspname = 'phase3_p20_retained'")).toBe(0);
      }
      // guards untouched: the split rollback completes
      await db.exec(rb.slice(0, preEnd));
      await db.exec(rb.slice(preEnd));
      expect((await record(db)).m).not.toMatch(/^stale/);
    } finally { await db.close(); }
  }, 600_000);
});
