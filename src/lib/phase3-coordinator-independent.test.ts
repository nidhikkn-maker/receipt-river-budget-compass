// @vitest-environment node
// Coordinator's independent checks of proposed P7 (written separately from the Phase 3 developer's tests):
// every posted batch balances per currency, nobody (not even the superuser) can rewrite or delete posted lines,
// a posted entry cannot be hard-deleted, and other owners read none of the journal. Isolated PGlite only.
import { describe, expect, it } from "vitest";
import { actAs } from "@/test/full-schema-pglite";
import { U, activate, seededDb } from "@/test/phase3-fixture";

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
});
