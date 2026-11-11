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
import type { Expense, ReimbursementStatus } from "./expenses";

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const O = u(1), V = u(2);
const ACC_O = u(101), ACC_V = u(201);
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
  await addUsers(db, { [O]: "o@x.in", [V]: "v@x.in" });
  await sql(db, "INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1,'{}'),($2,'{}') ON CONFLICT (owner_id) DO NOTHING", [O, V]);
  await sql(db, "INSERT INTO public.accounts(id, owner_id, name, kind, opening_balance, archived) VALUES ($1,$2,'HDFC savings','savings',50000,false), ($3,$4,'V savings','savings',1000,false)", [ACC_O, O, ACC_V, V]);
  return db;
}

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

for (const [label, extra] of [["applied schema + P19", [P19]], ["proposed stack P1..P19", [...STACK.map((n) => `${D}${n}.sql`), P19]]] as const) {
  describe(`P20 claim receipt correction — ${label} (SQL, isolated PGlite)`, () => {
    let db: PGlite;
    let before: string[];
    let afterRollback: string[];
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

    it("rollback retains the audit trail read-only (owner-readable, writable by no one); everything else is restored exactly", async () => {
      // one more correction whose claim is erased after the rollback (the documented erasure cascade)
      const je = await caseJ(db, 5000);
      await submitReceiptCorrection(await load(db, je.visa), { receiptId: je.visaReceipt, newAmount: 0, reason: "dup before erasure", operationId: "rb-erase" }, rpc(db, O), true);
      const kept = await allAudits(db);
      const ownCount = (uid: string) => kept.filter((r) => r["owner_id"] === uid).length;
      expect(ownCount(O)).toBeGreaterThan(0);
      expect(ownCount(V)).toBeGreaterThan(0);

      await db.exec(readSql(P20_RB));
      afterRollback = await catalog(db);
      // nothing P20 added remains except the retained audit trail and its write refusal
      expect(before.filter((x) => !afterRollback.includes(x))).toEqual([]);
      expect(afterRollback.filter((x) => !before.includes(x)).map((x) => x.split("|").slice(0, 2).join("|")).every((n) => /claim_receipt_corrections|phase3_p20_retained/.test(n))).toBe(true);
      expect(afterRollback.filter((x) => /^[fnt]\|/.test(x) && !before.includes(x)).map((x) => x.split("|").slice(0, 2).join("|")).sort()).toEqual([
        "f|phase3_p20_retained.refuse_write()", "n|phase3_p20_retained",
        "t|claim_receipt_corrections.claim_receipt_corrections_retained", "t|claim_receipt_corrections.claim_receipt_corrections_retained_truncate"]);
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
      // not writable by anyone: signed-in owners, the service role, or the table owner
      const row = kept.find((r) => r["owner_id"] === O)!;
      const ins = ["INSERT INTO public.claim_receipt_corrections(owner_id, claim_id, receipt_id, before_amount, after_amount, before_status, after_status, receipt, reason, actor_id, operation_key) VALUES ($1,$2,'r',2,1,'p','p','{}','x',$1,'forged')", [O, row["claim_id"]]] as const;
      const upd = ["UPDATE public.claim_receipt_corrections SET reason = 'rewritten', after_amount = 0 WHERE id = $1", [row["id"]]] as const;
      const del = ["DELETE FROM public.claim_receipt_corrections WHERE id = $1", [row["id"]]] as const;
      for (const [q, p] of [ins, upd, del]) {
        await expect(as(db, O, q, [...p])).rejects.toThrow(/permission denied/);
        await expect(asRole(db, "service_role", q, [...p])).rejects.toThrow(/permission denied/);
        await expect(asRole(db, null, q, [...p])).rejects.toThrow(/retained audit history/);
      }
      await expect(as(db, O, "TRUNCATE public.claim_receipt_corrections")).rejects.toThrow(/permission denied/);
      await expect(asRole(db, "service_role", "TRUNCATE public.claim_receipt_corrections")).rejects.toThrow(/permission denied/);
      await expect(asRole(db, null, "TRUNCATE public.claim_receipt_corrections")).rejects.toThrow(/retained audit history/);
      expect(await allAudits(db)).toEqual(kept);
      // the workflow no longer offers the correction
      const j = await caseJ(db, 5000);
      await expect(rpc(db, O)("correct_claim_receipt", { operationId: "after-rb", id: j.visa, receiptId: j.visaReceipt, expectedAmount: 5000, newAmount: 0, reason: "dup" })).rejects.toThrow(/Unknown operation/);
      // erasing a claim still removes its own audit rows (ON DELETE CASCADE); nothing else goes
      await sql(db, "DELETE FROM public.expenses WHERE id = $1", [je.visa]);
      expect(await allAudits(db)).toEqual(kept.filter((r) => r["claim_id"] !== je.visa));
      expect(kept.some((r) => r["claim_id"] === je.visa)).toBe(true);
    }, 600_000);

    it("re-installing P20 after a rollback keeps every retained row and appends new corrections; a second rollback retains them all", async () => {
      const kept = await allAudits(db);
      await db.exec(readSql(P20));
      expect(await allAudits(db)).toEqual(kept);
      expect(await num(db, "SELECT count(*) FROM pg_namespace WHERE nspname = 'phase3_p20_retained'")).toBe(0);
      expect(await num(db, "SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.claim_receipt_corrections'::regclass AND NOT tgisinternal")).toBe(0);
      expect((await sql<{ c: string }>(db, "SELECT obj_description('public.claim_receipt_corrections'::regclass, 'pg_class') c"))[0]!.c).toMatch(/P20 rolled back .*; P20 re-installed .*: earlier rows kept/);
      const j = await caseJ(db, 3000);
      await submitReceiptCorrection(await load(db, j.visa), { receiptId: j.visaReceipt, newAmount: 2000, reason: "after re-install", operationId: "re-1" }, rpc(db, O), true);
      expect((await load(db, j.visa)).reimbursement?.receipts?.map((r) => r.amount)).toEqual([2000]);
      const now = await allAudits(db);
      expect(now.filter((r) => kept.every((k) => k["id"] !== r["id"])).map((r) => [r["claim_id"], r["before_amount"], r["after_amount"], r["operation_key"]]))
        .toEqual([[j.visa, "5000.00", "2000.00", "correct_claim_receipt:re-1"]]);
      expect(now.filter((r) => kept.some((k) => k["id"] === r["id"]))).toEqual(kept);
      // an operation corrected before the rollback still replays (no second change, no duplicate audit row)
      expect(await num(db, "SELECT count(*) FROM public.claim_receipt_corrections WHERE operation_key = 'correct_claim_receipt:idem-1'")).toBe(1);
      // the installed rules are back: owner-read-only, client writes refused, the workflow writes
      await expect(as(db, O, "DELETE FROM public.claim_receipt_corrections")).rejects.toThrow(/permission denied/);
      expect((await as(db, V, "SELECT count(*)::int n FROM public.claim_receipt_corrections WHERE owner_id = $1", [O]))[0]!["n"]).toBe(0);
      await expect(db.exec(readSql(P20))).rejects.toThrow(/already installed/);
      await db.exec("ROLLBACK");
      // a second rollback retains old and new rows and leaves the same catalog as the first
      await db.exec(readSql(P20_RB));
      expect(await allAudits(db)).toEqual(now);
      expect(await catalog(db)).toEqual(afterRollback);
      // a stray table of the same name is never adopted as P20's audit trail
      await sql(db, "DROP SCHEMA phase3_p20_retained CASCADE");
      await expect(db.exec(readSql(P20))).rejects.toThrow(/not an audit trail retained by a P20 rollback/);
      await db.exec("ROLLBACK");
    }, 600_000);
  });
}
