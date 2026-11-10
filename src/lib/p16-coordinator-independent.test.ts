// @vitest-environment node
// Coordinator's INDEPENDENT check of P0-034 / proposed P16 (Track D, 10 Nov 2026), written separately from Track A's tests.
// Isolated in-memory PGlite (applied migrations + P1 P2 P4 P5 P7 P10 P16). Never Cloud.
// Owner decision: Undo withdraws (recoverably) only the unposted rows the upload created; pre-existing matched rows only lose
// the match; repeat/retry is idempotent; a refused Undo changes nothing; restore only through the authorised operation.
import { beforeAll, describe, expect, it } from "vitest";
import { actAs, readSql } from "../test/full-schema-pglite";
import { ACC, DIR, INSERT_EXPENSE, P7, T, U, as, exParams, first, id, q, seededDb, stepUp, type Db, type Ex } from "../test/phase3-fixture";
import { ledgerView, txnFromRow, type LedgerRow, type Txn } from "./ledger";
import { withdrawnAtOfRow } from "./withdrawal";

const P10 = `${DIR}P10_unposted_entry_withdrawal.sql`;
const P16 = `${DIR}P16_statement_undo_withdraw.sql`;
const UP = id(7701), UP2 = id(7702), REQ2 = id(7703);
const MADE_A = id(7711), MADE_B = id(7712), OLD = id(7713), MADE_C = id(7714), MADE_D = id(7715);
const REASON = "Imported the wrong statement file";

const rows = async (db: Db) => { await actAs(db, null); return (await q<LedgerRow & Record<string, unknown>>(db, "SELECT * FROM public.expenses WHERE employee_id = $1", [U.O])); };
const state = async (db: Db, ids: string[]) => { await actAs(db, null); return q<{ id: string; j: unknown }>(db, "SELECT id, to_jsonb(x) - 'updated_at' j FROM public.expenses x WHERE id = ANY($1::uuid[]) ORDER BY id", [ids]); };
/** Wallet spend as every screen reads it: rows → txnFromRow → ledgerView (withdrawn excluded there only). */
async function walletSpend(db: Db) {
  const txns: Txn[] = (await rows(db)).map((r) => ({ ...txnFromRow(r), withdrawnAt: withdrawnAtOfRow(r) ?? null }));
  return ledgerView(txns).filter((t) => t.accountId === ACC.P3 && t.txnType === "expense").reduce((s, t) => s + Math.round(t.amount * 100), 0) / 100;
}
async function saveUpload(db: Db, uploadId: string, posted: string[], reconciled: string[]) {
  await actAs(db, null);
  await q(db, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{statementUploads}', coalesce(data->'statementUploads','[]'::jsonb) || $2::jsonb) WHERE owner_id = $1",
    [U.O, JSON.stringify([{ id: uploadId, at: "2026-07-24T10:00:00Z", label: "wallet.pdf", posted, reconciled, status: "complete" }])]);
}
async function manifest(db: Db, remove: string[], unreconcile: string[]) {
  await actAs(db, null);
  const snaps = await q<{ s: Record<string, unknown> }>(db, "SELECT to_jsonb(x) s FROM public.expenses x WHERE id = ANY($1::uuid[]) ORDER BY id", [[...remove, ...unreconcile]]);
  return snaps.map(({ s }) => ({ action: remove.includes(String(s["id"])) ? "remove" : "unreconcile", ref: s["statement_ref"], snapshot: s }));
}
/** Run as uid in a COMMITTED transaction (the fixture's attempt() always rolls back): a refusal raises and nothing persists. */
async function commit<R>(db: Db, uid: string, fn: () => Promise<R>): Promise<{ ok: true; value: R } | { ok: false; error: string }> {
  try { return { ok: true, value: await as(db, uid, fn) }; } catch (e) { return { ok: false, error: (e as Error).message }; }
}
const undo = (db: Db, uid: string, request: string, upload: string, items: unknown) =>
  commit(db, uid, async () => { await stepUp(db, uid); return first(await q<{ r: { withdrawn: string[]; deleted: string[]; unreconciled: string[]; replayed: boolean } }>(db,
    "SELECT public.reverse_statement_upload($1,$2,$3::jsonb,$4) r", [request, upload, JSON.stringify(items), REASON])).r; });
