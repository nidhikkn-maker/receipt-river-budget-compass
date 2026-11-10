// @vitest-environment node
// P0-034 (KK approved): PROPOSED P16 (.lovable/staged-sql/proposed/P16_statement_undo_withdraw.sql) — direct database tests
// of Statement Desk Undo: unposted rows the upload created are withdrawn (recoverable, reason/actor/time/source), posted rows get
// P7's linked reversal, matched pre-existing rows only lose the match; forged manifests, other owners, withdrawn rows and the
// internal function are refused; the rollback restores P7's body byte-for-byte and the DELETE path then fails closed under P10.
// Isolated in-memory PGlite: drizzle/migrations + P1 + P2 + P4 + P5 + P7 + P10 (+ P16). Never Cloud.
import { beforeAll, describe, expect, it } from "vitest";
import { actAs, readSql } from "../test/full-schema-pglite";
import { ACC, DIR, INSERT_EXPENSE, P7, T, U, activate, as, attempt, e, errorText, exParams, first, id, q, seededDb, stepUp, type Db, type Ex } from "../test/phase3-fixture";

const P10 = `${DIR}P10_unposted_entry_withdrawal.sql`;
const P16 = `${DIR}P16_statement_undo_withdraw.sql`;
const P16_RB = `${DIR}P16_statement_undo_withdraw.rollback.sql`;
const UP = id(8601), UP2 = id(8611);
const POSTED = id(8602), UNPOSTED = id(8603), UNPOSTED2 = id(8604);
const REASON = 'Statement Desk Undo of "July bank"';

/** The function bodies P16 touches, the probe and the schema, as the catalog has them. */
async function catalog(db: Db) {
  await actAs(db, null);
  return first(await q<Record<string, unknown>>(db, `SELECT
    (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.reverse_statement_upload__unguarded(uuid,uuid,jsonb,text)')) body,
    (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.reverse_statement_upload(uuid,uuid,jsonb,text)')) wrapper,
    (SELECT proacl::text FROM pg_proc WHERE oid = to_regprocedure('public.reverse_statement_upload(uuid,uuid,jsonb,text)')) acl,
    to_regprocedure('public.statement_undo_withdraws()') IS NOT NULL probe, to_regnamespace('phase3_p16') IS NOT NULL schema`));
}
const rowOf = async (db: Db, rid: string) => { await actAs(db, null); return (await q<{ j: Record<string, unknown> }>(db, "SELECT to_jsonb(x) j FROM public.expenses x WHERE id = $1", [rid]))[0]?.j; };
const withdrawalOf = (r: Record<string, unknown> | undefined) => ((r?.["receipt_details"] as Record<string, unknown> | null)?.["withdrawal"] ?? null) as null | { state: string; by: string; reason: string; history: { action: string; source?: Record<string, unknown> }[] };
async function saveUpload(db: Db, uploadId: string, posted: string[], reconciled: string[]) {
  await actAs(db, null);
  await q(db, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{statementUploads}', coalesce(data->'statementUploads','[]'::jsonb) || $2::jsonb) WHERE owner_id = $1",
    [U.O, JSON.stringify([{ id: uploadId, at: "2026-07-24T10:00:00Z", label: "July bank", posted, reconciled, status: "complete" }])]);
}
async function manifest(db: Db, posted: string[], reconciled: string[]) {
  await actAs(db, null);
  const snaps = await q<{ s: Record<string, unknown> }>(db, "SELECT to_jsonb(x) s FROM public.expenses x WHERE id = ANY($1::uuid[]) ORDER BY id", [[...posted, ...reconciled]]);
  return snaps.map(({ s }) => ({ action: posted.includes(String(s["id"])) ? "remove" : "unreconcile", ref: s["statement_ref"], snapshot: s }));
}
const undo = (db: Db, uploadId: string, items: unknown, reason = REASON) =>
  q<{ r: { reversed: { entryId: string; reversalEntryId: string }[]; withdrawn: string[]; deleted: string[]; unreconciled: string[]; replayed: boolean } }>(db,
    "SELECT public.reverse_statement_upload($1,$1,$2::jsonb,$3) r", [uploadId, JSON.stringify(items), reason]);
