// @vitest-environment node
// Independent verification (written separately from phase2-registers-sql.test.ts) of proposed P6: the JSON
// source is never changed, other owners see nothing, nobody can hard-delete or rewrite register rows directly,
// commits need a fresh step-up, assistants cannot write, and archive keeps the row. Isolated PGlite only.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { actAs, addUsers, fullSchemaDb } from "@/test/full-schema-pglite";

const DIR = ".lovable/staged-sql/proposed/";
const FILES = ["P1_security_containment.sql", "P2_v31_role_model.sql", "P4_step_up_and_assistant_limits.sql", "P5_legal_entities_foundation.sql", "P6_registers.sql"].map((f) => DIR + f);
const A = "0000000a-0000-4000-8000-0000000000a1";
const B = "0000000b-0000-4000-8000-0000000000b2";
type Db = Awaited<ReturnType<typeof fullSchemaDb>>;

async function err(db: Db, sql: string, params: readonly unknown[] = []): Promise<string> {
  try { await db.query(sql, [...params]); return ""; } catch (e) { return String((e as Error).message); }
}
async function stepUp(db: Db, uid: string) {
  await actAs(db, null); await db.exec("SET ROLE service_role");
  await db.query("SELECT public.record_step_up($1,'password',300)", [uid]);
  await actAs(db, uid);
}
const prefs = {
  entities: [{ id: "c1", name: "Alpha Pvt Ltd", kind: "company" }],
  assets: [
    { id: "ast-laptop", name: "Laptop", kind: "computer", cost: 120000, purchaseDate: "2025-06-01", sharePct: 100, ownerEntityId: "c1" },
    { id: "ast-car", name: "Car", kind: "vehicle", cost: 900000, purchaseDate: "2024-04-10", sharePct: 100 },
  ],
};

describe("P6 registers: independent checks", () => {
  it("commit preserves the source, isolates owners, refuses direct writes and keeps archived rows", async () => {
    const db = await fullSchemaDb(FILES);
    await addUsers(db, { [A]: "a@x.in", [B]: "b@x.in" });
    await actAs(db, null);
    await db.query("INSERT INTO public.finance_preferences(owner_id,data) VALUES ($1,$2::jsonb)", [A, JSON.stringify(prefs)]);
    const sourceHash = async () => { await actAs(db, null); const r = await db.query<{ d: string }>("SELECT data::text d FROM public.finance_preferences WHERE owner_id=$1", [A]); return createHash("sha256").update(r.rows[0]!.d).digest("hex"); };
    const before = await sourceHash();

    // P5 entity backfill, then the asset register backfill (both need a fresh step-up).
    await actAs(db, A);
    const ep = (await db.query<{ p: { source_sha256: string } }>("SELECT public.preview_entity_backfill(false) p")).rows[0]!.p;
    await stepUp(db, A);
    expect(await err(db, "SELECT public.commit_entity_backfill($1,false)", [ep.source_sha256])).toBe("");
    const ap = (await db.query<{ p: { source_sha256: string } }>("SELECT public.preview_register_backfill('assets','{}') p")).rows[0]!.p;
    // The entity-backfill step-up is still fresh (grants last 5 minutes); expire it to test the refusal.
    await actAs(db, null);
    await db.query("UPDATE public.step_up_grants SET created_at = now() - interval '10 minutes', expires_at = now() - interval '5 minutes' WHERE owner_id = $1", [A]);
    await actAs(db, A);
    expect(await err(db, "SELECT public.commit_register_backfill('assets',$1,'{}')", [ap.source_sha256])).toMatch(/STEP_UP_REQUIRED/);
    await stepUp(db, A);
    expect(await err(db, "SELECT public.commit_register_backfill('assets',$1,'{}')", [ap.source_sha256])).toBe("");
    expect(await sourceHash()).toBe(before); // the JSON source is never changed

    await actAs(db, A);
    const mine = (await db.query<{ id: string; legacy_id: string }>("SELECT id, legacy_id FROM public.assets ORDER BY legacy_id")).rows;
    expect(mine.map((r) => r.legacy_id)).toEqual(["ast-car", "ast-laptop"]);

    // Another owner sees nothing; nobody (including the owner) can delete or rewrite rows directly.
    await actAs(db, B);
    expect((await db.query("SELECT 1 FROM public.assets")).rows).toHaveLength(0);
    await actAs(db, A);
    await db.query("DELETE FROM public.assets").catch(() => undefined);
    await db.query("UPDATE public.assets SET legacy_id = 'tampered'").catch(() => undefined);
    await actAs(db, null);
    expect((await db.query<{ legacy_id: string }>("SELECT legacy_id FROM public.assets WHERE owner_id=$1 ORDER BY legacy_id", [A])).rows.map((r) => r.legacy_id)).toEqual(["ast-car", "ast-laptop"]);

    // Assistants cannot archive; the owner archives with step-up and the row stays.
    const car = mine.find((r) => r.legacy_id === "ast-car")!.id;
    await actAs(db, A, { clientId: "mcp-q" });
    expect(await err(db, "SELECT public.archive_register_item('assets',$1,'no longer used')", [car])).not.toBe("");
    await stepUp(db, A);
    expect(await err(db, "SELECT public.archive_register_item('assets',$1,'no longer used')", [car])).toBe("");
    await actAs(db, null);
    expect((await db.query("SELECT 1 FROM public.assets WHERE id=$1", [car])).rows).toHaveLength(1);
    expect(await sourceHash()).toBe(before);
    await db.close();
  }, 300_000);
});
