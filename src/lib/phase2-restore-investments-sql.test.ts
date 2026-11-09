// @vitest-environment node
// Phase 2 P5b acceptance: restore_finance_backup restores demat_accounts and security_holdings in the SAME
// server transaction (natural-key matching, conflicts reported, never overwritten), step-up still required,
// exact rollback to the P4 catalog. Also the opening_postings id collision across owners (global primary
// key) and the owner-scoped id that avoids it. Isolated in-memory PGlite only (0000-0088 + P1 + P2 + P4).
import { describe, it, expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { fullSchemaDb, actAs, addUsers, readSql } from "../test/full-schema-pglite";
import { buildBackupFixture, OWNER_A, OWNER_B } from "../test/backup-fixture";
import { BACKUP_TABLES, investmentTablesToWrite, planRestore, type Backup, type BackupRow } from "./backup";
import { openingPostingId, stableId } from "./books/fy";

const DIR = ".lovable/staged-sql/proposed/";
const BASE = [`${DIR}P1_security_containment.sql`, `${DIR}P2_v31_role_model.sql`, `${DIR}P4_step_up_and_assistant_limits.sql`];
const P5 = `${DIR}P5_legal_entities_foundation.sql`;
const P5B = `${DIR}P5b_restore_investments.sql`;
const P5B_RB = `${DIR}P5b_restore_investments.rollback.sql`;
const P4_RB = `${DIR}P4_step_up_and_assistant_limits.rollback.sql`;
const T = 180_000;

type Db = PGlite;
const q = async <R = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []) => (await db.query<R>(sql, params)).rows;
function first<R>(rows: readonly R[]): R { const r = rows[0]; if (r === undefined) throw new Error("Expected a row"); return r; }
const ownerCol = (t: string) => (t === "expenses" ? "employee_id" : "owner_id");
type Result = { counts: Record<string, number>; investmentConflicts?: { table: string; backupId: string; keptId: string; differences: Record<string, unknown> }[]; investmentIdMap?: Record<string, string> };

async function stepUp(db: Db, uid: string) {
  await db.exec("RESET ROLE"); await db.exec("SET ROLE service_role");
  try { await q(db, "SELECT public.record_step_up($1,'password',300)", [uid]); } finally { await db.exec("RESET ROLE"); await db.exec("SET ROLE authenticated"); }
}
/** The app's server call (settings.tsx): step-up, then the RPC. Returns the result or the error text. */
async function restore(db: Db, owner: string, data: Backup["data"], opts: { stepUp?: boolean; clientId?: string } = {}): Promise<Result | string> {
  await actAs(db, owner, opts.clientId ? { clientId: opts.clientId } : {});
  try {
    if (opts.stepUp !== false) await stepUp(db, owner);
    return first(await q<{ r: Result }>(db, "SELECT public.restore_finance_backup($1::jsonb) r", [JSON.stringify(data)])).r;
  } catch (e) { return (e as Error).message; } finally { await actAs(db, null); }
}
async function exportBackup(db: Db, owner: string): Promise<Backup> {
  await actAs(db, null);
  const data: Backup["data"] = {};
  for (const t of BACKUP_TABLES) data[t] = (await q<{ j: BackupRow }>(db, `SELECT to_jsonb(x) - 'legal_entity_id' j FROM public.${t} x WHERE ${ownerCol(t)} = $1 ORDER BY 1`, [owner])).map((r) => r.j);
  return { app: "ledgerline", version: 3, owner, exportedAt: "2026-11-09", data };
}
const counts = async (db: Db, owner: string) => {
  await actAs(db, null);
  const out: Record<string, number> = {};
  for (const t of BACKUP_TABLES) out[t] = first(await q<{ n: number }>(db, `SELECT count(*)::int n FROM public.${t} WHERE ${ownerCol(t)} = $1`, [owner])).n;
  return out;
};
const investments = async (db: Db, owner: string) => {
  await actAs(db, null);
  return q<{ broker: string; dp_id: string; client_id: string; isin: string; quantity: string; lots: unknown; events: unknown; same_owner: boolean }>(db,
    `SELECT d.broker, d.dp_id, d.client_id, h.isin, h.quantity::text quantity, h.lots, h.events, h.owner_id = d.owner_id same_owner
     FROM public.demat_accounts d LEFT JOIN public.security_holdings h ON h.demat_id = d.id WHERE d.owner_id = $1 ORDER BY 1, 4`, [owner]);
};
async function db0(withP5 = true) {
  const db = await fullSchemaDb([...BASE, ...(withP5 ? [P5] : []), P5B]);
  await addUsers(db, { [OWNER_A]: "a@x.in", [OWNER_B]: "b@x.in" });
  return db;
}

