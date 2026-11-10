// @vitest-environment node
// Phase 3 completion: database acceptance tests for KK's binding decisions of 10 Nov 2026 on the PROPOSED
// P7 revision 2 (.lovable/staged-sql/proposed/P7_balanced_posting.sql):
//   1. reversals keep the original and add a linked balanced reversal (journal AND working ledger);
//   2. corrections are dated on the correction date in an open period; prior-period adjustments are a
//      separate approved workflow that never changes closed-period figures;
//   3. personal-only closed periods are enforced by the legacy guard and the posting guard alike;
//   4. merchant refunds, employee reimbursements, insurance recoveries, inter-party settlements and
//      advances post differently; gross expenses are preserved; nothing is recognised twice;
//   5. posting is owner-only behind one permission check with a reserved, default-off delegation;
// and the remaining items: Statement Desk Undo by per-entry reversal (1), linked-record states (2),
// one idempotent card-payment action (3, P0-005b), the approval queue (5), period closing (7) and
// preservation of every pre-existing row around each operation (8).
// Isolated in-memory PGlite: drizzle/migrations 0000-0088 + P1 + P2 + P4 + P5 + P7. Never Cloud.
import { describe, it, expect, beforeAll } from "vitest";
import { actAs } from "../test/full-schema-pglite";
import {
  ACC, C1, C2, INSERT_EXPENSE, MCP, T, U, activate, as, attempt, e, entityId, errorText, exParams, first, id, journalTb, personalKey, q, seededDb,
  setClosedPeriods, stepUp, type Db, type Ex,
} from "../test/phase3-fixture";

const PERSONAL = personalKey(U.O);
const count = async (db: Db, sql: string, p: unknown[] = []) => first(await q<{ n: number }>(db, `SELECT count(*)::int n FROM (${sql}) x`, p)).n;
const today = async (db: Db) => first(await q<{ d: string }>(db, "SELECT current_date::text d")).d;

/** md5 of every expenses row (pre-existing columns) and of every other listed table, for preservation proofs (item 8). */
async function rowState(db: Db, tables = ["public.accounts", "public.documents", "public.opening_postings", "public.legal_entities", "public.import_posts", "public.expense_drafts", "public.category_batches", "public.loans"]) {
  await actAs(db, null);
  const rows = Object.fromEntries((await q<{ id: string; h: string }>(db, "SELECT id::text, md5(to_jsonb(x)::text) h FROM public.expenses x")).map((r) => [r.id, r.h]));
  const other: Record<string, string> = {};
  for (const t of tables) other[t] = first(await q<{ h: string }>(db, `SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY to_jsonb(x)::text), '')) h FROM ${t} x`)).h;
  return { rows, other };
}
/** Every row that existed before is byte-identical afterwards, except the listed ids; returns the new ids. */
function expectPreserved(before: Awaited<ReturnType<typeof rowState>>, after: Awaited<ReturnType<typeof rowState>>, changedIds: string[] = [], changedTables: string[] = []) {
  const changed = Object.keys(before.rows).filter((k) => before.rows[k] !== after.rows[k]).sort();
  expect(changed).toEqual([...changedIds].sort());
  expect(Object.keys(before.rows).filter((k) => !(k in after.rows))).toEqual([]); // nothing deleted
  for (const [t, h] of Object.entries(before.other)) if (!changedTables.includes(t)) expect([t, after.other[t]]).toEqual([t, h]);
  return Object.keys(after.rows).filter((k) => !(k in before.rows));
}
const reverse = (db: Db, req: string, entry: string, reason = "Correction approved by owner", on: string | null = null) =>
  q<{ r: Record<string, unknown> }>(db, "SELECT public.reverse_ledger_entry($1,$2,$3,$4::date) r", [req, entry, reason, on]);
const tbOf = async (db: Db, key: string) => (await journalTb(db, U.O))[key] ?? {};

