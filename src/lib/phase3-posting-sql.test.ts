// @vitest-environment node
// Phase 3 (Balanced Accounting) database acceptance tests for the PROPOSED P7_balanced_posting.sql:
// balance enforcement, immutability, audited reversal with step-up, idempotency and duplicate-source
// prevention, company/personal scope separation and access (owner + authorised accountant only),
// entity-aware closed periods (consistent with the legacy guard), opening balances, period-close
// evidence, C11 at the posting path, guests/assistants refused, historical preservation and rollback.
// Isolated in-memory PGlite: drizzle/migrations 0000-0088 + P1 + P2 + P4 + P5 (+ P7). Never Cloud.
import { describe, it, expect, beforeAll } from "vitest";
import { actAs, readSql } from "../test/full-schema-pglite";
import {
  ACC, C1, C2, DOC, INSERT_EXPENSE, LEDGER, MCP, P5_RB, P7, P7_RB, T, U, VC, activate, as, attempt, dataSnapshot, e, entityId, errorOf, errorText,
  exParams, first, id, journalTb, personalKey, preview, publicTables, q, seededDb, setClosedPeriods, stepUp, type Db, type Ex,
} from "../test/phase3-fixture";

const PERSONAL = personalKey(U.O);
const activeBatches = (db: Db, entry: string) => q<{ id: string; kind: string; version: number; k: string }>(db, `SELECT b.id, b.kind, b.version, le.entity_key k FROM public.posting_batches b
  JOIN public.posting_events ev ON ev.id = b.event_id JOIN public.legal_entities le ON le.id = b.legal_entity_id
  WHERE ev.event_key = 'ledger_entry:' || $1 AND b.kind <> 'reversal' AND NOT EXISTS (SELECT 1 FROM public.posting_batches r WHERE r.reverses_id = b.id) ORDER BY le.entity_key`, [entry]);
const allBatches = (db: Db, entry: string) => q<{ kind: string; version: number | null; reverses_id: string | null }>(db, `SELECT b.kind, b.version, b.reverses_id FROM public.posting_batches b
  JOIN public.posting_events ev ON ev.id = b.event_id WHERE ev.event_key = 'ledger_entry:' || $1 ORDER BY b.created_at, b.kind`, [entry]);
const count = async (db: Db, sql: string, p: unknown[] = []) => first(await q<{ n: number }>(db, `SELECT count(*)::int n FROM (${sql}) x`, p)).n;
/** Superuser writer-path insert of an arbitrary batch (bypasses the public functions, not the invariants). */
async function rawBatch(db: Db, owner: string, entity: string, lines: { code: string; role: string; debit: number | string; credit: number | string; currency?: string }[], key = `raw:${Math.random()}`) {
  await q(db, "SELECT set_config('phase3_p7.writer','on',true)");
  const ev = id(77000 + Math.floor(Math.random() * 999));
  await q(db, "INSERT INTO public.posting_events(id, owner_id, event_key, source_kind) VALUES ($1::uuid,$2,'journal:' || $1::text,'journal') ON CONFLICT DO NOTHING", [ev, owner]);
  const b = id(78000 + Math.floor(Math.random() * 999));
  await q(db, "INSERT INTO public.posting_batches(id, owner_id, legal_entity_id, event_id, kind, idempotency_key, posting_date) VALUES ($1,$2,$3,$4,'journal',$5,'2026-07-01')", [b, owner, entity, ev, key]);
  let n = 0;
  for (const l of lines) await q(db, "INSERT INTO public.posting_lines(id, batch_id, owner_id, line_no, code, role, currency, debit, credit) VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7::numeric,$8::numeric)", [b, owner, ++n, l.code, l.role, l.currency ?? "INR", String(l.debit), String(l.credit)]);
  return b;
}