describe("P5b: investments restored inside the one restore transaction", () => {
  it("before P5b the server ignores investment rows (the app writes them in a second, separate step)", async () => {
    const db = await fullSchemaDb(BASE);
    await addUsers(db, { [OWNER_A]: "a@x.in" });
    const data = (await planRestore(await buildBackupFixture(), OWNER_A)).data;
    const r = await restore(db, OWNER_A, data);
    expect(typeof r === "string" ? r : Object.keys(r.counts)).not.toContain("demat_accounts");
    expect((await counts(db, OWNER_A))["demat_accounts"]).toBe(0);
    await db.close();
  }, T);

  it("v3 round trip (same account, then cross-account) restores investments in the server transaction; the client step has nothing left to write", async () => {
    const db = await db0();
    const fixture = await buildBackupFixture();
    const data = (await planRestore(fixture, OWNER_A)).data;
    const r = await restore(db, OWNER_A, data);
    if (typeof r === "string") throw new Error(r);
    expect(r.counts).toMatchObject({ demat_accounts: 1, security_holdings: 1 });
    expect(investmentTablesToWrite(data, r.counts)).toEqual([]);
    expect(r.investmentConflicts).toEqual([]);
    const a = await investments(db, OWNER_A);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ broker: "Zerodha", dp_id: "IN300000", client_id: "12345678", isin: "INE002A01018", quantity: "10", same_owner: true });
    // a second same-account restore is an ordinary upsert: nothing duplicated
    const again = await restore(db, OWNER_A, data);
    if (typeof again === "string") throw new Error(again);
    expect(await counts(db, OWNER_A)).toMatchObject({ demat_accounts: 1, security_holdings: 1 });
    // cross-account: ids remapped by the app, owner forced by the server, holding follows its demat account
    const crossData = (await planRestore(await exportBackup(db, OWNER_A), OWNER_B)).data;
    const x = await restore(db, OWNER_B, crossData);
    if (typeof x === "string") throw new Error(x);
    expect(x.counts).toMatchObject({ demat_accounts: 1, security_holdings: 1 });
    // lots/events cite document ids, which the app remaps for the new account: compare everything else
    const plain = (rows: Awaited<ReturnType<typeof investments>>) => rows.map(({ lots, events, ...rest }) => ({ ...rest, lots: (lots as unknown[]).length, events: (events as unknown[]).length }));
    expect(plain(await investments(db, OWNER_B))).toEqual(plain(a));
    const ids = await q<{ n: number }>(db, "SELECT count(DISTINCT id)::int n FROM public.demat_accounts");
    expect(first(ids).n).toBe(2);
    await db.close();
  }, T);

  it("v2 backup (no investment tables) still restores and reports zero investment rows", async () => {
    const db = await db0(false);
    const fixture = await buildBackupFixture();
    const { demat_accounts: _d, security_holdings: _h, ...rest } = fixture.data;
    const r = await restore(db, OWNER_A, (await planRestore({ ...fixture, version: 2, data: rest }, OWNER_A)).data);
    if (typeof r === "string") throw new Error(r);
    expect(r.counts).toMatchObject({ demat_accounts: 0, security_holdings: 0 });
    expect((await counts(db, OWNER_A))["accounts"]).toBeGreaterThan(0);
    await db.close();
  }, T);

  it("a failing investment row rolls back the WHOLE restore (accounts, entries, documents, preferences)", async () => {
    const db = await db0();
    const data = (await planRestore(await buildBackupFixture(), OWNER_B)).data;
    const bad = { ...data, security_holdings: (data.security_holdings ?? []).map((h) => ({ ...h, demat_id: "00000000-0000-4000-8000-00000000dead" })) };
    const r = await restore(db, OWNER_B, bad);
    expect(typeof r === "string" ? r : "succeeded").toMatch(/security_holdings|foreign key|row-level security/);
    expect(Object.values(await counts(db, OWNER_B)).every((n) => n === 0)).toBe(true);
    await db.close();
  }, T);

  it("natural keys: an existing demat account / holding under another id is matched, kept unchanged, and the differences are reported", async () => {
    const db = await db0();
    await actAs(db, null);
    const keepDemat = "00000000-0000-4000-8000-0000000000d1", keepHolding = "00000000-0000-4000-8000-0000000000d2";
    await q(db, "INSERT INTO public.demat_accounts(id, owner_id, broker, dp_id, client_id, holder) VALUES ($1,$2,'Upstox','IN300000','12345678','K')", [keepDemat, OWNER_B]);
    await q(db, "INSERT INTO public.security_holdings(id, owner_id, demat_id, isin, name, quantity) VALUES ($1,$2,$3,'INE002A01018','Reliance Industries',7)", [keepHolding, OWNER_B, keepDemat]);
    const data = (await planRestore(await buildBackupFixture(), OWNER_B)).data;
    const extraIsin = { ...first(data.security_holdings ?? []), id: "00000000-0000-4000-8000-0000000000d3", isin: "INE009A01021", name: "Infosys", quantity: 4 };
    const r = await restore(db, OWNER_B, { ...data, security_holdings: [...(data.security_holdings ?? []), extraIsin] });
    if (typeof r === "string") throw new Error(r);
    expect(r.counts).toMatchObject({ demat_accounts: 1, security_holdings: 2 });
    const rows = await q<{ id: string; broker: string }>(db, "SELECT id, broker FROM public.demat_accounts WHERE owner_id=$1", [OWNER_B]);
    expect(rows).toEqual([{ id: keepDemat, broker: "Upstox" }]); // kept, not overwritten
    const hs = await q<{ id: string; isin: string; quantity: string; demat_id: string }>(db, "SELECT id, isin, quantity::text quantity, demat_id FROM public.security_holdings WHERE owner_id=$1 ORDER BY isin", [OWNER_B]);
    expect(hs).toEqual([{ id: keepHolding, isin: "INE002A01018", quantity: "7", demat_id: keepDemat }, { id: extraIsin.id, isin: "INE009A01021", quantity: "4", demat_id: keepDemat }]);
    expect((r.investmentConflicts ?? []).map((c) => [c.table, c.keptId, Object.keys(c.differences).sort()])).toEqual([
      ["demat_accounts", keepDemat, ["broker"]],
      ["security_holdings", keepHolding, ["as_of", "events", "gains", "lots", "name", "quantity", "sources", "statement_value"]]]);
    expect(Object.values(r.investmentIdMap ?? {}).sort()).toEqual([keepDemat, keepHolding].sort());
    await db.close();
  }, T);

  it("step-up is still required (P4) and assistants are refused even with step-up", async () => {
    const db = await db0();
    const data = (await planRestore(await buildBackupFixture(), OWNER_A)).data;
    expect(await restore(db, OWNER_A, data, { stepUp: false })).toBe("STEP_UP_REQUIRED: restore_finance_backup");
    expect(await restore(db, OWNER_A, data, { clientId: "mcp-client-1" })).toBe("STEP_UP_REQUIRED: restore_finance_backup");
    expect(Object.values(await counts(db, OWNER_A)).every((n) => n === 0)).toBe(true);
    await db.close();
  }, T);

  it("rollback restores restore_finance_backup exactly as P4 left it; the P4 rollback refuses while P5b is installed; restored rows stay", async () => {
    const db = await fullSchemaDb(BASE);
    await addUsers(db, { [OWNER_A]: "a@x.in" });
    const fn = async () => { await actAs(db, null); return q(db, `SELECT p.oid, pg_get_functiondef(p.oid) d, p.proacl::text acl, p.prosecdef FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'restore_finance_backup%' ORDER BY 2`); };
    const before = await fn();
    await db.exec(readSql(P5B));
    await expect(db.exec(readSql(P5B))).rejects.toThrow(/already installed/);
    await db.exec("ROLLBACK").catch(() => undefined);
    const r = await restore(db, OWNER_A, (await planRestore(await buildBackupFixture(), OWNER_A)).data);
    expect(typeof r === "string" ? r : r.counts["demat_accounts"]).toBe(1);
    await expect(db.exec(readSql(P4_RB))).rejects.toThrow(/Roll back P5b/);
    await db.exec("ROLLBACK").catch(() => undefined);
    await db.exec(readSql(P5B_RB));
    expect(await fn()).toEqual(before);
    expect(first(await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.demat_accounts")).n).toBe(1);
    await db.exec(readSql(P4_RB)); // the P4 rollback works again afterwards
    await db.close();
  }, T);
});

