// @vitest-environment node
// Coordinator's integrated check of the WHOLE proposed SQL stack on one isolated database: P1, P2, P4, P5, P5b,
// P6 and P7 install together; one owner's entities, assets register and postings run end to end; the journal
// balances; the JSON source and pre-existing ledger rows are unchanged; and every rollback runs in reverse order.
// Separate branch tests applied P6 and P7 only on their own. Isolated PGlite only.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { actAs, addUsers, fullSchemaDb, readSql } from "@/test/full-schema-pglite";

const D = ".lovable/staged-sql/proposed/";
const STACK = ["P1_security_containment", "P2_v31_role_model", "P4_step_up_and_assistant_limits", "P5_legal_entities_foundation", "P5b_restore_investments", "P6_registers", "P7_balanced_posting"];
const O = "0000000a-0000-4000-8000-0000000000a1";
type Db = Awaited<ReturnType<typeof fullSchemaDb>>;
const one = async <T,>(db: Db, sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows[0]!;
async function stepUp(db: Db) {
  await actAs(db, null); await db.exec("SET ROLE service_role");
  await db.query("SELECT public.record_step_up($1,'password',300)", [O]);
  await actAs(db, O);
}
const hash = async (db: Db, sql: string, p: unknown[] = []) => {
  await actAs(db, null);
  const r = await one<{ t: string }>(db, `SELECT coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY to_jsonb(x)::text), '') t FROM (${sql}) x`, p);
  return createHash("sha256").update(r.t).digest("hex");
};

describe("integrated proposed SQL stack", () => {
  it("installs together, runs entities → registers → postings, balances, preserves sources, and rolls back in reverse", async () => {
    const db = await fullSchemaDb(STACK.map((f) => `${D}${f}.sql`));
    await addUsers(db, { [O]: "o@x.in" });
    await actAs(db, null);
    const acc = (await one<{ id: string }>(db, "INSERT INTO public.accounts(owner_id,name,kind) VALUES ($1,'HDFC current','current') RETURNING id", [O])).id;
    await db.query("INSERT INTO public.finance_preferences(owner_id,data) VALUES ($1,$2::jsonb)", [O, JSON.stringify({
      entities: [{ id: "c1", name: "Alpha Pvt Ltd", kind: "company" }],
      assets: [{ id: "ast-1", name: "Laptop", kind: "computer", cost: 120000, purchaseDate: "2026-04-05", sharePct: 100, ownerEntityId: "c1" }],
      books: { entityAccounts: { c1: [acc] } },
    })]);
    await actAs(db, O);
    for (const [amt, cat, d] of [[1500, "Food", "2026-04-10"], [42000, "Travel", "2026-04-12"]] as const)
      await db.query("INSERT INTO public.expenses(employee_id,title,merchant,category,amount,currency,expense_date,account_id,entity_source) VALUES ($1,'t','Shop',$2,$3,'INR',$4,$5,'account')", [O, cat, amt, d, acc]);

    const prefsBefore = await hash(db, "SELECT data FROM public.finance_preferences WHERE owner_id=$1", [O]);
    const ledgerBefore = await hash(db, "SELECT id, amount, currency, expense_date, account_id, category FROM public.expenses WHERE employee_id=$1", [O]);

    // Entities (P5) → asset register (P6) → postings (P7), each previewed and committed with a fresh step-up.
    await actAs(db, O);
    const ep = (await one<{ p: { source_sha256: string } }>(db, "SELECT public.preview_entity_backfill(false) p")).p;
    await stepUp(db); await db.query("SELECT public.commit_entity_backfill($1,false)", [ep.source_sha256]);
    const ap = (await one<{ p: { source_sha256: string } }>(db, "SELECT public.preview_register_backfill('assets','{}') p")).p;
    await stepUp(db); await db.query("SELECT public.commit_register_backfill('assets',$1,'{}')", [ap.source_sha256]);
    const pp = (await one<{ p: { fingerprint: string } }>(db, "SELECT public.preview_posting_backfill() p")).p;
    await stepUp(db); await db.query("SELECT public.commit_posting_backfill($1,$2)", ["00000000-0000-4000-8000-000000009001", pp.fingerprint]);

    await actAs(db, null);
    expect((await one<{ n: number }>(db, "SELECT count(*)::int n FROM public.assets WHERE owner_id=$1", [O])).n).toBe(1);
    expect((await one<{ n: number }>(db, "SELECT count(*)::int n FROM public.posting_batches WHERE owner_id=$1", [O])).n).toBeGreaterThan(0);
    expect((await db.query("SELECT batch_id FROM public.posting_lines GROUP BY batch_id, currency HAVING sum(debit) <> sum(credit)")).rows).toHaveLength(0);
    expect(await hash(db, "SELECT data FROM public.finance_preferences WHERE owner_id=$1", [O])).toBe(prefsBefore);
    expect(await hash(db, "SELECT id, amount, currency, expense_date, account_id, category FROM public.expenses WHERE employee_id=$1", [O])).toBe(ledgerBefore);

    // Rollback in reverse order. P7 holds postings, so its rollback needs the explicit archive switch.
    await actAs(db, null);
    await db.exec("SET phase3_p7.rollback_archive_postings = 'on'");
    for (const f of [...STACK].reverse()) {
      try { await db.exec(readSql(`${D}${f}.rollback.sql`)); } catch (e) { throw new Error(`${f} rollback: ${(e as Error).message}`); }
    }
    expect((await db.query("SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename IN ('legal_entities','assets','posting_batches','step_up_grants')")).rows).toHaveLength(0);
    expect(await hash(db, "SELECT data FROM public.finance_preferences WHERE owner_id=$1", [O])).toBe(prefsBefore);
    expect(await hash(db, "SELECT id, amount, currency, expense_date, account_id, category FROM public.expenses WHERE employee_id=$1", [O])).toBe(ledgerBefore);
    await db.close();
  }, 600_000);
});