describe("P7 balanced posting (proposed SQL)", () => {
  let db: Db;
  let ent: { c1: string; c2: string; personal: string; v: string };
  beforeAll(async () => {
    db = await seededDb();
    ent = { c1: await entityId(db, U.O, C1), c2: await entityId(db, U.O, C2), personal: await entityId(db, U.O, PERSONAL), v: await entityId(db, U.V, VC) };
    await activate(db, U.O);
    await activate(db, U.V);
  }, T);

  // ---------------------------------------------------------------------------------------------
  describe("1. balance enforcement at the database (requirement 2)", () => {
    it("refuses unbalanced, single-line, inexact, negative and two-sided postings, even on the writer path", async () => {
      const probe = (lines: Parameters<typeof rawBatch>[3]) => attempt(db, null, () => rawBatch(db, U.O, ent.c1, lines));
      expect(errorText(await probe([{ code: "expense:A", role: "expense", debit: 100, credit: 0 }, { code: "accrual:A", role: "liability", debit: 0, credit: 99.99 }]))).toMatch(/^P7_UNBALANCED/);
      expect(errorText(await probe([{ code: "expense:A", role: "expense", debit: 100, credit: 0 }]))).toMatch(/at least two lines/);
      expect(errorText(await probe([{ code: "expense:A", role: "expense", debit: "10.005", credit: 0 }, { code: "accrual:A", role: "liability", debit: 0, credit: "10.005" }]))).toMatch(/posting_lines_exact/);
      expect(errorText(await probe([{ code: "expense:A", role: "expense", debit: -5, credit: 0 }, { code: "accrual:A", role: "liability", debit: 0, credit: -5 }]))).toMatch(/posting_lines_one_side/);
      expect(errorText(await probe([{ code: "expense:A", role: "expense", debit: 5, credit: 5 }, { code: "accrual:A", role: "liability", debit: 0, credit: 0 }]))).toMatch(/posting_lines_one_side/);
      expect(errorText(await probe([{ code: "expense:A", role: "expense", debit: "NaN", credit: 0 }, { code: "accrual:A", role: "liability", debit: 0, credit: "NaN" }]))).toMatch(/posting_lines/);
      expect(errorText(await probe([{ code: "x", role: "suspense", debit: 1, credit: 0 }, { code: "y", role: "liability", debit: 0, credit: 1 }]))).toMatch(/posting_lines_role_check|violates check/);
    });

    it("multi-currency: each currency must balance on its own; exact decimals have no float drift", async () => {
      const mixed = await attempt(db, null, () => rawBatch(db, U.O, ent.c1, [
        { code: "fx:usd", role: "asset", debit: 120, credit: 0, currency: "USD" }, { code: "fx:inr", role: "equity", debit: 0, credit: 120, currency: "INR" }]));
      expect(errorText(mixed)).toMatch(/for each legal entity and currency/);
      const ok = await attempt(db, null, () => rawBatch(db, U.O, ent.c1, [
        { code: "fx:usd", role: "asset", debit: 120, credit: 0, currency: "USD" }, { code: "fx:usd-eq", role: "equity", debit: 0, credit: 120, currency: "USD" },
        { code: "expense:A", role: "expense", debit: "0.3", credit: 0 }, { code: "accrual:A", role: "liability", debit: 0, credit: "0.1" }, { code: "accrual:B", role: "liability", debit: 0, credit: "0.2" }]));
      expect(ok.ok).toBe(true);
    });

    it("split-category rounding posts exactly; an allocation that does not add up stays an exception (never rounded silently)", async () => {
      const r = await attempt(db, U.O, async () => {
        await q(db, INSERT_EXPENSE, exParams({ id: id(5001), acc: ACC.P2, date: "2026-07-02", amount: 100, allocations: [{ category: "A", amount: 33.33 }, { category: "B", amount: 33.33 }, { category: "C", amount: 33.34 }] }));
        const lines = await q<{ code: string; d: string; c: string }>(db, `SELECT l.code, l.debit::float8::text d, l.credit::float8::text c FROM public.posting_lines l JOIN public.posting_batches b ON b.id = l.batch_id
          JOIN public.posting_events ev ON ev.id = b.event_id WHERE ev.event_key = 'ledger_entry:' || $1 ORDER BY l.code`, [id(5001)]);
        const bad = await errorOf(db, () => q(db, INSERT_EXPENSE, exParams({ id: id(5002), acc: ACC.P2, date: "2026-07-02", amount: 10.005 })));
        return { lines, bad };
      });
      expect(r.ok && r.value.lines).toEqual([{ code: `account:${ACC.P2}`, d: "0", c: "100" }, { code: "expense:A", d: "33.33", c: "0" }, { code: "expense:B", d: "33.33", c: "0" }, { code: "expense:C", d: "33.34", c: "0" }]);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe("2. immutability (requirement 4)", () => {
    it("no client can insert, update or delete posting rows; even the superuser and service role cannot change them", async () => {
      let withRows = 0;
      for (const t of ["posting_batches", "posting_lines", "posting_events", "posting_event_sources", "posting_reversals", "posting_backfill_runs"]) {
        expect(errorText(await attempt(db, U.O, () => q(db, `UPDATE public.${t} SET owner_id = owner_id`)))).toMatch(/permission denied/);
        expect(errorText(await attempt(db, U.O, () => q(db, `DELETE FROM public.${t}`)))).toMatch(/permission denied/);
        if (await count(db, `SELECT 1 FROM public.${t}`) > 0) {
          withRows++;
          expect(errorText(await attempt(db, null, () => q(db, `UPDATE public.${t} SET owner_id = owner_id`)))).toMatch(/^P7_IMMUTABLE/);
          expect(errorText(await attempt(db, null, () => q(db, `DELETE FROM public.${t}`)))).toMatch(/^P7_IMMUTABLE/);
        }
        expect(errorText(await attempt(db, null, () => q(db, `TRUNCATE public.${t} CASCADE`)))).toMatch(/^P7_IMMUTABLE/);
      }
      expect(withRows).toBe(5); // every table except posting_reversals (covered in section 3) has rows here
      const svc = await attempt(db, null, async () => { await db.exec("SET ROLE service_role"); return q(db, "DELETE FROM public.posting_lines"); });
      expect(errorText(svc)).toMatch(/permission denied|P7_IMMUTABLE/);
      expect(errorText(await attempt(db, U.O, () => q(db, "INSERT INTO public.posting_events(id, owner_id, event_key, source_kind) VALUES (gen_random_uuid(), $1, 'journal:' || gen_random_uuid(), 'journal')", [U.O])))).toMatch(/permission denied/);
      expect(errorText(await attempt(db, null, () => q(db, "INSERT INTO public.posting_events(id, owner_id, event_key, source_kind) VALUES (gen_random_uuid(), $1, 'journal:' || gen_random_uuid(), 'journal')", [U.O])))).toMatch(/^P7_WRITER_ONLY/);
    });

    it("another user (e.g. a team member with delete_expenses) can never remove an active owner's entry (P0-022)", async () => {
      const r = await attempt(db, null, async () => {
        await q(db, "SELECT set_config('test.uid', $1, false)", [U.M]); // superuser bypasses RLS: the trigger alone must refuse
        return q(db, "DELETE FROM public.expenses WHERE id = $1", [e(20)]);
      });
      expect(errorText(r)).toMatch(/^P7_TEAM_DELETE/);
    });

    it("a posted ledger entry cannot be deleted by any client path; an unposted (exception) entry still can", async () => {
      expect(errorText(await attempt(db, U.O, () => q(db, "DELETE FROM public.expenses WHERE id = $1", [e(3)])))).toMatch(/^P7_POSTED_ENTRY/);
      const exc = await attempt(db, U.O, async () => { await q(db, "DELETE FROM public.expenses WHERE id = $1", [e(20)]); return count(db, "SELECT 1 FROM public.expenses WHERE id = $1", [e(20)]); });
      expect(exc).toEqual({ ok: true, value: 0 });
    });

    it("an edit posts reversal + replacement (DN-P3-1); the original batch stays; metadata-only changes post nothing (DN-P3-11)", async () => {
      const r = await attempt(db, U.O, async () => {
        await q(db, "UPDATE public.expenses SET tags = ARRAY['team'], title = 'Rent (April)' WHERE id = $1", [e(3)]);
        const afterMeta = await allBatches(db, e(3));
        await q(db, "UPDATE public.expenses SET amount = 52000, original_amount = 52000 WHERE id = $1", [e(3)]);
        return { afterMeta, after: await allBatches(db, e(3)), active: await activeBatches(db, e(3)), tb: (await journalTb(db, U.O))[C1] };
      });
      if (!r.ok) throw new Error(r.error);
      expect(r.value.afterMeta.map((b) => [b.kind, b.version])).toEqual([["entry", 1]]);
      expect(r.value.after.map((b) => `${b.kind}:${b.version}:${!!b.reverses_id}`).sort()).toEqual(["entry:1:false", "entry:2:false", "reversal:null:true"]);
      expect(r.value.active.map((b) => b.version)).toEqual([2]);
      expect(r.value.tb?.["expense:Rent"]).toBe(52000);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe("3. audited reversal (DN-P3-10, REQ-SEC-053)", () => {
    const REQ = id(6001);
    it("needs step-up, a reason, a real non-assistant session; replays idempotently; archives the row; keeps the original batch", async () => {
      const call = (req = REQ, reason = "Duplicate of bank import") => q<{ r: Record<string, unknown> }>(db, "SELECT public.reverse_ledger_entry($1,$2,$3) r", [req, e(25), reason]);
      expect(errorText(await attempt(db, U.O, () => call()))).toBe("STEP_UP_REQUIRED: reverse_ledger_entry");
      expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return call(); }, { clientId: MCP }))).toBe("STEP_UP_REQUIRED: reverse_ledger_entry");
      expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return call(REQ, "no"); }))).toMatch(/reason of at least five/);
      expect(errorText(await attempt(db, U.V, async () => { await stepUp(db, U.V); return call(); }))).toMatch(/Entry not found/);
      const before = await journalTb(db, U.O);
      const out = first(await as(db, U.O, async () => { await stepUp(db, U.O); return call(); })).r;
      expect(out["replayed"]).toBe(false);
      const replay = first(await as(db, U.O, async () => { await stepUp(db, U.O); return call(); })).r;
      expect(replay["replayed"]).toBe(true);
      // r2 (KK decision 1): the original stays in the working ledger, unchanged; a linked reversal row is added
      expect(await count(db, "SELECT 1 FROM public.expenses WHERE id = $1 AND reverses_entry_id IS NULL", [e(25)])).toBe(1);
      expect(out["reversalEntryId"]).toBeTruthy();
      const rev = first(await q<{ of: string; d: string; today: string; amount: string; t: string; acc: string; receipts: unknown[] }>(db,
        "SELECT reverses_entry_id::text \"of\", expense_date::text d, current_date::text today, amount::text, txn_type t, account_id::text acc, receipts FROM public.expenses WHERE id = $1", [out["reversalEntryId"]]));
      expect(rev).toMatchObject({ of: e(25), amount: "1800.00", t: "expense", acc: ACC.P2, receipts: [] });
      expect(rev.d).toBe(rev.today); // decision 2: dated on the correction date (default today, open period)
      const audit = first(await q<{ reason: string; actor_id: string; snap: Record<string, unknown>; n: number; m: number; rid: string; cd: string }>(db,
        "SELECT reason, actor_id, entry_snapshot snap, cardinality(batch_ids) n, cardinality(reversal_batch_ids) m, reversal_entry_id::text rid, correction_date::text cd FROM public.posting_reversals WHERE id = $1", [REQ]));
      expect(audit).toMatchObject({ reason: "Duplicate of bank import", actor_id: U.O, n: 1, m: 1, rid: out["reversalEntryId"], cd: rev.today });
      expect(audit.snap["id"]).toBe(e(25));
      expect((audit.snap["receipts"] as { path: string }[])[0]?.path).toBe(`${U.O}/receipts/r-25.jpg`); // source evidence kept
      expect(Array.isArray(audit.snap["_linked"])).toBe(true); // link states (P0-005a R4) recorded with the audit
      // a reversed original and its reversal are history: neither can be edited financially or deleted
      expect(errorText(await attempt(db, U.O, () => q(db, "UPDATE public.expenses SET amount = 1 WHERE id = $1", [e(25)])))).toMatch(/^P7_REVERSED_ENTRY/);
      expect(errorText(await attempt(db, U.O, () => q(db, "DELETE FROM public.expenses WHERE id = $1", [out["reversalEntryId"]])))).toMatch(/^P7_REVERSAL_HISTORY/);
      expect((await attempt(db, U.O, () => q(db, "UPDATE public.expenses SET tags = ARRAY['reviewed'] WHERE id = $1", [e(25)]))).ok).toBe(true); // metadata (DN-P3-11)
      expect(await allBatches(db, e(25))).toHaveLength(2); // original + mirror, nothing erased
      const after = await journalTb(db, U.O);
      expect(after[PERSONAL]?.["expense:Dining"]).toBeUndefined();
      expect((before[PERSONAL]?.["expense:Dining"] ?? 0)).toBe(1800);
      const ev = await count(db, "SELECT 1 FROM public.security_events WHERE owner_id = $1 AND event = 'sensitive_action_authorised' AND action = 'reverse_ledger_entry'", [U.O]);
      expect(ev).toBeGreaterThanOrEqual(1);
      // the receipt is released: the same evidence may back a corrected entry
      const reuse = await attempt(db, U.O, () => q(db, INSERT_EXPENSE, exParams({ id: id(5101), acc: ACC.P2, date: "2026-06-12", amount: 1700, receipts: [{ name: "r.jpg", type: "image/jpeg", path: `${U.O}/receipts/r-25.jpg` }] })));
      expect(reuse.ok).toBe(true);
    });

    it("refuses reversal inside a closed period (entity-aware) and while the entry is part of a linked transfer", async () => {
      const withClose = async (periods: unknown[], fn: () => Promise<unknown>) => attempt(db, null, async () => {
        await q(db, "INSERT INTO public.period_operation_authority(owner_id, transaction_id) VALUES ($1, txid_current())", [U.O]);
        await q(db, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{books,closedPeriods}', $2::jsonb) WHERE owner_id = $1", [U.O, JSON.stringify(periods)]);
        await q(db, "DELETE FROM public.period_operation_authority WHERE owner_id = $1", [U.O]);
        await actAs(db, U.O); await stepUp(db, U.O);
        return fn();
      });
      const rev = (entry: string, on: string | null = null) => () => q(db, "SELECT public.reverse_ledger_entry($1,$2,'Closed period probe',$3::date)", [id(6100), entry, on]);
      const c1Apr = [{ id: "c1-apr", from: "2026-04-01", to: "2026-04-30", entityId: C1 }];
      // r2 (decision 2): a correction dated inside the closed period is refused; nothing reopens automatically ...
      expect(errorText(await withClose(c1Apr, rev(e(5), "2026-04-20")))).toMatch(/^P7_CLOSED_PERIOD: the correction date 2026-04-20/);
      // ... and the same correction on today's date (open period) is allowed without reopening April
      const ok = await withClose(c1Apr, async () => { await rev(e(5))(); return q<{ n: number }>(db, "SELECT count(*)::int n FROM public.posting_batches WHERE owner_id = $1 AND kind = 'reversal' AND posting_date BETWEEN '2026-04-01' AND '2026-04-30'", [U.O]); });
      expect(ok).toEqual({ ok: true, value: [{ n: 0 }] }); // nothing posted into the closed April
      expect((await withClose(c1Apr, rev(e(7), "2026-04-20"))).ok).toBe(true); // personal April stays open
      // a linked transfer is reversed as ONE movement from its debit side; its receiving side cannot be reversed alone
      expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return rev(e(24))(); }))).toMatch(/^P7_COUNTERPART/);
      expect((await attempt(db, U.O, async () => { await stepUp(db, U.O); return rev(e(23))(); })).ok).toBe(true);
    });

    it("journal reversal is step-up, audited, exact mirror, once", async () => {
      const jreq = id(6201);
      const lines = [{ code: "expense:Audit accrual", role: "expense", debit: 5000, credit: 0 }, { code: "accrual:Audit", role: "liability", debit: 0, credit: 5000 }];
      const bid = first(await as(db, U.O, () => q<{ b: string }>(db, "SELECT public.post_journal_batch($1,$2,'2026-06-30',$3::jsonb,'Audit fee accrual June',$4::jsonb) b", [jreq, ent.c2, JSON.stringify(lines), JSON.stringify([{ kind: "document", key: DOC.journal }])]))).b;
      expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.reverse_journal_batch($1,$2,'Accrual not needed')", [id(6202), bid])))).toBe("STEP_UP_REQUIRED: reverse_journal_batch");
      await as(db, U.O, async () => { await stepUp(db, U.O); await q(db, "SELECT public.reverse_journal_batch($1,$2,'Accrual not needed')", [id(6202), bid]); });
      expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return q(db, "SELECT public.reverse_journal_batch($1,$2,'Again please')", [id(6203), bid]); }))).toMatch(/already reversed/);
      expect((await journalTb(db, U.O))[C2]?.["accrual:Audit"]).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe("4. idempotency and duplicate economic effects (requirement 7)", () => {
    it("upload retries with the same stable id post once", async () => {
      const r = await attempt(db, U.O, async () => {
        const x: Ex = { id: id(5201), acc: ACC.P1, date: "2026-07-03", amount: 640, category: "Fuel" };
        for (let i = 0; i < 3; i++) await q(db, INSERT_EXPENSE.replace(/\)$/, ") ON CONFLICT (id) DO NOTHING"), exParams(x));
        return count(db, "SELECT 1 FROM public.posting_batches b JOIN public.posting_events ev ON ev.id = b.event_id WHERE ev.event_key = 'ledger_entry:' || $1", [id(5201)]);
      });
      expect(r).toEqual({ ok: true, value: 1 });
    });

    it("the same statement row, card row or receipt can never carry a second economic effect", async () => {
      const dupBank = await attempt(db, U.O, () => q(db, INSERT_EXPENSE, exParams({ id: id(5301), acc: ACC.P1, date: "2026-06-05", amount: 2100, ref: "document:stmt-1 · L0042 · 2026-06-05 · 2100.00" })));
      expect(errorText(dupBank)).toMatch(/^P7_DUPLICATE_SOURCE: statement_row/);
      const dupCard = await attempt(db, U.O, () => q(db, INSERT_EXPENSE, exParams({ id: id(5302), acc: ACC.P2, date: "2026-06-10", amount: 15000, type: "income", ref: "document:card-1 · L0007 · 2026-06-10 · 15000.00" })));
      expect(errorText(dupCard)).toMatch(/^P7_DUPLICATE_SOURCE: statement_row/);
      const reconcileTwice = await attempt(db, U.O, () => q(db, "UPDATE public.expenses SET statement_ref = 'document:stmt-1 · L0050 · 2026-06-10 · 15000.00', reconciled_at = now() WHERE id = $1", [e(9)]));
      expect(errorText(reconcileTwice)).toMatch(/^P7_DUPLICATE_SOURCE/);
      // receipt + bank row + card row of the card payment = ONE event with all evidence bound to it
      const src = await q<{ k: string }>(db, `SELECT s.source_kind k FROM public.posting_event_sources s JOIN public.posting_events ev ON ev.id = s.event_id
        WHERE ev.event_key = 'ledger_entry:' || $1 AND s.released_at IS NULL ORDER BY 1`, [e(23)]);
      expect(src.map((s) => s.k)).toEqual(["counterpart_entry", "ledger_entry", "statement_row", "statement_row"]);
      expect(await count(db, "SELECT 1 FROM public.posting_events WHERE event_key = 'ledger_entry:' || $1", [e(24)])).toBe(0);
    });

    it("linking a transfer counterpart reverses the separately posted credit, so the movement counts once", async () => {
      const r = await attempt(db, U.O, async () => {
        await q(db, INSERT_EXPENSE, exParams({ id: id(5401), acc: ACC.P1, to: ACC.P3, date: "2026-07-04", amount: 900, type: "transfer", ref: "bank-L1" }));
        await q(db, INSERT_EXPENSE, exParams({ id: id(5402), acc: ACC.P3, date: "2026-07-04", amount: 900, type: "income", category: "Wallet credit", ref: "wallet-L9" }));
        const before = (await journalTb(db, U.O))[PERSONAL]?.["income:Wallet credit"];
        await q(db, "UPDATE public.expenses SET transfer_counterpart_of = $1 WHERE id = $2", [id(5401), id(5402)]);
        return { before, after: (await journalTb(db, U.O))[PERSONAL]?.["income:Wallet credit"], active: (await activeBatches(db, id(5402))).length };
      });
      expect(r).toEqual({ ok: true, value: { before: -900, after: undefined, active: 0 } });
    });

    it("reimbursement retries through finance_operation produce one entry and one posting; never income; the gross expense stays (decision 4)", async () => {
      const r = await attempt(db, U.O, async () => {
        await q(db, INSERT_EXPENSE, exParams({ id: id(5501), acc: ACC.P2, date: "2026-07-01", amount: 2000, category: "Medical", title: "Hospital (insurance claim)",
          reimb: { kind: "insurance", payer: "Star Health", reimbursable: 1500, receipts: [] }, reimbStatus: "pending" }));
        const payload = JSON.stringify({ operationId: "claim-op-1", id: id(5501), amount: 500, date: "2026-07-05", accountId: ACC.P1, note: "Part payment" });
        await q(db, "SELECT public.finance_operation('claim_receipt', $1::jsonb)", [payload]);
        await q(db, "SELECT public.finance_operation('claim_receipt', $1::jsonb)", [payload]);
        const ids = await q<{ id: string }>(db, "SELECT id FROM public.expenses WHERE employee_id = $1 AND txn_type = 'reimbursement' AND expense_date = '2026-07-05'", [U.O]);
        const batches = await count(db, "SELECT 1 FROM public.posting_batches b JOIN public.posting_events ev ON ev.id = b.event_id WHERE ev.source_entry_id = ANY($1::uuid[])", [ids.map((x) => x.id)]);
        return { n: ids.length, batches, tb: (await journalTb(db, U.O))[PERSONAL] };
      });
      if (!r.ok) throw new Error(r.error);
      expect(r.value.n).toBe(1);
      expect(r.value.batches).toBe(1);
      expect(r.value.tb?.["expense:Medical"]).toBe(3200); // gross expenses preserved: 1,200 (employee claim e15) + 2,000 (insurance claim)
      expect(r.value.tb?.["recovery:employer:Medical"]).toBe(-1200);  // separate recovery, not a reduction of the expense
      expect(r.value.tb?.["recovery:insurance:Medical"]).toBe(-1500);
      expect(r.value.tb?.[`receivable:claim:${id(5501)}`]).toBe(1000); // 1,500 claim less 500 received; settled, never income
      expect(r.value.tb?.[`receivable:claim:${e(15)}`]).toBeUndefined(); // fully received
      expect(Object.keys(r.value.tb ?? {}).filter((k) => k.startsWith("income:"))).not.toContain("income:Medical");
    });

    it("commit replays idempotently and a stale preview is refused", async () => {
      const again = await as(db, U.O, async () => { await stepUp(db, U.O); return q<{ r: Record<string, unknown> }>(db, "SELECT public.commit_posting_backfill($1,'x') r", [id(9001)]); }).catch((x: Error) => x.message);
      expect(String(again)).toMatch(/run id already used/);
      const p = await preview(db, U.O);
      const stale = await attempt(db, U.O, async () => { await q(db, "UPDATE public.expenses SET tags = ARRAY['x'] WHERE id = $1", [e(8)]); await stepUp(db, U.O); return q(db, "SELECT public.commit_posting_backfill($1,$2)", [id(9101), p.fingerprint]); });
      expect(errorText(stale)).toMatch(/^P7_PREVIEW_STALE/);
      expect(p.counts["proposals"]).toBe(0); // everything active is already posted: re-sync proposes nothing
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe("5. scope separation and access (DN-P3-5 B, DN-P3-7 B, DN-P3-14 B)", () => {
    it("company and personal books are separate legal entities in the same journal; no fictitious company", async () => {
      const kinds = await q<{ kind: string; k: string }>(db, `SELECT DISTINCT le.kind, le.entity_key k FROM public.posting_batches b JOIN public.legal_entities le ON le.id = b.legal_entity_id WHERE b.owner_id = $1 ORDER BY 2`, [U.O]);
      expect(kinds).toEqual([{ kind: "company", k: C1 }, { kind: "llp", k: C2 }, { kind: "individual_personal", k: PERSONAL }].sort((a, b) => a.k.localeCompare(b.k)));
    });

    it("owner reads everything; authorised accountant reads only C1; company member, other owner and stranger read nothing", async () => {
      const read = async (u: string, opts = {}) => {
        const r = await attempt(db, u, async () => q<{ k: string; n: number }>(db, `SELECT le.entity_key k, count(*)::int n FROM public.posting_batches b JOIN public.legal_entities le ON le.id = b.legal_entity_id
          WHERE b.owner_id = $1 GROUP BY 1 ORDER BY 1`, [U.O]), opts);
        return r.ok ? r.value.map((x) => x.k) : r.error;
      };
      expect(await read(U.O)).toEqual([C1, C2, PERSONAL].sort());
      expect(await read(U.A)).toEqual([C1]);
      expect(await read(U.M)).toEqual([]);
      expect(await read(U.V)).toEqual([]);
      expect(await read(U.X)).toEqual([]);
      const lines = await attempt(db, U.A, () => count(db, "SELECT 1 FROM public.posting_lines l JOIN public.posting_batches b ON b.id = l.batch_id WHERE b.legal_entity_id <> $1", [ent.c1]));
      expect(lines).toEqual({ ok: true, value: 0 });
      for (const t of ["posting_events", "posting_event_sources", "posting_reversals", "posting_backfill_runs"]) {
        expect(await attempt(db, U.A, () => count(db, `SELECT 1 FROM public.${t} WHERE owner_id = $1`, [U.O]))).toEqual({ ok: true, value: 0 });
      }
      // revocation takes effect on the next statement
      const revoked = await attempt(db, null, async () => {
        await q(db, "UPDATE public.access_grants SET revoked_at = now(), revoked_by = workspace_owner_id WHERE grantee_id = $1", [U.A]);
        await actAs(db, U.A);
        return count(db, "SELECT 1 FROM public.posting_batches WHERE owner_id = $1", [U.O]);
      });
      expect(revoked).toEqual({ ok: true, value: 0 });
      // an anonymous session holding the accountant's id never reads
      expect(await attempt(db, U.A, () => count(db, "SELECT 1 FROM public.posting_batches WHERE owner_id = $1", [U.O]), { anon: true })).toEqual({ ok: true, value: 0 });
    });

    it("cross-tenant writes are refused: another owner's entity, documents, entries and accounts", async () => {
      const lines = JSON.stringify([{ code: "expense:X", role: "expense", debit: 1, credit: 0 }, { code: "accrual:X", role: "liability", debit: 0, credit: 1 }]);
      expect(errorText(await attempt(db, U.V, () => q(db, "SELECT public.post_journal_batch($1,$2,'2026-07-01',$3::jsonb,'cross tenant',NULL)", [id(6301), ent.c1, lines])))).toMatch(/Legal entity unavailable/);
      expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.post_journal_batch($1,$2,'2026-07-01',$3::jsonb,'borrowed evidence',$4::jsonb)", [id(6302), ent.c1, lines, JSON.stringify([{ kind: "document", key: DOC.v }])])))).toMatch(/own documents/);
      expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.post_journal_batch($1,$2,'2026-07-01',$3::jsonb,'cross entity due',NULL)", [id(6303), ent.c1,
        JSON.stringify([{ code: `due:${ent.v}`, role: "asset", debit: 1, credit: 0 }, { code: "accrual:X", role: "liability", debit: 0, credit: 1 }])])))).toMatch(/one of your legal entities/);
      expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.post_journal_batch($1,$2,'2026-07-01',$3::jsonb,'bank via journal',NULL)", [id(6304), ent.c1,
        JSON.stringify([{ code: `account:${ACC.A1}`, role: "asset", debit: 1, credit: 0, accountId: ACC.A1 }, { code: "income:X", role: "income", debit: 0, credit: 1 }])])))).toMatch(/cannot move bank/);
      expect(errorText(await attempt(db, null, () => rawBatch(db, U.O, ent.v, [{ code: "a", role: "asset", debit: 1, credit: 0 }, { code: "b", role: "equity", debit: 0, credit: 1 }])))).toMatch(/violates foreign key|legal entity unavailable/i);
    });

    it("assistant sessions read (unless revoked) but never post, convert or reverse", async () => {
      const lines = JSON.stringify([{ code: "expense:X", role: "expense", debit: 1, credit: 0 }, { code: "accrual:X", role: "liability", debit: 0, credit: 1 }]);
      expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.post_journal_batch($1,$2,'2026-07-01',$3::jsonb,'assistant try',NULL)", [id(6401), ent.c1, lines]), { clientId: MCP }))).toBe("ASSISTANT_READ_ONLY: post_journal_batch");
      expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return q(db, "SELECT public.undo_posting_backfill($1,'assistant undo')", [id(9001)]); }, { clientId: MCP }))).toBe("STEP_UP_REQUIRED: undo_posting_backfill");
      expect(errorText(await attempt(db, U.O, () => q(db, INSERT_EXPENSE, exParams({ id: id(6402), acc: ACC.P1, date: "2026-07-01", amount: 1 })), { clientId: MCP }))).toMatch(/row-level security|ASSISTANT/);
      expect(await attempt(db, U.O, () => count(db, "SELECT 1 FROM public.posting_batches WHERE owner_id = $1", [U.O]), { clientId: MCP })).toMatchObject({ ok: true });
      const revoked = await attempt(db, U.O, async () => {
        await actAs(db, null);
        await q(db, "INSERT INTO public.revoked_assistant_clients(owner_id, client_id) VALUES ($1, $2)", [U.O, MCP]);
        await actAs(db, U.O, { clientId: MCP });
        return count(db, "SELECT 1 FROM public.posting_lines WHERE owner_id = $1", [U.O]);
      });
      expect(revoked).toEqual({ ok: true, value: 0 });
    });

    it("demo guests cannot convert, post, reverse or write posting tables directly (UI and API bypass)", async () => {
      const lines = JSON.stringify([{ code: "expense:X", role: "expense", debit: 1, credit: 0 }, { code: "accrual:X", role: "liability", debit: 0, credit: 1 }]);
      for (const anon of [false, true]) {
        expect(errorText(await attempt(db, U.G, () => q(db, "SELECT public.preview_posting_backfill()"), { anon }))).toMatch(/^P7_GUEST/);
        expect(errorText(await attempt(db, U.G, async () => { await stepUp(db, U.G); return q(db, "SELECT public.commit_posting_backfill($1,'fp')", [id(6501)]); }, { anon }))).toMatch(/^P7_GUEST/);
        expect(errorText(await attempt(db, U.G, () => q(db, "SELECT public.post_journal_batch($1,$2,'2026-07-01',$3::jsonb,'guest journal',NULL)", [id(6502), ent.c1, lines]), { anon }))).toMatch(/^P7_GUEST/);
        expect(errorText(await attempt(db, U.G, async () => { await stepUp(db, U.G); return q(db, "SELECT public.reverse_ledger_entry($1,$2,'guest reversal')", [id(6503), e(3)]); }, { anon }))).toMatch(/^P7_GUEST/);
        expect(errorText(await attempt(db, U.G, () => q(db, "INSERT INTO public.posting_batches(id, owner_id, legal_entity_id, event_id, kind, idempotency_key, posting_date) VALUES (gen_random_uuid(),$1,$2,gen_random_uuid(),'journal','g','2026-07-01')", [U.G, ent.c1]), { anon }))).toMatch(/permission denied/);
      }
      const status = await attempt(db, U.G, () => q<{ s: Record<string, unknown> }>(db, "SELECT public.posting_status() s"));
      expect(status.ok && first(status.value).s).toMatchObject({ installed: true, active: false, guest: true, canPost: false });
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe("6. closed periods and opening balances (DN-P3-3, DN-P3-4, DN-P3-8 B, DN-P3-13)", () => {
    it("the legacy entry guard and the posting guard agree, entity by entity, on every posted entry", async () => {
      const configs = [
        [{ id: "all-apr", from: "2026-04-01", to: "2026-04-30" }],
        [{ id: "c1-may", from: "2026-05-01", to: "2026-05-31", entityId: C1 }],
        [{ id: "p-may", from: "2026-05-01", to: "2026-05-31", entityId: PERSONAL }],
        [{ id: "c2-jun", from: "2026-06-01", to: "2026-06-30", entityId: C2 }],
      ];
      for (const periods of configs) {
        const r = await attempt(db, null, async () => {
          await q(db, "INSERT INTO public.period_operation_authority(owner_id, transaction_id) VALUES ($1, txid_current())", [U.O]);
          await q(db, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{books,closedPeriods}', $2::jsonb) WHERE owner_id = $1", [U.O, JSON.stringify(periods)]);
          return q<{ id: string; legacy: boolean; p7: boolean }>(db, `SELECT x.id, public.p5_entry_closed(x.employee_id, p.data->'books'->'closedPeriods', p.data->'books'->'entityAccounts', x.expense_date, x.entity_source, x.entity_id, x.account_id, x.to_account_id) legacy,
            coalesce((SELECT bool_or(phase3_p7.closed(x.employee_id, b.legal_entity_id, b.posting_date)) FROM public.posting_batches b JOIN public.posting_events ev ON ev.id = b.event_id
              WHERE ev.event_key = 'ledger_entry:' || x.id AND b.kind <> 'reversal' AND NOT EXISTS (SELECT 1 FROM public.posting_batches r WHERE r.reverses_id = b.id)), false) p7
            FROM public.expenses x JOIN public.finance_preferences p ON p.owner_id = x.employee_id
            WHERE x.employee_id = $1 AND EXISTS (SELECT 1 FROM public.posting_events ev JOIN public.posting_batches b ON b.event_id = ev.id WHERE ev.event_key = 'ledger_entry:' || x.id)`, [U.O]);
        });
        if (!r.ok) throw new Error(r.error);
        expect(r.value.length).toBeGreaterThan(15);
        expect(r.value.filter((x) => x.legacy !== x.p7)).toEqual([]);
        // r2 (KK decision 3): a personal-only period is enforced by BOTH guards (it was ignored by both before)
        expect(r.value.some((x) => x.legacy)).toBe(true);
      }
    });

    it("a company close blocks that company's postings only; backfill skips closed periods and reports them (DN-P3-4)", async () => {
      const fresh = await seededDb();
      await setClosedPeriods(fresh, U.O, [{ id: "c1-apr", from: "2026-04-01", to: "2026-04-30", entityId: C1, closedOn: "2026-05-02" }]);
      const p = await preview(fresh, U.O);
      const skipped = p.skippedClosed.map((x) => x["entryId"]).sort();
      expect(skipped).toEqual([e(1), e(3), e(4), e(5)].sort());
      expect(p.proposals.some((x) => x["entryId"] === e(7))).toBe(true); // personal April posts
      await activate(fresh, U.O);
      expect(await count(fresh, "SELECT 1 FROM public.posting_events WHERE source_entry_id = ANY($1::uuid[])", [[e(3), e(4), e(5)]])).toBe(0);
      // entity-aware: personal April edit allowed, Alpha April edit refused by both guards
      expect((await attempt(fresh, U.O, () => q(fresh, "UPDATE public.expenses SET amount = 3460, original_amount = 3460, allocations = '[]' WHERE id = $1", [e(7)]))).ok).toBe(true);
      expect(errorText(await attempt(fresh, U.O, () => q(fresh, "UPDATE public.expenses SET amount = 1 WHERE id = $1", [e(3)])))).toMatch(/closed period/i);
      const c1 = await entityId(fresh, U.O, C1), personal = await entityId(fresh, U.O, PERSONAL);
      const jl = JSON.stringify([{ code: "expense:Accrual", role: "expense", debit: 10, credit: 0 }, { code: "accrual:X", role: "liability", debit: 0, credit: 10 }]);
      expect(errorText(await attempt(fresh, U.O, () => q(fresh, "SELECT public.post_journal_batch($1,$2,'2026-04-15',$3::jsonb,'April accrual',NULL)", [id(6701), c1, jl])))).toMatch(/^P7_CLOSED_PERIOD/);
      expect((await attempt(fresh, U.O, () => q(fresh, "SELECT public.post_journal_batch($1,$2,'2026-04-15',$3::jsonb,'April accrual',NULL)", [id(6702), personal, jl]))).ok).toBe(true);
    });

    it("opening balances: a dated source-backed opening journal posts; no evidence or a static figure stays an exception", async () => {
      const ob = await q<{ k: string; code: string; s: string; kind: string }>(db, `SELECT le.entity_key k, l.code, l.signed_amount::float8::text s, b.kind FROM public.posting_lines l JOIN public.posting_batches b ON b.id = l.batch_id
        JOIN public.legal_entities le ON le.id = b.legal_entity_id JOIN public.posting_events ev ON ev.id = b.event_id WHERE ev.event_key = 'ledger_entry:' || $1 ORDER BY l.code`, [e(1)]);
      expect(ob).toEqual([{ k: C1, code: `account:${ACC.A1}`, s: "100000", kind: "opening" }, { k: C1, code: "equity:opening:2026-27", s: "-100000", kind: "opening" }]);
      expect(await count(db, "SELECT 1 FROM public.posting_events WHERE event_key = 'ledger_entry:' || $1", [e(2)])).toBe(0);
      const r = first(await as(db, U.O, () => q<{ r: { exceptions: { exception: string; accountId?: string; entryId?: string }[] } }>(db, "SELECT public.posting_reconciliation_report() r"))).r;
      expect(r.exceptions.filter((x) => x.exception.includes("opening")).map((x) => x.entryId ?? x.accountId).sort()).toEqual([ACC.P1, e(2)].sort());
      expect(await count(db, "SELECT 1 FROM public.posting_lines WHERE owner_id = $1 AND code LIKE 'equity:%' AND code <> 'equity:opening:2026-27'", [U.O])).toBe(0); // never a silent default
    });

    it("period close is blocked while entries are unposted or exceptions, and close/reopen evidence includes the postings", async () => {
      const exp = { closedPeriods: [], periodLog: [] };
      const close = (from: string, to: string, period: string, reqId: string) => q<{ r: Record<string, unknown> }>(db, "SELECT public.change_accounting_period($1,'closed',$2,$3,$4,'Month end close',$5::jsonb) r", [reqId, period, from, to, JSON.stringify(exp)]);
      expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return close("2026-06-01", "2026-06-30", "jun", id(6601)); }))).toMatch(/^P7_CLOSE_BLOCKED/);
      const ok = await attempt(db, U.O, async () => {
        await stepUp(db, U.O);
        const ev = first(await close("2026-05-01", "2026-05-31", "may", id(6602))).r;
        const stored = first(await q<{ e: Record<string, unknown> }>(db, "SELECT evidence e FROM public.period_close_evidence WHERE id = $1", [id(6602)])).e;
        const prefs = first(await q<{ d: { books: { closedPeriods: unknown[]; periodLog: unknown[] } } }>(db, "SELECT data d FROM public.finance_preferences WHERE owner_id = $1", [U.O])).d.books;
        await stepUp(db, U.O);
        await q(db, "SELECT public.change_accounting_period($1,'reopened','may',NULL,NULL,'Correction needed',$2::jsonb)", [id(6603), JSON.stringify({ closedPeriods: prefs.closedPeriods, periodLog: prefs.periodLog })]);
        const reopened = first(await q<{ e: Record<string, unknown> }>(db, "SELECT evidence e FROM public.period_close_evidence WHERE id = $1", [id(6603)])).e;
        return { ev, stored, reopened };
      });
      if (!ok.ok) throw new Error(ok.error);
      const snap = ok.value.stored["postings"] as { batches: string[]; debit: number; credit: number; sha256: string };
      expect(snap.batches.length).toBeGreaterThan(5);
      expect(snap.debit).toBe(snap.credit);
      expect(snap.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect((ok.value.reopened["postings"] as { sha256: string }).sha256).toBe(snap.sha256);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe("7. C11 at the posting path (RB-DEC-C11)", () => {
    it("an automatically classified row without explicit review cannot be saved for an active owner; approved rows batch-save", async () => {
      const auto = { classification: { source: "statement", automatic: true } };
      expect(errorText(await attempt(db, U.O, () => q(db, INSERT_EXPENSE, exParams({ id: id(7001), acc: ACC.P1, date: "2026-07-06", amount: 99, details: auto }))))).toMatch(/^C11_REVIEW_REQUIRED/);
      const many = await attempt(db, U.O, async () => {
        for (let i = 0; i < 5; i++) await q(db, INSERT_EXPENSE, exParams({ id: id(7010 + i), acc: ACC.P1, date: "2026-07-06", amount: 10 + i, details: { ...auto, review: { approvedAt: "2026-07-06T10:00:00Z", method: "row", key: `L${i}` } } }));
        return count(db, "SELECT 1 FROM public.posting_events WHERE source_entry_id = ANY($1::uuid[])", [[0, 1, 2, 3, 4].map((i) => id(7010 + i))]);
      });
      expect(many).toEqual({ ok: true, value: 5 });
      // a manual entry (no automatic classification) is the person's own decision
      expect((await attempt(db, U.O, () => q(db, INSERT_EXPENSE, exParams({ id: id(7020), acc: ACC.P1, date: "2026-07-06", amount: 12 })))).ok).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe("9. existing app write paths post through the one posting function (FND-01 inventory)", () => {
    it("post_opening_balances, move_expense_category, finance_operation and a direct save each post; undo of a posted opening is refused", async () => {
      const r = await attempt(db, U.O, async () => {
        const lines = (txn: string) => JSON.stringify([{ accountId: ACC.P3, amount: 750, sign: 1, txnId: txn, title: "Opening wallet", description: "Wallet opening FY 2026-27" }]);
        await q(db, "SELECT public.post_opening_balances($1,$2,'2026-27','2026-04-01',$3::jsonb,'[]'::jsonb,$4)", [id(8001), PERSONAL, lines(id(8002)), DOC.opening]);
        const opening = await activeBatches(db, id(8002));
        const undo = await errorOf(db, () => q(db, "SELECT public.undo_opening_balances($1)", [id(8001)]));
        await q(db, "SELECT public.post_opening_balances($1,$2,'2027-28','2027-04-01',$3::jsonb,'[]'::jsonb,NULL)", [id(8003), C2, JSON.stringify([{ accountId: ACC.B1, amount: 10, sign: 1, txnId: id(8004), title: "Opening", description: "" }])]);
        const noEvidence = await activeBatches(db, id(8004));
        await q(db, "SELECT public.move_expense_category('Rent','Premises rent')");
        const moved = (await journalTb(db, U.O))[C1];
        return { opening: opening.map((b) => b.kind), undo, noEvidence: noEvidence.length, moved };
      });
      if (!r.ok) throw new Error(r.error);
      expect(r.value.opening).toEqual(["opening"]);
      expect(r.value.undo).toMatch(/^P7_POSTED_ENTRY/);
      expect(r.value.noEvidence).toBe(0); // opening without source evidence: exception, never opening equity
      expect(r.value.moved?.["expense:Rent"]).toBeUndefined();
      expect(r.value.moved?.["expense:Premises rent"]).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe("8. undo of the conversion and erasure", () => {
    it("undo reverses every entry posting (history kept) and deactivates; replay is idempotent; later edits post nothing", async () => {
      const fresh = await seededDb();
      const run = id(9301);
      await activate(fresh, U.O, run);
      const before = await count(fresh, "SELECT 1 FROM public.posting_batches WHERE owner_id = $1", [U.O]);
      expect(errorText(await attempt(fresh, U.O, () => q(fresh, "SELECT public.undo_posting_backfill($1,'Wrong mapping')", [run])))).toBe("STEP_UP_REQUIRED: undo_posting_backfill");
      await as(fresh, U.O, async () => { await stepUp(fresh, U.O); await q(fresh, "SELECT public.undo_posting_backfill($1,'Wrong mapping')", [run]); });
      const replay = first(await as(fresh, U.O, async () => { await stepUp(fresh, U.O); return q<{ r: Record<string, unknown> }>(fresh, "SELECT public.undo_posting_backfill($1,'Wrong mapping') r", [run]); })).r;
      expect(replay["replayed"]).toBe(true);
      expect(await count(fresh, "SELECT 1 FROM public.posting_batches WHERE owner_id = $1", [U.O])).toBe(before * 2);
      expect(await journalTb(fresh, U.O)).toEqual({});
      await as(fresh, U.O, () => q(fresh, "UPDATE public.expenses SET amount = 51000, original_amount = 51000 WHERE id = $1", [e(3)]));
      await as(fresh, U.O, () => q(fresh, "DELETE FROM public.expenses WHERE id = $1", [e(3)])); // not active: deletes as today
      expect(await count(fresh, "SELECT 1 FROM public.posting_batches WHERE owner_id = $1", [U.O])).toBe(before * 2);
    });

    it("confirmed erasure removes the owner's posting records only", async () => {
      const fresh = await seededDb();
      await activate(fresh, U.O); await activate(fresh, U.V);
      const vBefore = await count(fresh, "SELECT 1 FROM public.posting_lines WHERE owner_id = $1", [U.V]);
      await as(fresh, U.O, async () => { await stepUp(fresh, U.O); await q(fresh, "SELECT public.delete_my_finance_data()"); });
      for (const t of ["posting_events", "posting_event_sources", "posting_batches", "posting_lines", "posting_reversals", "posting_backfill_runs"]) {
        expect([t, await count(fresh, `SELECT 1 FROM public.${t} WHERE owner_id = $1`, [U.O])]).toEqual([t, 0]);
      }
      expect(await count(fresh, "SELECT 1 FROM public.posting_lines WHERE owner_id = $1", [U.V])).toBe(vBefore);
    });
  });
});

// -----------------------------------------------------------------------------------------------
describe("P7 historical preservation, install order and rollback", () => {
  const CATALOG = `
    SELECT 'f' k, p.oid::regprocedure::text n, md5(p.prosrc) || coalesce(p.proacl::text, '') || p.prosecdef::text || coalesce(array_to_string(p.proconfig, ','), '') v FROM pg_proc p WHERE p.pronamespace IN ('public'::regnamespace, 'security_p4'::regnamespace)
    UNION ALL SELECT 't', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
    UNION ALL SELECT 'p', tablename || '.' || policyname, coalesce(qual, '') || coalesce(with_check, '') || array_to_string(roles, ',') || cmd FROM pg_policies WHERE schemaname = 'public'
    UNION ALL SELECT 'r', c.relname, c.relkind::text || coalesce(c.relacl::text, '') || c.relrowsecurity::text FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace
    UNION ALL SELECT 'c', table_name || '.' || column_name, data_type || is_nullable || coalesce(column_default, '') FROM information_schema.columns WHERE table_schema = 'public'
    UNION ALL SELECT 'n', nspname, coalesce(nspacl::text, '') FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema', 'security_rollback_archive')
    UNION ALL SELECT 'g', proname || '(' || identity_args || ')', mode FROM security_p4.guarded_functions ORDER BY 1, 2`;
  const catalog = async (db: Db) => { await actAs(db, null); return (await q<{ k: string; n: string; v: string }>(db, CATALOG)).map((r) => `${r.k}|${r.n}|${r.v}`); };
  // Tables that the step-up / audit machinery legitimately writes during the owner's confirmed actions.
  const SECURITY_LOGS = /^(step_up_grants|security_events)$/;

  it("installing P7, previewing, committing the backfill and rolling back never changes a pre-existing row; catalog returns exactly", async () => {
    const db = await seededDb([]);
    const tables = await publicTables(db, SECURITY_LOGS);
    const ADDED = ["reverses_entry_id"]; // the one column P7 r2 adds (decision 1); NULL on every pre-existing row
    const before = await dataSnapshot(db, tables);
    const cat0 = await catalog(db);
    await actAs(db, null);
    await db.exec(readSql(P7));
    expect(await dataSnapshot(db, tables, ADDED)).toEqual(before); // install alone
    expect(await count(db, "SELECT 1 FROM public.expenses WHERE reverses_entry_id IS NOT NULL")).toBe(0);
    expect(errorText(await attempt(db, null, () => db.exec(readSql(P7))))).toMatch(/already installed/);
    await preview(db, U.O);
    await activate(db, U.O); await activate(db, U.V);
    expect(await dataSnapshot(db, tables, ADDED)).toEqual(before); // reviewed backfill writes only P7 tables
    const batches = await count(db, "SELECT 1 FROM public.posting_batches");
    expect(batches).toBeGreaterThan(20);
    // per-row hash of every pre-existing ledger row, before vs after
    const rowHashes = async () => q<{ id: string; h: string }>(db, "SELECT id::text, md5((to_jsonb(x) - 'reverses_entry_id')::text) h FROM public.expenses x ORDER BY id");
    const rows = await rowHashes();
    expect(rows.length).toBe(LEDGER.length + 1);
    // P5 rollback refuses while P7 is installed; P7 rollback refuses without the archive flag
    expect(errorText(await attempt(db, null, () => db.exec(readSql(P5_RB))))).toMatch(/P7_balanced_posting is installed/);
    expect(errorText(await attempt(db, null, () => db.exec(readSql(P7_RB))))).toMatch(/postings exist/);
    await actAs(db, null);
    await db.exec(`SET phase3_p7.rollback_archive_postings = 'on'; ${readSql(P7_RB)}; RESET phase3_p7.rollback_archive_postings;`);
    expect(await dataSnapshot(db, tables)).toEqual(before);
    expect(await rowHashes()).toEqual(rows);
    expect(await catalog(db)).toEqual(cat0);
    const archived = await q<{ t: string }>(db, "SELECT relname t FROM pg_class WHERE relnamespace = 'security_rollback_archive'::regnamespace AND relkind = 'r' AND relname LIKE 'p7_%' ORDER BY 1");
    expect(archived.map((r) => r.t.replace(/_\d{8}T\d{12}$/i, ""))).toEqual(["p7_posting_backfill_runs", "p7_posting_batches", "p7_posting_delegations", "p7_posting_event_sources", "p7_posting_events",
      "p7_posting_lines", "p7_posting_link_states", "p7_posting_request_decisions", "p7_posting_requests", "p7_posting_reversals", "p7_statement_upload_reversals"]);
    expect(first(await q<{ n: number }>(db, `SELECT count(*)::int n FROM security_rollback_archive."${archived.find((r) => r.t.startsWith("p7_posting_batches"))!.t}"`)).n).toBe(batches);
    // reinstall works after rollback; P5 rollback then works once P7 is gone
    await db.exec(readSql(P7));
    await db.exec(readSql(P7_RB));
    await db.exec(readSql(P5_RB));
  }, T);

  it("refuses to install without P5, or together with the superseded P3", async () => {
    const { fullSchemaDb } = await import("../test/full-schema-pglite");
    const { P1, P2, P4, P5 } = await import("../test/phase3-fixture");
    await expect(fullSchemaDb([P1, P2, P4, P7])).rejects.toThrow(/requires P5/);
    await expect(fullSchemaDb([P1, P2, P4, P5, P7, ".lovable/staged-sql/proposed/P3_accounting_posting_layer.sql"])).rejects.toThrow(/superseded by P7/);
  }, T);
});