const undoAs = (db: Db, uploadId: string, items: unknown) => as(db, U.O, async () => { await stepUp(db, U.O); return first(await undo(db, uploadId, items)).r; });
const tryUndo = (db: Db, uid: string, uploadId: string, items: unknown) => attempt(db, uid, async () => { await stepUp(db, uid); return undo(db, uploadId, items); });

describe("P16 Statement Desk Undo withdraws unposted created rows (direct database)", () => {
  let db: Db;
  let before: Record<string, unknown>;
  beforeAll(async () => {
    db = await seededDb([P7, P10]);
    await activate(db, U.O);
    before = await catalog(db);
    await actAs(db, null);
    await db.exec(readSql(P16));
    // One upload: a row on the personal savings account (posted on active books), two never-posted rows (no account: listed
    // exceptions), each with this upload's statement reference; e21 existed before and was only matched.
    const rows: Ex[] = [
      { id: POSTED, acc: ACC.P1, date: "2026-07-22", amount: 410, category: "Food", ref: "document:stmt-9 · L0001 · 2026-07-22 · 410.00" },
      { id: UNPOSTED, acc: null, date: "2026-07-23", amount: 60, category: "Food", ref: "document:stmt-9 · L0002 · 2026-07-23 · 60.00", receipts: [{ name: "bill.jpg", type: "image/jpeg", path: `${U.O}/bill.jpg` }] },
      { id: UNPOSTED2, acc: null, date: "2026-07-23", amount: 60, category: "Food", ref: "document:stmt-9 · L0003 · 2026-07-23 · 60.00" },
    ];
    await as(db, U.O, async () => {
      for (const x of rows) await q(db, INSERT_EXPENSE, exParams(x));
      await q(db, "UPDATE public.expenses SET statement_ref = 'document:stmt-9 · L0004 · 2026-06-03 · 2100.00', reconciled_at = now() WHERE id = $1", [e(21)]);
    });
    await saveUpload(db, UP, [POSTED, UNPOSTED, UNPOSTED2], [e(21)]);
  }, T);

  it("posted → linked reversal; unposted → withdrawn with reason, actor, time and source (row, receipts, statement ref kept); matched → match cleared only; replay idempotent", async () => {
    const items = await manifest(db, [POSTED, UNPOSTED, UNPOSTED2], [e(21)]);
    const r0 = { posted: await rowOf(db, POSTED), unposted: await rowOf(db, UNPOSTED) };
    const res = await undoAs(db, UP, items);
    expect(res.reversed.map((x) => x.entryId)).toEqual([POSTED]);
    expect([...res.withdrawn].sort()).toEqual([UNPOSTED, UNPOSTED2].sort());
    expect(res.deleted).toEqual([]);
    expect(res.unreconciled).toEqual([e(21)]);
    expect(await rowOf(db, POSTED)).toEqual(r0.posted); // the reversed original is byte-identical (P7 decision 1)
    const w = await rowOf(db, UNPOSTED);
    expect(withdrawalOf(w)).toMatchObject({ state: "withdrawn", by: U.O, reason: `Statement upload undone: ${REASON}` });
    expect(withdrawalOf(w)!.history[0]!.source).toEqual({ kind: "statement_undo", upload: UP, request: UP, statementRef: r0.unposted!["statement_ref"], reconciledAt: r0.unposted!["reconciled_at"] ?? null });
    for (const k of ["amount", "expense_date", "account_id", "statement_ref", "receipts", "title"]) expect([k, w![k]]).toEqual([k, r0.unposted![k]]);
    const e21 = await rowOf(db, e(21));
    expect([e21!["statement_ref"], e21!["reconciled_at"], withdrawalOf(e21)]).toEqual([null, null, null]);
    // Withdrawn rows count nowhere in the posted books either: no posting event was ever created for them.
    expect(first(await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.posting_events WHERE event_key = ANY($1)", [[`ledger_entry:${UNPOSTED}`, `ledger_entry:${UNPOSTED2}`]])).n).toBe(0);
    const receipt = first(await q<{ reason: string; actor_id: string }>(db, "SELECT reason, actor_id FROM public.statement_upload_reversals WHERE id = $1", [UP]));
    expect(receipt).toEqual({ reason: REASON, actor_id: U.O });
    // Repeat (lost response, double tap): replayed, nothing changes, history still one event.
    const again = await undoAs(db, UP, items);
    expect(again).toMatchObject({ replayed: true, withdrawn: res.withdrawn });
    expect(withdrawalOf(await rowOf(db, UNPOSTED))!.history).toHaveLength(1);
  }, T);

  it("refusals: forged manifest (a pre-existing entry as 'created'), another owner, a withdrawn manifest row, the internal function; nothing changes", async () => {
    // A second upload created one never-posted row; the forged manifest also lists e22 (pre-existing, not created by it).
    const fresh = id(8612);
    await as(db, U.O, async () => { await q(db, INSERT_EXPENSE, exParams({ id: fresh, acc: null, date: "2026-07-25", amount: 75, category: "Food", ref: "document:stmt-10 · L0001 · 2026-07-25 · 75.00" })); });
    await saveUpload(db, UP2, [fresh], []);
    const forged = await manifest(db, [fresh, e(22)], []);
    expect(errorText(await tryUndo(db, U.O, UP2, forged))).toMatch(/does not match the saved upload/);
    expect(errorText(await tryUndo(db, U.V, UP2, await manifest(db, [fresh], [])))).toMatch(/Upload history is unavailable|does not match/);
    expect(errorText(await attempt(db, U.O, () => q(db, "SELECT phase3_p16.withdraw_upload_entry($1,$2,'Statement upload undone',$3,$3,NULL)", [U.O, fresh, UP2])))).toMatch(/permission denied/);
    // The row the upload created was withdrawn by hand since (it carries no statement reference here): Undo refuses, keeps it.
    await as(db, U.O, async () => { await q(db, "UPDATE public.expenses SET statement_ref = NULL WHERE id = $1", [fresh]); await q(db, "SELECT public.withdraw_entry($1,'Entered twice by mistake')", [fresh]); });
    expect(errorText(await tryUndo(db, U.O, UP2, await manifest(db, [fresh], [])))).toMatch(/^P16_WITHDRAWN/);
    expect(withdrawalOf(await rowOf(db, fresh))!.history).toHaveLength(1);
    expect(withdrawalOf(await rowOf(db, e(22)))).toBeNull();
    expect(first(await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.statement_upload_reversals WHERE id = $1", [UP2])).n).toBe(0);
  }, T);

  it("rollback restores P7's body byte-for-byte; afterwards, under P10, the never-posted DELETE fails closed and the Undo-withdrawn rows stay withdrawn", async () => {
    const applied = await catalog(db);
    expect(applied).toMatchObject({ probe: true, schema: true, wrapper: before["wrapper"], acl: before["acl"] });
    expect(applied["body"]).not.toBe(before["body"]);
    await actAs(db, null);
    await db.exec(readSql(P16_RB));
    expect(await catalog(db)).toEqual(before);
    // An Undo whose upload created a never-posted row: P7's DELETE is refused by P10 and the whole Undo rolls back.
    const third = id(8621), up3 = id(8622);
    await as(db, U.O, async () => { await q(db, INSERT_EXPENSE, exParams({ id: third, acc: null, date: "2026-07-26", amount: 90, category: "Food", ref: "document:stmt-11 · L0001 · 2026-07-26 · 90.00" })); });
    await saveUpload(db, up3, [third], []);
    expect(errorText(await tryUndo(db, U.O, up3, await manifest(db, [third], [])))).toMatch(/P10_WITHDRAW_ONLY/);
    expect(await rowOf(db, third)).toBeDefined();
    expect(withdrawalOf(await rowOf(db, UNPOSTED))!.state).toBe("withdrawn");
    // Re-applying P16 is safe.
    await actAs(db, null);
    await db.exec(readSql(P16));
    expect((await catalog(db))["body"]).toBe(applied["body"]);
  }, T);
});