describe("Phase 3 completion (P7 r2): KK decisions 1-5 and remaining items", () => {
  let db: Db;
  let ent: { c1: string; c2: string; personal: string };
  beforeAll(async () => {
    db = await seededDb();
    ent = { c1: await entityId(db, U.O, C1), c2: await entityId(db, U.O, C2), personal: await entityId(db, U.O, PERSONAL) };
    await activate(db, U.O);
    await activate(db, U.V);
  }, T);

  // ---------------------------------------------------------------------------------------------
  describe("decision 1: the original stays; a separate linked balanced reversal is recorded", () => {
    it("reversal keeps the original row byte-identical, adds a linked reversal row and mirrored batches; replay is idempotent", async () => {
      const before = await rowState(db);
      const tb0 = await tbOf(db, C1);
      const out = first(await as(db, U.O, async () => { await stepUp(db, U.O); return reverse(db, id(7001), e(17), "Audit fee booked to the wrong year", "2026-07-15"); })).r;
      const after = await rowState(db);
      const added = expectPreserved(before, after);
      expect(added).toEqual([out["reversalEntryId"]]); // exactly one new working-ledger row
      const rv = first(await q<Record<string, unknown>>(db, "SELECT reverses_entry_id::text o, expense_date::text d, amount::text a, txn_type t, account_id::text acc, category c, legal_entity_id::text le FROM public.expenses WHERE id = $1", [out["reversalEntryId"]]));
      expect(rv).toEqual({ o: e(17), d: "2026-07-15", a: "7500.00", t: "expense", acc: ACC.B1, c: "Audit fees", le: ent.c2 });
      // journal: original batch (June) + reversal batch (July), both kept
      const bs = await q<{ kind: string; d: string; rev: boolean }>(db, `SELECT b.kind, b.posting_date::text d, b.reverses_id IS NOT NULL rev FROM public.posting_batches b JOIN public.posting_events ev ON ev.id = b.event_id
        WHERE ev.event_key = 'ledger_entry:' || $1 ORDER BY b.posting_date`, [e(17)]);
      expect(bs).toEqual([{ kind: "entry", d: "2026-06-01", rev: false }, { kind: "reversal", d: "2026-07-15", rev: true }]);
      expect((await tbOf(db, C2))["expense:Audit fees"]).toBeUndefined(); // nets to zero cumulatively
      expect(await tbOf(db, C1)).toEqual(tb0);
      // per period: June keeps the original, July has the reversal (no closed-period figure changes)
      const byMonth = await q<{ m: string; s: string }>(db, `SELECT to_char(b.posting_date,'YYYY-MM') m, sum(l.signed_amount)::text s FROM public.posting_lines l JOIN public.posting_batches b ON b.id = l.batch_id
        WHERE b.owner_id = $1 AND l.code = 'expense:Audit fees' GROUP BY 1 ORDER BY 1`, [U.O]);
      expect(byMonth).toEqual([{ m: "2026-06", s: "7500.00" }, { m: "2026-07", s: "-7500.00" }]);
      // idempotent replay by request id; a second, different request is refused
      const replay = first(await as(db, U.O, async () => { await stepUp(db, U.O); return reverse(db, id(7001), e(17), "Audit fee booked to the wrong year", "2026-07-15"); })).r;
      expect(replay).toMatchObject({ replayed: true, reversalEntryId: out["reversalEntryId"], correctionDate: "2026-07-15" });
      expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return reverse(db, id(7002), e(17)); }))).toMatch(/^P7_ALREADY_REVERSED/);
      expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return reverse(db, id(7003), String(out["reversalEntryId"])); }))).toMatch(/^P7_REVERSAL_ROW/);
      expectPreserved(after, await rowState(db));
    });

    it("refuses unposted entries, future or earlier correction dates, client-made reversal rows and edits of history", async () => {
      expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return reverse(db, id(7010), e(20)); }))).toMatch(/^P7_NOT_POSTED/);
      expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return reverse(db, id(7011), e(18), "Interest double counted", "2026-05-01"); }))).toMatch(/^P7_CORRECTION_DATE: the correction date cannot be before/);
      expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return reverse(db, id(7012), e(18), "Interest double counted", "2099-01-01"); }))).toMatch(/cannot be in the future/);
      const forged: Ex = { id: id(7013), acc: ACC.B1, date: "2026-07-20", amount: 12345.67, type: "income", category: "Interest" };
      const insertForged = async () => { await q(db, INSERT_EXPENSE, exParams(forged)); return q(db, "UPDATE public.expenses SET reverses_entry_id = $1 WHERE id = $2", [e(18), id(7013)]); };
      expect(errorText(await attempt(db, U.O, insertForged))).toMatch(/^P7_REVERSAL_LINK/);
      const direct = await attempt(db, U.O, () => q(db, `INSERT INTO public.expenses SELECT (jsonb_populate_record(NULL::public.expenses, to_jsonb(x) || jsonb_build_object('id', $2::uuid, 'reverses_entry_id', x.id, 'expense_date', '2026-07-20', 'receipt_details', jsonb_build_object('reversal', jsonb_build_object('of', x.id))))).* FROM public.expenses x WHERE x.id = $1`, [e(18), id(7014)]));
      expect(errorText(direct)).toMatch(/^P7_REVERSAL_ONLY_BY_FUNCTION/);
      // the readable copy of the link cannot be forged onto an ordinary entry (narrow readers trust it)
      expect(errorText(await attempt(db, U.O, () => q(db, INSERT_EXPENSE, exParams({ ...forged, id: id(7019), details: { reversal: { of: e(18) } } }))))).toMatch(/^P7_REVERSAL_LINK/);
      expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return reverse(db, id(7015), e(18), "no"); }))).toMatch(/reason of at least five/);
      expect(errorText(await attempt(db, U.O, () => reverse(db, id(7016), e(18))))).toBe("STEP_UP_REQUIRED: reverse_ledger_entry");
      expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return reverse(db, id(7017), e(18)); }, { clientId: MCP }))).toBe("STEP_UP_REQUIRED: reverse_ledger_entry");
      expect(errorText(await attempt(db, U.G, async () => { await stepUp(db, U.G); return reverse(db, id(7018), e(18)); }, { anon: true }))).toMatch(/P7_GUEST|STEP_UP/);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe("decision 2: correction date in an open period; prior-period adjustments are separate", () => {
    it("a closed company period is never reopened: the reversal posts on the open correction date; inside the closed period it is refused", async () => {
      await setClosedPeriods(db, U.O, [{ id: "c1-apr", from: "2026-04-01", to: "2026-04-30", entityId: C1 }]);
      try {
        const aprilC1 = () => q<{ s: string }>(db, `SELECT md5(coalesce(string_agg(l.id::text || l.signed_amount::text, ',' ORDER BY l.id), '')) s FROM public.posting_lines l JOIN public.posting_batches b ON b.id = l.batch_id
          WHERE b.legal_entity_id = $1 AND b.posting_date BETWEEN '2026-04-01' AND '2026-04-30'`, [ent.c1]);
        const a0 = first(await aprilC1()).s;
        expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return reverse(db, id(7101), e(3), "Rent belongs to another company", "2026-04-30"); }))).toMatch(/^P7_CLOSED_PERIOD/);
        const out = first(await as(db, U.O, async () => { await stepUp(db, U.O); return reverse(db, id(7102), e(3), "Rent belongs to another company"); })).r;
        expect(out["correctionDate"]).toBe(await today(db));
        expect(first(await aprilC1()).s).toBe(a0); // April figures unchanged, no reopening
        const prefs = first(await q<{ p: unknown[] }>(db, "SELECT data->'books'->'closedPeriods' p FROM public.finance_preferences WHERE owner_id = $1", [U.O])).p;
        expect(prefs).toEqual([{ id: "c1-apr", from: "2026-04-01", to: "2026-04-30", entityId: C1 }]); // still closed
      } finally { await setClosedPeriods(db, U.O, []); }
    });

    it("prior-period adjustment: explicit closed target, step-up approval, posted in the open period, reported next to unchanged closed figures", async () => {
      await setClosedPeriods(db, U.O, [{ id: "c2-jun", from: "2026-06-01", to: "2026-06-30", entityId: C2 }]);
      try {
        const lines = [{ code: "expense:Interest correction", role: "expense", debit: 0, credit: 345.67 }, { code: "income:Interest", role: "income", debit: 345.67, credit: 0 }];
        const payload = { entityId: ent.c2, periodId: "c2-jun", correctionDate: "2026-07-31", lines, memo: "FD interest over-recorded in June", sources: [] };
        const report0 = first(await as(db, U.O, () => q<{ r: { periods: { periodId: string; entityKey: string; asClosed: Record<string, number> }[] } }>(db, "SELECT public.prior_period_adjustment_report() r"))).r;
        const juneBefore = report0.periods.find((p) => p.periodId === "c2-jun" && p.entityKey === C2)!.asClosed;
        expect(Number(juneBefore["income:Interest"])).toBe(-12345.67);
        // a direct journal into the closed period is refused; the PPA needs an explicitly CLOSED target
        expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.post_journal_batch($1,$2,'2026-06-30',$3::jsonb,'Backdated fix',NULL)", [id(7201), ent.c2, JSON.stringify(lines)])))).toMatch(/^P7_CLOSED_PERIOD/);
        expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.submit_posting_request($1,'prior_period_adjustment',$2::jsonb,'Interest correction')", [id(7202), JSON.stringify({ ...payload, entityId: ent.c1 })])))).toMatch(/not closed for this legal entity/);
        expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.submit_posting_request($1,'prior_period_adjustment',$2::jsonb,'Interest correction')", [id(7203), JSON.stringify({ ...payload, correctionDate: "2026-06-15" })])))).toMatch(/posted after the closed period/);
        const sub = first(await as(db, U.O, () => q<{ r: Record<string, unknown> }>(db, "SELECT public.submit_posting_request($1,'prior_period_adjustment',$2::jsonb,'Interest correction') r", [id(7204), JSON.stringify(payload)]))).r;
        expect(sub).toMatchObject({ status: "pending", entityId: ent.c2 });
        expect(await count(db, "SELECT 1 FROM public.posting_batches WHERE kind = 'prior_period'")).toBe(0); // nothing posted before approval
        expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.decide_posting_request($1,'approve','ok')", [id(7204)])))).toBe("STEP_UP_REQUIRED: decide_posting_request");
        const dec = first(await as(db, U.O, async () => { await stepUp(db, U.O); return q<{ r: { status: string; result: { batch: string; correctionDate: string } } }>(db, "SELECT public.decide_posting_request($1,'approve','Reviewed with CA') r", [id(7204)]); })).r;
        expect(dec.status).toBe("approved");
        const b = first(await q<{ d: string; k: string; m: Record<string, unknown> }>(db, "SELECT posting_date::text d, kind k, meta m FROM public.posting_batches WHERE id = $1", [dec.result.batch]));
        expect(b).toMatchObject({ d: "2026-07-31", k: "prior_period" });
        expect(b.m["priorPeriod"]).toMatchObject({ id: "c2-jun", from: "2026-06-01", to: "2026-06-30" });
        const report = first(await as(db, U.O, () => q<{ r: { periods: { periodId: string; entityKey: string; asClosed: Record<string, number>; adjustments: { batchId: string }[]; restated: Record<string, number>; unchangedSinceClose: boolean }[] } }>(db, "SELECT public.prior_period_adjustment_report() r"))).r;
        const june = report.periods.find((p) => p.periodId === "c2-jun" && p.entityKey === C2)!;
        expect(june.asClosed).toEqual(juneBefore); // closed figures never change
        expect(june.adjustments.map((a) => a.batchId)).toEqual([dec.result.batch]);
        expect(Number(june.restated["income:Interest"])).toBe(-12000); // as closed + adjustment, shown separately
        expect(Number(june.restated["expense:Interest correction"])).toBe(-345.67);
        // the PPA variant that reverses an entry of the closed period: reversal row on the correction date
        const ppa = first(await as(db, U.O, async () => {
          await q(db, "SELECT public.submit_posting_request($1,'prior_period_adjustment',$2::jsonb,'Audit fee was a duplicate')", [id(7205), JSON.stringify({ entryId: e(18), periodId: "c2-jun", correctionDate: "2026-07-31" })]);
          await stepUp(db, U.O);
          return q<{ r: { result: { reversalEntryId: string; correctionDate: string; priorPeriod: { id: string } } } }>(db, "SELECT public.decide_posting_request($1,'approve','') r", [id(7205)]);
        })).r.result;
        expect(ppa).toMatchObject({ correctionDate: "2026-07-31", priorPeriod: { id: "c2-jun" } });
        expect(first(await q<{ t: string }>(db, "SELECT target t FROM public.posting_reversals WHERE id = $1", [id(7205)])).t).toBe("prior_period");
        const report2 = first(await as(db, U.O, () => q<{ r: { periods: { periodId: string; entityKey: string; asClosed: Record<string, number>; adjustments: unknown[] }[] } }>(db, "SELECT public.prior_period_adjustment_report() r"))).r;
        const june2 = report2.periods.find((p) => p.periodId === "c2-jun" && p.entityKey === C2)!;
        expect(june2.asClosed).toEqual(juneBefore);
        expect(june2.adjustments).toHaveLength(2);
      } finally { await setClosedPeriods(db, U.O, []); }
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe("decision 3 / item 7: personal and company period closing, entity-aware, in both guards", () => {
    it("a personal-only close locks personal entries in the legacy guard and the posting guard; company books stay open", async () => {
      await setClosedPeriods(db, U.O, [{ id: "p-may", from: "2026-05-01", to: "2026-05-31", entityId: PERSONAL }]);
      try {
        // legacy guard: personal entries (savings P1, card P2) refused; Alpha-only card settlement e(6) allowed
        expect(errorText(await attempt(db, U.O, () => q(db, "UPDATE public.expenses SET amount = 5001, original_amount = 5001 WHERE id = $1", [e(9)])))).toMatch(/closed period/);
        expect(errorText(await attempt(db, U.O, () => q(db, INSERT_EXPENSE, exParams({ id: id(7301), acc: ACC.P2, date: "2026-05-20", amount: 99, category: "Dining" }))))).toMatch(/closed period/);
        expect(errorText(await attempt(db, U.O, () => q(db, INSERT_EXPENSE, exParams({ id: id(7302), acc: null, date: "2026-05-20", amount: 99, category: "Cash" }))))).toMatch(/closed period/);
        expect((await attempt(db, U.O, () => q(db, "UPDATE public.expenses SET amount = 10021, original_amount = 10021 WHERE id = $1", [e(6)]))).ok).toBe(true);
        // the director withdrawal A1 -> P1 touches the personal books too: refused
        expect(errorText(await attempt(db, U.O, () => q(db, "UPDATE public.expenses SET amount = 40001, original_amount = 40001 WHERE id = $1", [e(13)])))).toMatch(/closed period/);
        // posting guard: a personal journal in May is refused; a company journal in May posts
        const jl = JSON.stringify([{ code: "expense:Accrual", role: "expense", debit: 10, credit: 0 }, { code: "accrual:X", role: "liability", debit: 0, credit: 10 }]);
        expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.post_journal_batch($1,$2,'2026-05-15',$3::jsonb,'May accrual',NULL)", [id(7303), ent.personal, jl])))).toMatch(/^P7_CLOSED_PERIOD/);
        expect((await attempt(db, U.O, () => q(db, "SELECT public.post_journal_batch($1,$2,'2026-05-15',$3::jsonb,'May accrual',NULL)", [id(7304), ent.c1, jl]))).ok).toBe(true);
        // a personal correction lands on the correction date, never inside the closed May
        expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return reverse(db, id(7305), e(9), "Wallet top-up never happened", "2026-05-31"); }))).toMatch(/^P7_CLOSED_PERIOD/);
        expect((await attempt(db, U.O, async () => { await stepUp(db, U.O); return reverse(db, id(7306), e(9), "Wallet top-up never happened", "2026-06-02"); })).ok).toBe(true);
      } finally { await setClosedPeriods(db, U.O, []); }
    });

    it("company and personal close through change_accounting_period: blocked while exceptions remain; evidence carries the postings", async () => {
      const exp = { closedPeriods: [], periodLog: [] };
      const close = (from: string, to: string, period: string, reqId: string) => q<{ r: Record<string, unknown> }>(db, "SELECT public.change_accounting_period($1,'closed',$2,$3,$4,'Month end close',$5::jsonb) r", [reqId, period, from, to, JSON.stringify(exp)]);
      expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return close("2026-06-01", "2026-06-30", "jun", id(7310)); }))).toMatch(/^P7_CLOSE_BLOCKED/); // e19, e20, e22 exceptions
      const r = await attempt(db, U.O, async () => {
        await stepUp(db, U.O); await close("2026-05-01", "2026-05-31", "may", id(7311));
        return first(await q<{ e: { postings: { batches: string[]; sha256: string } } }>(db, "SELECT evidence e FROM public.period_close_evidence WHERE id = $1", [id(7311)])).e.postings;
      });
      if (!r.ok) throw new Error(r.error);
      expect(r.value.batches.length).toBeGreaterThan(5);
      expect(r.value.sha256).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe("decision 4: reimbursement types are distinguished; gross expenses preserved; no duplicate recognition", () => {
    it("employee claim (seed): gross expense kept, recovery separate, receivable settled by the money back", async () => {
      const p = await tbOf(db, PERSONAL);
      expect(p["recovery:employer:Medical"]).toBe(-1200);
      expect(p[`receivable:claim:${e(15)}`]).toBeUndefined(); // recognised 1,200 and received 1,200
      const lines = await q<{ code: string; s: string }>(db, `SELECT l.code, l.signed_amount::text s FROM public.posting_lines l JOIN public.posting_batches b ON b.id = l.batch_id
        JOIN public.posting_events ev ON ev.id = b.event_id WHERE ev.event_key = 'ledger_entry:' || $1 ORDER BY l.code`, [e(16)]);
      expect(lines).toEqual([{ code: `account:${ACC.P1}`, s: "1200.00" }, { code: `receivable:claim:${e(15)}`, s: "-1200.00" }]); // money back never touches expense:*
      expect(Object.keys(p).filter((k) => k.startsWith("income:Reimb"))).toEqual([]);
    });

    it("merchant refund reduces the purchase; inter-party, advance and written-off claims post their own way; unlinked money back is an exception", async () => {
      const r = await attempt(db, U.O, async () => {
        const t0 = await tbOf(db, PERSONAL); await actAs(db, U.O);
        // merchant refund (seed e14 999.50 on Groceries) is the ONLY one that reduces the expense category
        const refund = (t0["expense:Groceries"] ?? 0);
        // inter-party settlement: dinner paid for a friend, half is theirs
        await q(db, INSERT_EXPENSE, exParams({ id: id(7401), acc: ACC.P2, date: "2026-07-02", amount: 3000, category: "Dining", title: "Group dinner",
          reimb: { kind: "party", payer: "Ravi", reimbursable: 1500, receipts: [] }, reimbStatus: "pending" }));
        await q(db, "SELECT public.finance_operation('claim_receipt', $1::jsonb)", [JSON.stringify({ operationId: "party-1", id: id(7401), amount: 1500, date: "2026-07-03", accountId: ACC.P3 })]);
        // advance received for a trip, part spent and claimed against it, rest returned
        await q(db, INSERT_EXPENSE, exParams({ id: id(7402), acc: ACC.P1, date: "2026-07-04", amount: 10000, type: "advance", category: "Travel advance", title: "Advance from Alpha" }));
        await q(db, INSERT_EXPENSE, exParams({ id: id(7403), acc: ACC.P1, date: "2026-07-06", amount: 7000, category: "Travel", title: "Client visit",
          reimb: { kind: "advance", payer: "Alpha", reimbursable: 7000, receipts: [] }, reimbStatus: "pending" }));
        await q(db, INSERT_EXPENSE, exParams({ id: id(7404), acc: ACC.P1, date: "2026-07-08", amount: 3000, type: "advance_settlement", category: "Advance return", title: "Unused advance returned" }));
        // written-off claim after a partial receipt: only what was received is a recovery
        await q(db, INSERT_EXPENSE, exParams({ id: id(7405), acc: ACC.P2, date: "2026-07-09", amount: 800, category: "Medical", title: "Pharmacy",
          reimb: { kind: "insurance", payer: "Star Health", reimbursable: 800, receipts: [] }, reimbStatus: "pending" }));
        await q(db, "SELECT public.finance_operation('claim_receipt', $1::jsonb)", [JSON.stringify({ operationId: "ins-1", id: id(7405), amount: 300, date: "2026-07-10", accountId: ACC.P1 })]);
        await q(db, "UPDATE public.expenses SET reimbursement = reimbursement || '{\"stage\":\"written_off\"}'::jsonb, reimbursement_status = 'none' WHERE id = $1", [id(7405)]);
        // money back with no claim: never assumed to reduce an expense
        await q(db, INSERT_EXPENSE, exParams({ id: id(7406), acc: ACC.P1, date: "2026-07-11", amount: 450, type: "reimbursement", category: "Medical", title: "Unknown reimbursement" }));
        const t1 = await tbOf(db, PERSONAL);
        const plan = first(await q<{ p: { exceptions: { exception: string; entryId: string }[] } }>(db, "SELECT phase3_p7.plan($1) p", [U.O])).p;
        return { refund, t1, exc: plan.exceptions.filter((x) => x.entryId === id(7406)).map((x) => x.exception), unposted: await count(db, "SELECT 1 FROM public.posting_events WHERE event_key = 'ledger_entry:' || $1", [id(7406)]) };
      });
      if (!r.ok) throw new Error(r.error);
      const t = r.value.t1;
      expect(r.value.refund).toBe(2000 - 999.5); // Groceries 2,000 split line less the 999.50 merchant refund
      expect(t["expense:Dining"]).toBe(1800 + 3000); // gross preserved
      expect(t["recovery:party:Dining"]).toBe(-1500);
      expect(t[`receivable:claim:${id(7401)}`]).toBeUndefined(); // settled
      expect(t["expense:Travel"]).toBe(7000);
      expect(t["recovery:advance:Travel"]).toBe(-7000);
      expect(t["advance:received"]).toBeUndefined(); // 10,000 received - 7,000 spent - 3,000 returned
      expect(Object.keys(t).filter((k) => k.startsWith("income:Travel") || k === "income:Travel advance")).toEqual([]); // advance is never income
      expect(t["recovery:insurance:Medical"]).toBe(-300); // written off: only the received 300 recovered
      expect(t[`receivable:claim:${id(7405)}`]).toBeUndefined();
      expect(r.value.exc).toEqual(["reimbursement_unlinked"]);
      expect(r.value.unposted).toBe(0);
    });

    it("one money-back entry on two claims is ambiguous (never two recoveries); reversing a money-back entry reopens its claim", async () => {
      const r = await attempt(db, U.O, async () => {
        await q(db, INSERT_EXPENSE, exParams({ id: id(7411), acc: ACC.P2, date: "2026-07-12", amount: 1000, category: "Fuel", title: "Fuel claim",
          reimb: { kind: "employer", payer: "Alpha", reimbursable: 1000, receipts: [] }, reimbStatus: "pending" }));
        await q(db, "SELECT public.finance_operation('claim_receipt', $1::jsonb)", [JSON.stringify({ operationId: "fuel-1", id: id(7411), amount: 600, date: "2026-07-13", accountId: ACC.P1 })]);
        const rid = first(await q<{ id: string }>(db, "SELECT (reimbursement->'receipts'->0->>'txnId') id FROM public.expenses WHERE id = $1", [id(7411)])).id;
        const posted = await count(db, "SELECT 1 FROM public.posting_events ev JOIN public.posting_batches b ON b.event_id = ev.id WHERE ev.event_key = 'ledger_entry:' || $1", [rid]);
        // reverse the money-back entry: the claim is outstanding again, history kept in reversedReceipts
        const before = await rowState(db);
        await actAs(db, U.O); await stepUp(db, U.O);
        await reverse(db, id(7412), rid, "Payment bounced at the bank", "2026-07-20");
        const after = await rowState(db); await actAs(db, U.O);
        const claim = first(await q<{ r: { receipts: unknown[]; reversedReceipts: { txnId: string; reversal: { entryId: string } }[] }; s: string }>(db, "SELECT reimbursement r, reimbursement_status s FROM public.expenses WHERE id = $1", [id(7411)]));
        const tb = await tbOf(db, PERSONAL); await actAs(db, U.O);
        // the same claim can receive the 1,000 again: remaining is correct
        await q(db, "SELECT public.finance_operation('claim_receipt', $1::jsonb)", [JSON.stringify({ operationId: "fuel-2", id: id(7411), amount: 1000, date: "2026-07-21", accountId: ACC.P1 })]);
        const tb2 = await tbOf(db, PERSONAL); await actAs(db, U.O);
        // ambiguity: list the new receipt on a second claim too
        const second = first(await q<{ id: string }>(db, "SELECT (reimbursement->'receipts'->0->>'txnId') id FROM public.expenses WHERE id = $1", [id(7411)])).id;
        await q(db, INSERT_EXPENSE, exParams({ id: id(7413), acc: ACC.P2, date: "2026-07-14", amount: 1000, category: "Fuel", reimbStatus: "received",
          reimb: { kind: "employer", reimbursable: 1000, receipts: [{ id: second, txnId: second, date: "2026-07-21", amount: 1000 }] } }));
        const ambiguous = await count(db, `SELECT 1 FROM public.posting_batches b JOIN public.posting_events ev ON ev.id = b.event_id WHERE ev.event_key = 'ledger_entry:' || $1
          AND b.kind <> 'reversal' AND NOT EXISTS (SELECT 1 FROM public.posting_batches r WHERE r.reverses_id = b.id)`, [second]);
        return { posted, changed: expectPreserved(before, after, [id(7411)]), claim, tb, tb2, ambiguous };
      });
      if (!r.ok) throw new Error(r.error);
      expect(r.value.posted).toBe(1);
      expect(r.value.claim.s).toBe("pending");
      expect(r.value.claim.r.receipts).toEqual([]);
      expect(r.value.claim.r.reversedReceipts).toHaveLength(1);
      expect(r.value.tb[`receivable:claim:${id(7411)}`]).toBe(1000); // outstanding again after the bounce
      expect(r.value.tb2[`receivable:claim:${id(7411)}`]).toBeUndefined();
      expect(r.value.tb2["expense:Fuel"]).toBe(1000); // gross, once
      expect(r.value.ambiguous).toBe(0); // listed on two claims: no active posting, never two settlements
    });
    it("reversing a claimed expense reverses its claim on the same correction date; money already received is then owed back", async () => {
      const r = await attempt(db, U.O, async () => {
        await stepUp(db, U.O);
        await reverse(db, id(7421), e(15), "Clinic visit was never made", "2026-07-28");
        const claim = await q<{ d: string; k: string }>(db, `SELECT b.posting_date::text d, b.kind k FROM public.posting_batches b JOIN public.posting_events ev ON ev.id = b.event_id
          WHERE ev.event_key = 'claim:' || $1 ORDER BY b.posting_date`, [e(15)]);
        return { claim, tb: await tbOf(db, PERSONAL) };
      });
      if (!r.ok) throw new Error(r.error);
      expect(r.value.claim).toEqual([{ d: "2026-05-14", k: "entry" }, { d: "2026-07-28", k: "reversal" }]);
      expect(r.value.tb["recovery:employer:Medical"]).toBeUndefined();
      expect(r.value.tb[`receivable:claim:${e(15)}`]).toBe(-1200); // the 1,200 received is owed back to the employer
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe("decision 5: owner-only posting through one permission check; default-off delegation", () => {
    it("owner may; an accountant grant alone may not (default off); legacy company roles never may, even with a delegation", async () => {
      const may = async (uid: string, action: string, entity: string | null, opts: { anon?: boolean; client?: string } = {}) => {
        await actAs(db, null);
        await q(db, "SELECT set_config('test.uid', $1, false), set_config('test.client_id', $2, false), set_config('test.anon', $3, false)", [uid, opts.client ?? "", opts.anon ? "true" : ""]);
        const v = first(await q<{ m: boolean }>(db, "SELECT phase3_p7.may($1,$2,$3) m", [U.O, entity, action])).m;
        await q(db, "SELECT set_config('test.uid', '', false), set_config('test.client_id', '', false), set_config('test.anon', '', false)");
        return v;
      };
      expect(await may(U.O, "post", ent.c1)).toBe(true);
      expect(await may(U.O, "post", ent.c1, { client: MCP })).toBe(false); // assistant sessions never post
      expect(await may(U.A, "post", ent.c1)).toBe(false); // accountant (P2 matrix allows post) without delegation: off
      expect(await may(U.M, "post", ent.c1)).toBe(false);
      expect(await may(U.X, "post", ent.c1)).toBe(false);
      // a future, separately approved delegation (simulated by the superuser: no client writer exists)
      expect(errorText(await attempt(db, U.O, () => q(db, "INSERT INTO public.posting_delegations(id, owner_id, entity_key, grantee_id, actions) VALUES ($1,$2,$3,$4,ARRAY['post'])", [id(7501), U.O, C1, U.A])))).toMatch(/P7_WRITER_ONLY|permission denied/);
      await actAs(db, null);
      await db.exec("BEGIN");
      await q(db, "SELECT set_config('phase3_p7.writer','on',true)");
      await q(db, "INSERT INTO public.posting_delegations(id, owner_id, entity_key, grantee_id, actions) VALUES ($1,$2,$3,$4,ARRAY['post','approve']), ($5,$2,$3,$6,ARRAY['post','approve'])", [id(7502), U.O, C1, U.A, id(7503), U.M]);
      const a = await may(U.A, "post", ent.c1), a2 = await may(U.A, "post", ent.c2), m = await may(U.M, "post", ent.c1), g = await may(U.G, "post", ent.c1, { anon: true });
      await db.exec("ROLLBACK");
      expect([a, a2, m, g]).toEqual([true, false, false, false]); // only the delegated accountant, only for C1; legacy editor never
      // every posting entry point goes through the check: today a non-owner cannot even name another owner's books
      expect(await may(U.A, "post", ent.c1)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe("item 1: Statement Desk Undo by audited per-entry reversal", () => {
    it("posted rows are reversed with a reason, unposted rows deleted as before, matches cleared; replay reports the same; mismatches refused", async () => {
      const UP = id(7601);
      const rows: Ex[] = [
        { id: id(7602), acc: ACC.P1, date: "2026-07-22", amount: 410, category: "Food", ref: "document:stmt-9 · L0001 · 2026-07-22 · 410.00" },
        { id: id(7603), acc: ACC.P1, date: "2026-07-23", amount: 520, category: "Fuel", ref: "document:stmt-9 · L0002 · 2026-07-23 · 520.00" },
        { id: id(7604), acc: null, date: "2026-07-23", amount: 60, category: "Food" }, // never posted (no account): an exception
      ];
      await as(db, U.O, async () => { for (const x of rows) await q(db, INSERT_EXPENSE, exParams(x)); await q(db, "UPDATE public.expenses SET statement_ref = 'document:stmt-9 · L0003 · 2026-06-03 · 2100.00', reconciled_at = now() WHERE id = $1", [e(21)]); });
      await actAs(db, null);
      await q(db, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{statementUploads}', $2::jsonb) WHERE owner_id = $1",
        [U.O, JSON.stringify([{ id: UP, at: "2026-07-24T10:00:00Z", label: "July bank", posted: rows.map((x) => x.id), reconciled: [e(21)], status: "saved" }])]);
      const snapshot = async (ids: string[]) => { await actAs(db, null); return q<{ s: Record<string, unknown> }>(db, "SELECT to_jsonb(x) s FROM public.expenses x WHERE id = ANY($1::uuid[]) ORDER BY id", [ids]); };
      const snaps = await snapshot([...rows.map((x) => x.id), e(21)]);
      const items = snaps.map(({ s }) => ({ action: s["id"] === e(21) ? "unreconcile" : "remove", ref: s["statement_ref"], snapshot: s }));
      const call = (req: string, its: unknown = items) => q<{ r: { reversed: { entryId: string; reversalEntryId: string }[]; deleted: string[]; unreconciled: string[]; replayed: boolean } }>(db,
        "SELECT public.reverse_statement_upload($1,$2,$3::jsonb,'Wrong statement uploaded') r", [req, UP, JSON.stringify(its)]);
      expect(errorText(await attempt(db, U.O, () => call(id(7605))))).toBe("STEP_UP_REQUIRED: reverse_statement_upload");
      const stale = items.map((x) => (x.snapshot["id"] === id(7602) ? { ...x, snapshot: { ...x.snapshot, amount: 411 } } : x));
      expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return call(id(7606), stale); }))).toMatch(/Record changed/);
      const before = await rowState(db);
      const res = first(await as(db, U.O, async () => { await stepUp(db, U.O); return call(id(7607)); })).r;
      expect(res.reversed.map((x) => x.entryId).sort()).toEqual([id(7602), id(7603)].sort());
      expect(res.deleted).toEqual([id(7604)]);
      expect(res.unreconciled).toEqual([e(21)]);
      const after = await rowState(db);
      // the posted rows are kept byte-identical, the unposted one is gone (today's rule), e21 lost only its match
      expect(Object.keys(after.rows)).not.toContain(id(7604));
      expect(after.rows[id(7602)]).toBe(before.rows[id(7602)]);
      expect(after.rows[id(7603)]).toBe(before.rows[id(7603)]);
      const e21 = first(await q<{ r: string | null; a: string }>(db, "SELECT statement_ref r, amount::text a FROM public.expenses WHERE id = $1", [e(21)]));
      expect(e21).toEqual({ r: null, a: "2100.00" });
      const reasons = await q<{ r: string }>(db, "SELECT reason r FROM public.posting_reversals WHERE entry_id = ANY($1::uuid[]) ORDER BY 1", [[id(7602), id(7603)]]);
      expect(reasons.map((x) => x.r)).toEqual(["Statement upload undone: Wrong statement uploaded", "Statement upload undone: Wrong statement uploaded"]);
      const replay = first(await as(db, U.O, async () => { await stepUp(db, U.O); return call(id(7607)); })).r;
      expect(replay).toMatchObject({ replayed: true, deleted: [id(7604)] });
      // the statement-row evidence is released: a corrected row can carry it
      expect((await attempt(db, U.O, () => q(db, INSERT_EXPENSE, exParams({ id: id(7608), acc: ACC.P1, date: "2026-07-22", amount: 401, category: "Food", ref: rows[0]!.ref! })))).ok).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe("item 2: linked records after a reversal keep their history and get the right state", () => {
    it("transfer link -> reversed (cancel refused), counterpart kept, import fingerprint and draft kept as history; balances net to zero", async () => {
      const r = await attempt(db, null, async () => {
        await q(db, `INSERT INTO public.transfer_links(id, owner_id, debit_id, credit_id, source_account, dest_account, source_amount, dest_amount, source_currency, dest_currency, status)
          VALUES ($1,$2,$3,$4,$5,$6,15000,15000,'INR','INR','matched')`, [id(7701), U.O, e(23), e(24), ACC.P1, ACC.P2]);
        await q(db, "INSERT INTO public.import_posts(owner_id, account_id, fingerprint, transaction_id, original_line) VALUES ($1,$2,'fp-23',$3,'{}')", [U.O, ACC.P1, e(23)]);
        await q(db, "INSERT INTO public.expense_drafts(id, owner_id, status, transaction_id) VALUES ($1,$2,'saved',$1)", [e(23), U.O]);
        await actAs(db, U.O); await stepUp(db, U.O);
        const before = await rowState(db);
        await actAs(db, U.O);
        const out = first(await reverse(db, id(7702), e(23), "Card bill paid from the wrong account", "2026-07-25")).r;
        const after = await rowState(db);
        await actAs(db, U.O);
        const cancel = await (async () => { try { await q(db, "SAVEPOINT s"); await q(db, "SELECT public.cancel_transfer($1)", [id(7701)]); await q(db, "RELEASE SAVEPOINT s"); return ""; } catch (x) { await q(db, "ROLLBACK TO SAVEPOINT s"); return (x as Error).message; } })();
        let unlink = "";
        try { await q(db, "SAVEPOINT u"); await q(db, "UPDATE public.expenses SET transfer_counterpart_of = NULL, txn_type = 'income' WHERE id = $1", [e(24)]); await q(db, "RELEASE SAVEPOINT u"); } catch (x) { await q(db, "ROLLBACK TO SAVEPOINT u"); unlink = (x as Error).message; }
        await actAs(db, null);
        const link = first(await q<{ s: string; c: string | null }>(db, "SELECT status s, cancelled_at::text c FROM public.transfer_links WHERE id = $1", [id(7701)]));
        const states = await q<{ k: string; st: string }>(db, "SELECT link_kind k, state st FROM public.posting_link_states WHERE reversal_entry_id = $1 ORDER BY 1", [out["reversalEntryId"]]);
        const net = await q<{ a: string; s: string }>(db, `SELECT l.account_id::text a, sum(l.signed_amount)::text s FROM public.posting_lines l JOIN public.posting_batches b ON b.id = l.batch_id
          JOIN public.posting_events ev ON ev.id = b.event_id WHERE ev.event_key = 'ledger_entry:' || $1 AND l.account_id IS NOT NULL GROUP BY 1 ORDER BY 1`, [e(23)]);
        return { added: expectPreserved(before, after), rid: out["reversalEntryId"], cancel, unlink, link, states, net };
      });
      if (!r.ok) throw new Error(r.error);
      expect(r.value.link).toEqual({ s: "reversed", c: null });
      expect(r.value.cancel).not.toBe(""); // cancel_transfer refuses (its own revision check)
      expect(r.value.unlink).toMatch(/^P7_REVERSED_ENTRY/); // and the database refuses reviving the receiving side directly
      expect(r.value.states).toEqual([{ k: "counterpart", st: "kept_as_history" }, { k: "draft", st: "kept_as_history" }, { k: "import_post", st: "kept_as_history" }, { k: "transfer_link", st: "reversed" }]);
      expect(r.value.net).toEqual([{ a: ACC.P1, s: "0.00" }, { a: ACC.P2, s: "0.00" }].sort((x, y) => x.a.localeCompare(y.a))); // both sides net to zero (P0-020)
      expect(r.value.added).toEqual([r.value.rid]); // only the reversal row is new; e23, e24, fingerprint and draft rows unchanged (their state is recorded, not rewritten) // and draft rows unchanged (their state is recorded, not rewritten)
    });

    it("bulk-category history is never wiped (P0-021) and undo of a reversed entry is refused with the history kept", async () => {
      const disabled = first(await q<{ e: string }>(db, "SELECT tgenabled::text e FROM pg_trigger WHERE tgname = 'clear_empty_category_history'")).e;
      expect(disabled).toBe("D");
      const r = await attempt(db, null, async () => {
        const b = id(7801);
        const rev = first(await q<{ r: number }>(db, "SELECT category_revision r FROM public.expenses WHERE id = $1", [e(8)])).r;
        await q(db, "INSERT INTO public.category_batches(id, owner_id, category, entries) VALUES ($1,$2,'Salary',$3::jsonb)", [b, U.O, JSON.stringify([{ id: e(8), title: "April salary", from: "Bonus", allocations: [], revision: rev }])]);
        await actAs(db, U.O); await stepUp(db, U.O); await actAs(db, U.O);
        const out = first(await reverse(db, id(7802), e(8), "Salary recorded twice", "2026-07-27")).r;
        let undo = "";
        try { await q(db, "SAVEPOINT s"); await q(db, "SELECT public.undo_category_change($1)", [b]); await q(db, "RELEASE SAVEPOINT s"); } catch (x) { await q(db, "ROLLBACK TO SAVEPOINT s"); undo = (x as Error).message; }
        await actAs(db, null);
        const kept = first(await q<{ n: number; u: string | null }>(db, "SELECT count(*)::int n, max(undone_at)::text u FROM public.category_batches WHERE id = $1", [b]));
        const st = await q<{ st: string }>(db, "SELECT state st FROM public.posting_link_states WHERE reversal_entry_id = $1 AND link_kind = 'category_batch'", [out["reversalEntryId"]]);
        // an owner who is not active (X) deletes the last entry: the bulk-category history is kept (P0-021)
        await q(db, "INSERT INTO public.accounts(id, owner_id, name, kind) VALUES ($1,$2,'X bank','savings')", [id(7803), U.X]);
        await q(db, INSERT_EXPENSE, exParams({ id: id(7804), owner: U.X, acc: id(7803), date: "2026-07-01", amount: 10, category: "Food" }));
        await q(db, "INSERT INTO public.category_batches(id, owner_id, category, entries) VALUES ($1,$2,'Food','[]')", [id(7805), U.X]);
        await actAs(db, U.X);
        await q(db, "DELETE FROM public.expenses WHERE id = $1", [id(7804)]);
        await actAs(db, null);
        const xHist = await count(db, "SELECT 1 FROM public.category_batches WHERE owner_id = $1", [U.X]);
        return { undo, kept, st, xHist };
      });
      if (!r.ok) throw new Error(r.error);
      expect(r.value.undo).toMatch(/P7_REVERSED_ENTRY|Cannot undo/);
      expect(r.value.kept).toEqual({ n: 1, u: null }); // history row kept, not undone
      expect(r.value.st).toEqual([{ st: "undo_blocked" }]);
      expect(r.value.xHist).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe("item 3 (P0-005b): one idempotent card-payment action", () => {
    it("a lost response + retry with the same id records ONE payment and ONE posting; a new id is a new payment", async () => {
      const PAY = id(7901);
      const call = (req: string, amount = 8000) => q<{ r: Record<string, unknown> }>(db, "SELECT public.record_card_payment($1,$2,$3,$4,'2026-07-26','July card bill') r", [req, ACC.P1, ACC.P2, amount]);
      const before = await rowState(db);
      const first1 = first(await as(db, U.O, () => call(PAY))).r; // committed; the response is "lost"
      const retry = first(await as(db, U.O, () => call(PAY))).r;  // the person taps again: same id
      expect(first1["replayed"]).toBe(false);
      expect(retry["replayed"]).toBe(true);
      expectPreserved(before, await rowState(db)); // + exactly one new row (checked below)
      expect(await count(db, "SELECT 1 FROM public.expenses WHERE employee_id = $1 AND txn_type = 'card_payment' AND expense_date = '2026-07-26'", [U.O])).toBe(1);
      expect(await count(db, "SELECT 1 FROM public.posting_batches b JOIN public.posting_events ev ON ev.id = b.event_id WHERE ev.event_key = 'ledger_entry:' || $1", [PAY])).toBe(1);
      const lines = await q<{ code: string; s: string }>(db, `SELECT l.code, l.signed_amount::text s FROM public.posting_lines l JOIN public.posting_batches b ON b.id = l.batch_id
        JOIN public.posting_events ev ON ev.id = b.event_id WHERE ev.event_key = 'ledger_entry:' || $1 ORDER BY l.code`, [PAY]);
      expect(lines).toEqual([{ code: `account:${ACC.P1}`, s: "-8000.00" }, { code: `account:${ACC.P2}`, s: "8000.00" }]); // Cr bank, Dr card; never spending
      // a fallback save() that already wrote this id is confirmed, never duplicated
      const fb = await attempt(db, U.O, async () => {
        await q(db, INSERT_EXPENSE, exParams({ id: id(7902), acc: ACC.P1, to: ACC.P2, date: "2026-07-26", amount: 500, type: "card_payment", category: "Card payment" }));
        await call(id(7902), 500);
        return count(db, "SELECT 1 FROM public.expenses WHERE id = $1", [id(7902)]);
      });
      expect(fb).toEqual({ ok: true, value: 1 });
      expect(errorText(await attempt(db, U.O, () => call(id(7903), 0)))).toMatch(/positive amount/);
      expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.record_card_payment($1,$2,$3,100)", [id(7904), ACC.P2, ACC.P1])))).toMatch(/cash or bank account/);
      expect(errorText(await attempt(db, U.O, () => call(id(7905)), { clientId: MCP }))).toMatch(/assistant/i);
      expect(errorText(await attempt(db, U.V, () => call(id(7906))))).toMatch(/cash or bank account/); // another owner's accounts
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe("item 5: approval queue for journals, reversals and the historical conversion", () => {
    it("submit validates and posts nothing; reject/cancel post nothing; approve posts once; the overview reports each status", async () => {
      const lines = [{ code: "expense:Audit accrual", role: "expense", debit: 2500, credit: 0 }, { code: "accrual:Audit", role: "liability", debit: 0, credit: 2500 }];
      const jp = { entityId: ent.c2, date: "2026-07-31", lines, memo: "July audit accrual", sources: [] };
      await as(db, U.O, async () => {
        await q(db, "SELECT public.submit_posting_request($1,'journal',$2::jsonb,'Month-end accrual')", [id(8001), JSON.stringify(jp)]);
        await q(db, "SELECT public.submit_posting_request($1,'journal',$2::jsonb,'Month-end accrual')", [id(8002), JSON.stringify(jp)]);
        await q(db, "SELECT public.submit_posting_request($1,'reversal',$2::jsonb,'Duplicate statement row')", [id(8003), JSON.stringify({ entryId: e(10), correctionDate: "2026-07-31" })]);
      });
      expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.submit_posting_request($1,'journal',$2::jsonb,'Month-end accrual')", [id(8001), JSON.stringify({ ...jp, memo: "changed" })])))).toMatch(/already used/);
      expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.submit_posting_request($1,'journal',$2::jsonb,'Bad lines')", [id(8004), JSON.stringify({ ...jp, lines: [{ code: `account:${ACC.B1}`, role: "asset", debit: 1, credit: 0 }, lines[1]] })])))).toMatch(/cannot move bank/);
      expect(await count(db, "SELECT 1 FROM public.posting_events WHERE event_key IN ('journal:' || $1, 'journal:' || $2)", [id(8001), id(8002)])).toBe(0);
      const decide = (req: string, d: string) => as(db, U.O, async () => { await stepUp(db, U.O); return first(await q<{ r: { status: string; result: Record<string, unknown> | null } }>(db, "SELECT public.decide_posting_request($1,$2,'') r", [req, d])).r; });
      expect((await decide(id(8002), "reject")).status).toBe("rejected");
      expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return q(db, "SELECT public.decide_posting_request($1,'approve','')", [id(8002)]); }))).toMatch(/^P7_ALREADY_DECIDED/);
      const ok = await decide(id(8001), "approve");
      expect(ok.status).toBe("approved");
      expect((await decide(id(8001), "approve")).status).toBe("approved"); // replay
      expect(await count(db, "SELECT 1 FROM public.posting_batches WHERE id = $1 AND kind = 'journal'", [ok.result?.["batch"]])).toBe(1);
      const rv = await decide(id(8003), "approve");
      expect(rv.result).toMatchObject({ entryId: e(10), correctionDate: "2026-07-31" });
      const overview = first(await as(db, U.O, () => q<{ r: { request: string; status: string }[] }>(db, "SELECT public.posting_requests_overview() r"))).r;
      expect(Object.fromEntries(overview.filter((x) => [id(8001), id(8002), id(8003)].includes(x.request)).map((x) => [x.request, x.status]))).toEqual({ [id(8001)]: "approved", [id(8002)]: "rejected", [id(8003)]: "approved" });
      expect(errorText(await attempt(db, U.G, () => q(db, "SELECT public.submit_posting_request($1,'journal',$2::jsonb,'Guest try')", [id(8005), JSON.stringify(jp)]), { anon: true }))).toMatch(/P7_GUEST/);
    });

    it("historical conversion approval: a reviewed preview fingerprint is approved with step-up and activates the books once", async () => {
      // V deactivates, then converts again through the queue
      const run = first(await q<{ id: string }>(db, "SELECT id::text FROM public.posting_backfill_runs WHERE owner_id = $1 AND kind = 'commit' ORDER BY seq DESC LIMIT 1", [U.V])).id;
      await as(db, U.V, async () => { await stepUp(db, U.V); await q(db, "SELECT public.undo_posting_backfill($1,'Re-run the conversion')", [run]); });
      const fp = first(await as(db, U.V, () => q<{ p: { fingerprint: string } }>(db, "SELECT public.preview_posting_backfill() p"))).p.fingerprint;
      await as(db, U.V, () => q(db, "SELECT public.submit_posting_request($1,'backfill',$2::jsonb,'Reviewed conversion')", [id(8101), JSON.stringify({ fingerprint: fp })]));
      expect(first(await as(db, U.V, () => q<{ s: { active: boolean } }>(db, "SELECT public.posting_status() s"))).s.active).toBe(false);
      const d = await as(db, U.V, async () => { await stepUp(db, U.V); return first(await q<{ r: { status: string; result: { entriesPosted: number } } }>(db, "SELECT public.decide_posting_request($1,'approve','') r", [id(8101)])).r; });
      expect(d.status).toBe("approved");
      expect(d.result.entriesPosted).toBe(1);
      expect(first(await as(db, U.V, () => q<{ s: { active: boolean } }>(db, "SELECT public.posting_status() s"))).s.active).toBe(true);
    });
  });
});
