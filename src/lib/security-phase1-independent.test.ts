// @vitest-environment node
// Independent verification (written separately from security-phase1-sql.test.ts) that the Phase 1 proposed
// SQL blocks the previously possible attacks while normal owner work continues. Isolated PGlite only.
import { describe, expect, it } from "vitest";
import { actAs, addUsers, fullSchemaDb } from "@/test/full-schema-pglite";

const DIR = ".lovable/staged-sql/proposed/";
const FILES = [`${DIR}P1_security_containment.sql`, `${DIR}P2_v31_role_model.sql`, `${DIR}P4_step_up_and_assistant_limits.sql`];
const A = "0000000a-0000-4000-8000-000000000001";
const B = "0000000b-0000-4000-8000-000000000002";
const T = 240_000;

type Db = Awaited<ReturnType<typeof fullSchemaDb>>;
async function fails(db: Db, sql: string, params: unknown[] = []): Promise<string> {
  try { await db.query(sql, params); } catch (e) { return String((e as Error).message); }
  return "";
}

describe("Phase 1 independent attack checks", () => {
  it("blocks self-granted step-up, unguarded copies, assistant writes and stale confirmations; owner work continues", async () => {
    const db = await fullSchemaDb(FILES);
    await addUsers(db, { [A]: "a@x.in", [B]: "b@x.in" });

    // 1. A signed-in person cannot grant themselves a re-confirmation.
    await actAs(db, A);
    expect(await fails(db, "SELECT public.record_step_up($1,'password',300)", [A])).toMatch(/permission denied/i);
    expect(await fails(db, "INSERT INTO public.step_up_grants(owner_id,method,expires_at) VALUES ($1,'password',now()+interval '1 hour')", [A])).not.toBe("");

    // 2. Sensitive actions need a fresh step-up; the unguarded originals are not callable.
    expect(await fails(db, "SELECT public.delete_my_finance_data()")).toMatch(/STEP_UP_REQUIRED/);
    expect(await fails(db, "SELECT public.grant_entity_access('c1','b@x.in',true)")).toMatch(/STEP_UP_REQUIRED/);
    expect(await fails(db, "SELECT public.delete_my_finance_data__unguarded()")).toMatch(/permission denied/i);

    // 3. Ordinary owner writes still work without step-up.
    await db.query("INSERT INTO public.finance_preferences(owner_id,data) VALUES ($1,'{}'::jsonb) ON CONFLICT DO NOTHING", [A]);
    expect((await db.query("SELECT 1 FROM public.finance_preferences WHERE owner_id=$1", [A])).rows).toHaveLength(1);

    // 4. An external assistant token can read the owner's own rows but cannot write.
    await actAs(db, A, { clientId: "mcp-x" });
    expect((await db.query("SELECT 1 FROM public.finance_preferences WHERE owner_id=$1", [A])).rows).toHaveLength(1);
    await db.query("UPDATE public.finance_preferences SET data='{\"x\":1}'::jsonb WHERE owner_id=$1", [A]).catch(() => undefined);
    await actAs(db, null);
    expect((await db.query<{ data: unknown }>("SELECT data FROM public.finance_preferences WHERE owner_id=$1", [A])).rows[0]?.data).toEqual({});

    // 5. A step-up recorded by the server unlocks the action only for that person and only while fresh.
    await actAs(db, null);
    await db.exec("SET ROLE service_role");
    await db.query("SELECT public.record_step_up($1,'password',300)", [A]);
    await actAs(db, B);
    expect(await fails(db, "SELECT public.delete_my_finance_data()")).toMatch(/STEP_UP_REQUIRED/); // B is not confirmed
    await actAs(db, A, { clientId: "mcp-x" });
    expect(await fails(db, "SELECT public.delete_my_finance_data()")).toMatch(/STEP_UP_REQUIRED/); // assistants never
    await actAs(db, A);
    expect(await fails(db, "SELECT public.delete_my_finance_data()")).toBe(""); // confirmed owner may proceed
    await actAs(db, null);
    await db.query("UPDATE public.step_up_grants SET created_at = now() - interval '10 minutes', expires_at = now() - interval '5 minutes' WHERE owner_id=$1", [A]);
    await actAs(db, A);
    expect(await fails(db, "SELECT public.delete_my_finance_data()")).toMatch(/STEP_UP_REQUIRED/); // expired
    await db.close();
  }, T);
});
