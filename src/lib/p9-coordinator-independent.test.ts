// @vitest-environment node
// Coordinator's INDEPENDENT check of proposed P9 (Track D, 10 Nov 2026), written separately from Track A's tests.
// Isolated PGlite only (applied migrations + proposed P9). Never Cloud.
import { describe, expect, it } from "vitest";
import { actAs, addUsers, fullSchemaDb } from "@/test/full-schema-pglite";

const P9 = ".lovable/staged-sql/proposed/P9_statement_import_idempotency_and_archive_guards.sql";
const O = "0000000c-0000-4000-8000-0000000000c1", V = "0000000c-0000-4000-8000-0000000000c2";
const line = (n: number) => ({ fingerprint: `hdfc|2026-11-0${n}|-1500.00|SWIGGY ${n}`, line_date: `2026-11-0${n}`, entry_id: `0000000e-0000-4000-8000-00000000000${n}` });
type Db = Awaited<ReturnType<typeof fullSchemaDb>>;
async function attempt(db: Db, uid: string | null, sql: string, p: unknown[] = []): Promise<string> {
  await actAs(db, uid);
  try { await db.query(sql, p); return "ok"; } catch (e) { return (e as Error).message; } finally { await actAs(db, null); }
}

describe("P9, checked independently", () => {
  it("one statement line can be registered once, however often it is imported", async () => {
    const db = await fullSchemaDb([P9]);
    await addUsers(db, { [O]: "o@x.in", [V]: "v@x.in" });
    const claim = async (uid: string, lines: object[]) => {
      await actAs(db, uid);
      const r = await db.query<{ fingerprint: string; outcome: string }>("SELECT * FROM public.claim_statement_lines('hdfc-4411', gen_random_uuid(), 'nov.pdf', $1::jsonb)", [JSON.stringify(lines)]);
      await actAs(db, null);
      return r.rows.map((x) => x.outcome);
    };
    expect(await claim(O, [line(1), line(2)])).toEqual(["claimed", "claimed"]);
    // Same statement again (re-import / retry / double submit): nothing new is claimed.
    expect(await claim(O, [line(1), line(2)])).toEqual(["pending", "pending"]);
    // A larger re-download overlapping the first: only the new line is claimed.
    expect(await claim(O, [line(1), line(2), line(3)])).toEqual(["pending", "pending", "claimed"]);
    await actAs(db, null);
    expect((await db.query<{ n: number }>("SELECT count(*)::int n FROM public.statement_line_imports WHERE owner_id=$1", [O])).rows[0]!.n).toBe(3);
    // Another owner's identical line is theirs alone (no cross-owner suppression or visibility).
    expect(await claim(V, [{ ...line(1), entry_id: "0000000e-0000-4000-8000-0000000000f1" }])).toEqual(["claimed"]);
    // Clients cannot set the registration columns directly.
    expect(await attempt(db, O, "UPDATE public.statement_line_imports SET registered_at = now() WHERE owner_id = $1", [O])).not.toBe("ok");
    await db.close();
  }, 300_000);

  it("signed-in owners cannot delete archive-controlled rows; the service path can", async () => {
    const db = await fullSchemaDb([P9]);
    await addUsers(db, { [O]: "o@x.in" });
    await actAs(db, null);
    const loan = (await db.query<{ id: string }>("INSERT INTO public.loans(owner_id,name,principal_outstanding,annual_rate,emi,next_due) VALUES ($1,'Car loan',300000,9,10000,'2026-12-05') RETURNING id", [O])).rows[0]!.id;
    const goal = (await db.query<{ id: string }>("INSERT INTO public.goals(owner_id,name,target,saved,monthly) VALUES ($1,'Emergency',100000,20000,5000) RETURNING id", [O])).rows[0]!.id;
    expect(await attempt(db, O, "DELETE FROM public.loans WHERE id=$1", [loan])).toMatch(/P9_ARCHIVE_ONLY/);
    expect(await attempt(db, O, "DELETE FROM public.goals WHERE id=$1", [goal])).toMatch(/P9_ARCHIVE_ONLY/);
    expect(await attempt(db, O, "TRUNCATE public.loans")).not.toBe("ok");
    expect((await db.query<{ n: number }>("SELECT count(*)::int n FROM public.loans WHERE id=$1", [loan])).rows[0]!.n).toBe(1);
    // Operator/service path (no signed-in user) still works, e.g. demo cleanup.
    expect(await attempt(db, null, "DELETE FROM public.goals WHERE id=$1", [goal])).toBe("ok");
    await db.close();
  }, 300_000);
});