describe("opening_postings ids: global primary key, owner-scoped derivation", () => {
  it("the old client id (company key + year + count) collides across owners; openingPostingId does not; stored ids are untouched", async () => {
    const db = await fullSchemaDb(BASE);
    await addUsers(db, { [OWNER_A]: "a@x.in", [OWNER_B]: "b@x.in" });
    const pk = first(await q<{ d: string }>(db, "SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conrelid='public.opening_postings'::regclass AND contype='p'")).d;
    expect(pk).toBe("PRIMARY KEY (id)"); // global, not per owner
    const post = async (owner: string, id: string) => {
      await actAs(db, owner);
      try { await q(db, "SELECT public.post_opening_balances($1,'5b1f0c1e-7a3d-4c2e-9f10-0000000000c1','2025-26','2026-04-01','[]'::jsonb,'[]'::jsonb,NULL)", [id]); return "ok"; }
      catch (e) { return (e as Error).message; } finally { await actAs(db, null); }
    };
    const legacy = stableId("opening-post|5b1f0c1e-7a3d-4c2e-9f10-0000000000c1|2025-26|0");
    expect(await post(OWNER_A, legacy)).toBe("ok");
    expect(await post(OWNER_B, legacy)).toMatch(/duplicate key|opening_postings_pkey/); // B is blocked by A's row
    const idA = openingPostingId(OWNER_A, "5b1f0c1e-7a3d-4c2e-9f10-0000000000c1", "2025-26", 1);
    const idB = openingPostingId(OWNER_B, "5b1f0c1e-7a3d-4c2e-9f10-0000000000c1", "2025-26", 0);
    expect(idB).not.toBe(legacy);
    expect(idA).not.toBe(openingPostingId(OWNER_B, "5b1f0c1e-7a3d-4c2e-9f10-0000000000c1", "2025-26", 1));
    expect(openingPostingId(OWNER_B, "5b1f0c1e-7a3d-4c2e-9f10-0000000000c1", "2025-26", 0)).toBe(idB); // stable for retries
    expect(await post(OWNER_B, idB)).toBe("ok");
    expect(await post(OWNER_B, idB)).toBe("ok"); // idempotent retry returns the stored run
    expect((await q<{ id: string }>(db, "SELECT id FROM public.opening_postings WHERE owner_id=$1", [OWNER_A])).map((r) => r.id)).toEqual([legacy]);
    await db.close();
  }, T);
});
