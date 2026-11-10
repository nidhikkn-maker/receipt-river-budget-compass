// @vitest-environment node
// Coordinator's independent checks of proposed P7 (written separately from the Phase 3 developer's tests):
// every posted batch balances per currency, nobody (not even the superuser) can rewrite or delete posted lines,
// a posted entry cannot be hard-deleted, and other owners read none of the journal. Isolated PGlite only.
import { describe, expect, it } from "vitest";
import { actAs } from "@/test/full-schema-pglite";
import { U, activate, id, seededDb, stepUp } from "@/test/phase3-fixture";

type Db = Awaited<ReturnType<typeof seededDb>>;
async function err(db: Db, sql: string, params: readonly unknown[] = []): Promise<string> {
  try { await db.query(sql, [...params]); return ""; } catch (e) { return String((e as Error).message); }
}

describe("P7 coordinator independent checks", () => {
  it("balanced per batch and currency, immutable for every role, no hard delete of posted entries, owner-only reads", async () => {
    const db = await seededDb();
    await activate(db, U.O);
    await actAs(db, null);

    const lines = (await db.query<{ n: number }>("SELECT count(*)::int n FROM public.posting_lines WHERE owner_id=$1", [U.O])).rows[0]!.n;
    expect(lines).toBeGreaterThan(0);
    // Every batch balances in each currency (computed here, independently of the SQL's own check).
    const unbalanced = await db.query("SELECT batch_id, currency FROM public.posting_lines GROUP BY batch_id, currency HAVING sum(debit) <> sum(credit)");
    expect(unbalanced.rows).toHaveLength(0);
    // Exact paise: no line has more than 2 decimals.
    expect((await db.query("SELECT 1 FROM public.posting_lines WHERE debit <> round(debit,2) OR credit <> round(credit,2)")).rows).toHaveLength(0);

    // Not even the superuser can rewrite or delete posted lines.
    expect(await err(db, "UPDATE public.posting_lines SET debit = debit + 1 WHERE debit > 0")).not.toBe("");
    expect(await err(db, "DELETE FROM public.posting_lines")).not.toBe("");
    expect((await db.query<{ n: number }>("SELECT count(*)::int n FROM public.posting_lines WHERE owner_id=$1", [U.O])).rows[0]!.n).toBe(lines);

    // The owner cannot hard-delete a posted ledger entry; it must be reversed.
    const posted = (await db.query<{ id: string }>("SELECT e.id FROM public.expenses e WHERE e.employee_id=$1 AND EXISTS (SELECT 1 FROM public.posting_event_sources s WHERE s.source_kind = 'ledger_entry' AND s.source_key = e.id::text AND s.released_at IS NULL) LIMIT 1", [U.O])).rows[0];
    expect(posted, 'at least one posted ledger entry').toBeDefined();
    if (posted) {
      await actAs(db, U.O);
      expect(await err(db, "DELETE FROM public.expenses WHERE id=$1", [posted.id])).not.toBe("");
      await actAs(db, null);
      expect((await db.query("SELECT 1 FROM public.expenses WHERE id=$1", [posted.id])).rows).toHaveLength(1);
    }

    // Another owner and a stranger read none of this owner's journal.
    for (const other of [U.V, U.X]) {
      await actAs(db, other);
      expect((await db.query("SELECT 1 FROM public.posting_lines WHERE owner_id=$1", [U.O])).rows).toHaveLength(0);
      expect((await db.query("SELECT 1 FROM public.posting_batches WHERE owner_id=$1", [U.O])).rows).toHaveLength(0);
    }
    await db.close();
  }, 300_000);

  it("KK decision 1: a reversal keeps the original row unchanged and adds a separate, linked, balanced reversal", async () => {
    const db = await seededDb();
    await activate(db, U.O);
    await actAs(db, null);
    const posted = (await db.query<{ id: string; expense_date: string }>("SELECT e.id, e.expense_date::text FROM public.expenses e WHERE e.employee_id=$1 AND e.reverses_entry_id IS NULL AND EXISTS (SELECT 1 FROM public.posting_event_sources s WHERE s.source_kind='ledger_entry' AND s.source_key=e.id::text AND s.released_at IS NULL) ORDER BY e.expense_date DESC LIMIT 1", [U.O])).rows[0]!;
    const rowHash = async () => (await db.query<{ h: string }>("SELECT md5(to_jsonb(e)::text) h FROM public.expenses e WHERE id=$1", [posted.id])).rows[0]!.h;
    const before = await rowHash();

    // A correction may not be dated before the entry.
    await actAs(db, U.O); await stepUp(db, U.O);
    expect(await err(db, "SELECT public.reverse_ledger_entry($1,$2,'duplicate of bank import','2000-01-01')", [id(7001), posted.id])).not.toBe("");
    // Default date (today, an open period) succeeds.
    await actAs(db, U.O); await stepUp(db, U.O);
    expect(await err(db, "SELECT public.reverse_ledger_entry($1,$2,'duplicate of bank import')", [id(7002), posted.id])).toBe("");

    await actAs(db, null);
    expect(await rowHash()).toBe(before); // original preserved byte-for-byte
    const rev = (await db.query<{ id: string }>("SELECT id FROM public.expenses WHERE reverses_entry_id=$1", [posted.id])).rows;
    expect(rev).toHaveLength(1); // exactly one linked reversal row
    // Original and reversal postings together net to zero per account code and currency.
    const net = await db.query(`SELECT l.code, l.currency, sum(l.signed_amount) s FROM public.posting_lines l
      JOIN public.posting_batches b ON b.id=l.batch_id JOIN public.posting_events ev ON ev.id=b.event_id
      JOIN public.posting_event_sources src ON src.event_id=ev.id AND src.source_kind='ledger_entry' AND src.source_key IN ($1,$2)
      GROUP BY 1,2 HAVING sum(l.signed_amount) <> 0`, [posted.id, rev[0]!.id]);
    expect(net.rows).toHaveLength(0);
    // Reversing the same entry twice is refused (one reversal per entry).
    await actAs(db, U.O); await stepUp(db, U.O);
    expect(await err(db, "SELECT public.reverse_ledger_entry($1,$2,'again please')", [id(7003), posted.id])).not.toBe("");
    await db.close();
  }, 300_000);
});