const why = (r: { ok: boolean; error?: string }) => (r.ok ? "" : r.error ?? "");

describe("P0-034 / P16, checked independently", () => {
  let db: Db;
  let firstItems: unknown;
  beforeAll(async () => {
    db = await seededDb([P7, P10]);
    await actAs(db, null);
    await db.exec(readSql(P16));
    // Wallet (opening 0). OLD existed before the upload (₹999). The upload created two IDENTICAL legitimate ₹60 coffees on the
    // same day (separate statement lines) and matched OLD to its line.
    const made: Ex[] = [
      { id: MADE_A, acc: ACC.P3, date: "2026-07-20", amount: 60, title: "Coffee", ref: "document:wallet-jul · L0001 · 2026-07-20 · 60.00" },
      { id: MADE_B, acc: ACC.P3, date: "2026-07-20", amount: 60, title: "Coffee", ref: "document:wallet-jul · L0002 · 2026-07-20 · 60.00" },
      { id: OLD, acc: ACC.P3, date: "2026-07-18", amount: 999, title: "Books" },
    ];
    await as(db, U.O, async () => {
      for (const x of made) await q(db, INSERT_EXPENSE, exParams(x));
      await q(db, "UPDATE public.expenses SET statement_ref = 'document:wallet-jul · L0003 · 2026-07-18 · 999.00', reconciled_at = now() WHERE id = $1", [OLD]);
    });
    await saveUpload(db, UP, [MADE_A, MADE_B], [OLD]);
  }, T);

  it("before Undo the wallet shows all three rows (hand figure 60 + 60 + 999 = 1,119.00)", async () => {
    expect(await walletSpend(db)).toBe(1119);
  });

  it("a forged manifest that marks the pre-existing row for removal is refused and changes nothing", async () => {
    const before = await state(db, [MADE_A, MADE_B, OLD]);
    const r = await undo(db, U.O, id(7790), UP, await manifest(db, [MADE_A, MADE_B, OLD], []));
    expect(r.ok).toBe(false);
    expect(await state(db, [MADE_A, MADE_B, OLD])).toEqual(before);
  }, T);

  it("another account cannot Undo this upload", async () => {
    const before = await state(db, [MADE_A, MADE_B, OLD]);
    const r = await undo(db, U.V, id(7791), UP, await manifest(db, [MADE_A, MADE_B], [OLD]));
    expect(r.ok).toBe(false);
    expect(await state(db, [MADE_A, MADE_B, OLD])).toEqual(before);
  }, T);

  it("Undo withdraws exactly the two created rows (both identical twins), keeps them and their evidence, and only unmatches OLD", async () => {
    const before = Object.fromEntries((await rows(db)).map((r) => [r.id, r]));
    firstItems = await manifest(db, [MADE_A, MADE_B], [OLD]);
    const r = await undo(db, U.O, UP, UP, firstItems);
    expect(r.ok, why(r)).toBe(true);
    if (!r.ok) return;
expect([...r.value.withdrawn].sort()).toEqual([MADE_A, MADE_B].sort());
    expect(r.value.deleted).toEqual([]);
    expect(r.value.unreconciled).toEqual([OLD]);
    const after = Object.fromEntries((await rows(db)).map((r) => [r.id, r]));
    for (const k of [MADE_A, MADE_B]) {
      expect(after[k], "row kept, never deleted").toBeDefined();
      for (const col of ["amount", "expense_date", "statement_ref", "account_id", "title", "receipts"]) expect([col, after[k]![col]]).toEqual([col, before[k]![col]]);
      const w = (after[k]!["receipt_details"] as { withdrawal: { state: string; by: string; at: string; reason: string } }).withdrawal;
      expect(w.state).toBe("withdrawn");
      expect(w.by).toBe(U.O);
      expect(w.reason).toContain(REASON);
      expect(Number.isNaN(Date.parse(w.at))).toBe(false);
    }
    expect(withdrawnAtOfRow(after[OLD]!)).toBeFalsy();
    expect(after[OLD]!["reconciled_at"]).toBeNull();
    // Hand figure: only the pre-existing ₹999 remains in every reader built on ledgerView.
    expect(await walletSpend(db)).toBe(999);
  }, T);

  it("repeat Undo (same request) replays without change; a fresh Undo of the same upload changes nothing", async () => {
    const before = await state(db, [MADE_A, MADE_B, OLD]);
    // A true retry (lost response, double tap) resends the same request and manifest: replayed, nothing changes.
    const again = await undo(db, U.O, UP, UP, firstItems);
    expect(again.ok && again.value.replayed, why(again)).toBe(true);
    // The same request id with a re-read (different) manifest is refused, never applied twice.
    expect((await undo(db, U.O, UP, UP, await manifest(db, [MADE_A, MADE_B], [OLD]))).ok).toBe(false);
    const fresh = await undo(db, U.O, REQ2, UP, await manifest(db, [MADE_A, MADE_B], [OLD]));
    expect(fresh.ok).toBe(false);
    expect(await state(db, [MADE_A, MADE_B, OLD])).toEqual(before);
    expect(await walletSpend(db)).toBe(999);
  }, T);

  it("withdrawal can't be undone by a direct table write, and the entry can't be re-inserted under its id", async () => {
    // Refused or silently filtered — either way the withdrawal (reason, actor, time, source) must survive.
    await commit(db, U.O, () => q(db, "UPDATE public.expenses SET receipt_details = receipt_details - 'withdrawal' WHERE id = $1", [MADE_A]));
    await commit(db, U.O, () => q(db, "UPDATE public.expenses SET amount = 1 WHERE id = $1", [MADE_A]));
    const kept = (await rows(db)).find((r) => r.id === MADE_A)!;
    expect(withdrawnAtOfRow(kept)).toBeTruthy();
    expect(Number(kept["amount"])).toBe(60);
    await as(db, U.O, () => q(db, `${INSERT_EXPENSE} ON CONFLICT (id) DO NOTHING`, exParams({ id: MADE_A, acc: ACC.P3, date: "2026-07-20", amount: 60, title: "Coffee" })));
    expect(withdrawnAtOfRow((await rows(db)).find((r) => r.id === MADE_A)!)).toBeTruthy();
    expect(await walletSpend(db)).toBe(999);
  }, T);

  it("Restore goes through the authorised operation only, with a reason, and the figure returns", async () => {
    const noReason = await commit(db, U.O, () => q(db, "SELECT public.restore_entry($1, $2)", [MADE_A, "x"]));
    expect(noReason.ok).toBe(false);
    const other = await commit(db, U.V, () => q(db, "SELECT public.restore_entry($1, $2)", [MADE_A, "Not my entry at all"]));
    expect(other.ok).toBe(false);
    const ok = await commit(db, U.O, () => q(db, "SELECT public.restore_entry($1, $2)", [MADE_A, "This coffee was real after all"]));
    expect(ok.ok, why(ok)).toBe(true);
    expect(await walletSpend(db)).toBe(1059); // 999 + 60
  }, T);

  it("an Undo refused part-way (one created row since matched to other evidence) leaves every row unchanged", async () => {
    await as(db, U.O, async () => {
      await q(db, INSERT_EXPENSE, exParams({ id: MADE_C, acc: ACC.P3, date: "2026-07-21", amount: 25, title: "Tea", ref: "document:wallet-jul2 · L0001 · 2026-07-21 · 25.00" }));
      await q(db, INSERT_EXPENSE, exParams({ id: MADE_D, acc: ACC.P3, date: "2026-07-21", amount: 35, title: "Snack", ref: "document:wallet-jul2 · L0002 · 2026-07-21 · 35.00" }));
    });
    await saveUpload(db, UP2, [MADE_C, MADE_D], []);
    const items = await manifest(db, [MADE_C, MADE_D], []);
    // Since the upload, MADE_D was matched to a different statement line (reconciled elsewhere).
    await as(db, U.O, () => q(db, "UPDATE public.expenses SET statement_ref = 'document:other-bank · L0009 · 2026-07-21 · 35.00', reconciled_at = now() WHERE id = $1", [MADE_D]));
    const before = await state(db, [MADE_C, MADE_D]);
    const r = await undo(db, U.O, UP2, UP2, items);
    expect(r.ok).toBe(false);
    expect(await state(db, [MADE_C, MADE_D])).toEqual(before);
    expect(await walletSpend(db)).toBe(1119); // 1,059 + 25 + 35
  }, T);
});
