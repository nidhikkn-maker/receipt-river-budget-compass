// @vitest-environment node
// Independent verification (written separately from phase2-entities-sql.test.ts) of the Phase 2 proposed SQL:
// tenant isolation, no client writes that bypass the guarded functions, assistant limits, and the
// entity-aware closed-period fix. Isolated PGlite only.
import { describe, expect, it } from "vitest";
import { actAs, addUsers, fullSchemaDb } from "@/test/full-schema-pglite";

const DIR = ".lovable/staged-sql/proposed/";
const BASE = [`${DIR}P1_security_containment.sql`, `${DIR}P2_v31_role_model.sql`, `${DIR}P4_step_up_and_assistant_limits.sql`];
const P5 = `${DIR}P5_legal_entities_foundation.sql`;
const A = "0000000a-0000-4000-8000-0000000000a1";
const B = "0000000b-0000-4000-8000-0000000000b2";
const T = 300_000;
type Db = Awaited<ReturnType<typeof fullSchemaDb>>;

async function err(db: Db, sql: string, params: readonly unknown[] = []): Promise<string> {
  try { await db.query(sql, [...params]); return ""; } catch (e) { return String((e as Error).message); }
}
const prefs = { entities: [{ id: "c1", name: "Alpha Pvt Ltd", kind: "company" }], books: { closedPeriods: [{ id: "p1", from: "2026-04-01", to: "2026-04-30", entityId: "c1", closedOn: "2026-05-05", note: "C1 April close" }] } };
const expense = (entity: string | null) => [
  // As the app writes it (fx.functions.ts:102): a hand-picked company is entity_id + entity_source 'manual'.
  "INSERT INTO public.expenses(employee_id,title,merchant,category,amount,currency,expense_date,entity_id,entity_source) VALUES ($1,'t','Shop','General',10,'INR','2026-04-20',$2,$3)",
  [A, entity, entity ? "manual" : "account"],
] as const;

async function seed(db: Db) {
  await addUsers(db, { [A]: "a@x.in", [B]: "b@x.in" });
  // Closed periods can only change inside an authorised period operation (the Audit flow); seed them that way.
  await actAs(db, null);
  await db.exec("BEGIN");
  await db.query("INSERT INTO public.period_operation_authority(owner_id, transaction_id) VALUES ($1, txid_current())", [A]);
  await db.query("INSERT INTO public.finance_preferences(owner_id,data) VALUES ($1,$2::jsonb) ON CONFLICT (owner_id) DO UPDATE SET data = EXCLUDED.data", [A, JSON.stringify(prefs)]);
  await db.query("DELETE FROM public.period_operation_authority WHERE owner_id = $1", [A]);
  await db.exec("COMMIT");
}

describe("Phase 2 independent checks", () => {
  it("closed periods: today a company's close blocks personal entries; after P5 only that company's entries are blocked", async () => {
    const before = await fullSchemaDb(BASE);
    await seed(before);
    await actAs(before, A);
    expect(await err(before, ...expense(null))).not.toBe(""); // defect reproduced: personal entry blocked by C1's close
    expect(await err(before, ...expense("c1"))).not.toBe("");
    await before.close();

    const after = await fullSchemaDb([...BASE, P5]);
    await seed(after);
    await actAs(after, A);
    expect(await err(after, ...expense(null))).toBe(""); // personal books are not C1's
    expect(await err(after, ...expense("c1"))).not.toBe(""); // C1's own period stays closed
    await after.close();
  }, T);

  it("tenant isolation, guarded writes only, assistants read-only", async () => {
    const db = await fullSchemaDb([...BASE, P5]);
    await seed(db);
    // Owner previews and commits with a fresh step-up (server-recorded).
    await actAs(db, A);
    const plan = (await db.query<{ p: { source_sha256: string } }>("SELECT public.preview_entity_backfill(false) p")).rows[0]!.p;
    expect(await err(db, "SELECT public.commit_entity_backfill($1,false)", [plan.source_sha256])).toMatch(/STEP_UP_REQUIRED/);
    await actAs(db, null); await db.exec("SET ROLE service_role");
    await db.query("SELECT public.record_step_up($1,'password',300)", [A]);
    await actAs(db, A);
    expect(await err(db, "SELECT public.commit_entity_backfill($1,false)", [plan.source_sha256])).toBe("");
    const mine = (await db.query<{ entity_key: string }>("SELECT entity_key FROM public.legal_entities ORDER BY entity_key")).rows.map((r) => r.entity_key);
    expect(mine).toEqual(["c1", `personal:${A}`]);

    // Another owner sees nothing and cannot write or link into A's entities.
    await actAs(db, B);
    expect((await db.query("SELECT 1 FROM public.legal_entities")).rows).toHaveLength(0);
    expect(await err(db, "INSERT INTO public.legal_entities(owner_id,entity_key,kind,legal_name) VALUES ($1,'x','company','X')", [A])).not.toBe("");
    // Even the owner cannot bypass the guarded functions with direct writes or hard deletes.
    await actAs(db, A);
    expect(await err(db, "INSERT INTO public.legal_entities(owner_id,entity_key,kind,legal_name) VALUES ($1,'c2','company','Beta')", [A])).not.toBe("");
    await db.query("DELETE FROM public.legal_entities WHERE entity_key='c1'").catch(() => undefined);
    await actAs(db, null);
    expect((await db.query("SELECT 1 FROM public.legal_entities WHERE owner_id=$1 AND entity_key='c1'", [A])).rows).toHaveLength(1);
    // An assistant token reads the owner's entities but cannot preview-commit or archive.
    await actAs(db, A, { clientId: "mcp-z" });
    expect((await db.query("SELECT 1 FROM public.legal_entities")).rows).toHaveLength(2);
    expect(await err(db, "SELECT public.preview_entity_backfill(false)")).toMatch(/ASSISTANT_READ_ONLY|STEP_UP_REQUIRED/);
    await db.close();
  }, T);
});
