// @vitest-environment node
// Isolated restore acceptance on the applied schema (drizzle/migrations 0000–NNNN) in in-memory PGlite: the real
// restore_finance_backup transaction under row security, the realistic multi-entity fixture, same-account and
// cross-account restores, repeat restores and the owner-scoped table inventory. Never touches Cloud.
import { describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { fullSchemaDb, actAs, addUsers } from "../test/full-schema-pglite";
import { strToU8 } from "fflate";
import { BACKUP_EXCLUDED_TABLES, BACKUP_NOT_OWNER_TABLES, BACKUP_TABLES, createBackupZip, investmentTablesToWrite, planRestore, readBackup, type Backup, type BackupRow } from "./backup";
import { COLUMN_JSON_REFS, COLUMN_NOT_REMAPPED, COLUMN_REFS, JSON_COLUMNS_NO_REFS, VERBATIM_TABLES } from "./backup-remap";
import { depreciationEntryKey, ownerPostingId, postingIdFor, resolvePostingIds, stableUuid } from "./books/assets-ledger";
import { ID, OWNER_A, OWNER_B, buildBackupFixture, fixtureFiles } from "../test/backup-fixture";
import { moneyTotals, orphans } from "../test/backup-refs";

const ownerCol = (t: string) => (t === "expenses" ? "employee_id" : "owner_id");

async function exportBackup(db: PGlite, owner: string): Promise<Backup> {
  await actAs(db, owner);
  const data: Backup["data"] = {};
  for (const t of BACKUP_TABLES) data[t] = (await db.query<{ j: BackupRow }>(`SELECT to_jsonb(x) j FROM public.${t} x WHERE ${ownerCol(t)} = $1 ORDER BY 1`, [owner])).rows.map((r) => r.j);
  return { app: "ledgerline", version: 3, owner, exportedAt: "2026-11-09", data };
}

/** Same steps as settings.tsx: the atomic server restore, then investment rows the server did not count. */
async function restore(db: PGlite, owner: string, data: Backup["data"]) {
  await actAs(db, owner);
  const res = (await db.query<{ r: { counts: Record<string, number> } }>("SELECT public.restore_finance_backup($1::jsonb) r", [JSON.stringify(data)])).rows[0]!.r;
  const counts = { ...res.counts };
  for (const t of investmentTablesToWrite(data, counts)) {
    for (const row of data[t] ?? []) {
      const cols = Object.keys(row).map((c) => `"${c}"`).join(", ");
      const set = Object.keys(row).filter((c) => c !== "id").map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");
      await db.query(`INSERT INTO public.${t} (${cols}) SELECT ${cols} FROM jsonb_populate_record(NULL::public.${t}, $1::jsonb) ON CONFLICT (id) DO UPDATE SET ${set}`, [JSON.stringify(row)]);
    }
    counts[t] = data[t]?.length ?? 0;
  }
  return counts;
}

const rowCounts = async (db: PGlite, owner: string) => {
  await actAs(db, owner);
  const out: Record<string, number> = {};
  for (const t of BACKUP_TABLES) out[t] = (await db.query<{ n: number }>(`SELECT count(*)::int n FROM public.${t} WHERE ${ownerCol(t)} = $1`, [owner])).rows[0]!.n;
  return out;
};
/** Test-only loose view of stored preference JSON (shape varies by register). */
type Loose = ReturnType<typeof JSON.parse>;
const prefs = (b: Backup): Loose => b.data.finance_preferences?.[0]?.["data"];
const withoutClosures = (p: Loose) => ({ ...p, books: { ...p["books"], closedPeriods: undefined, periodLog: undefined } });

async function seeded() {
  const db = await fullSchemaDb();
  await addUsers(db, { [OWNER_A]: "a@x.in", [OWNER_B]: "b@x.in" });
  const fixture = await buildBackupFixture();
  await restore(db, OWNER_A, (await planRestore(fixture, OWNER_A)).data);
  return { db, fixture };
}

describe("owner-scoped table inventory", () => {
  it("every owner-scoped table in the applied schema is backed up or excluded with a reason; classifications stay current", async () => {
    const db = await fullSchemaDb();
    const owned = (await db.query<{ t: string }>(`SELECT DISTINCT c.table_name t FROM information_schema.columns c JOIN information_schema.tables x ON x.table_schema = c.table_schema AND x.table_name = c.table_name AND x.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public' AND c.column_name IN ('owner_id', 'employee_id') ORDER BY 1`)).rows.map((r) => r.t);
    const unclassified = owned.filter((t) => !(BACKUP_TABLES as readonly string[]).includes(t) && !(t in BACKUP_EXCLUDED_TABLES));
    expect(unclassified).toEqual([]);
    const all = new Set((await db.query<{ t: string }>("SELECT table_name t FROM information_schema.tables WHERE table_schema = 'public'")).rows.map((r) => r.t));
    expect([...BACKUP_TABLES, ...Object.keys(BACKUP_EXCLUDED_TABLES), ...Object.keys(BACKUP_NOT_OWNER_TABLES)].filter((t) => !all.has(t))).toEqual([]);
    // Every base table of the applied schema has exactly one backup decision (owner column or not).
    const base = (await db.query<{ t: string }>("SELECT table_name t FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1")).rows.map((r) => r.t);
    const decided = [...BACKUP_TABLES, ...Object.keys(BACKUP_EXCLUDED_TABLES), ...Object.keys(BACKUP_NOT_OWNER_TABLES)];
    expect(base.filter((t) => !decided.includes(t))).toEqual([]);
    expect(decided.length).toBe(new Set(decided).size);
    expect(Object.keys(BACKUP_NOT_OWNER_TABLES).filter((t) => owned.includes(t))).toEqual([]);
    for (const t of ["demat_accounts", "security_holdings"]) expect(BACKUP_TABLES as readonly string[]).toContain(t);
    await db.close();
  }, 120000);

  it("every id-like and JSON column of a backed-up table is classified", async () => {
    const db = await fullSchemaDb();
    const cols = (await db.query<{ t: string; c: string; ty: string }>(`SELECT table_name t, column_name c, data_type ty FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1)`, [[...BACKUP_TABLES]])).rows;
    const problems = cols.filter(({ t, c, ty }) => {
      if ((VERBATIM_TABLES as readonly string[]).includes(t) || c === "id") return false;
      if (ty === "jsonb") return !(`${t}.${c}` in JSON_COLUMNS_NO_REFS) && !(COLUMN_JSON_REFS[t] ?? []).some((r) => r.path.startsWith(`${c}.`) || r.path.startsWith(`${c}[`) || r.path.startsWith(`${c}{`));
      if (ty === "uuid" || c.endsWith("_id")) return !(c in (COLUMN_REFS[t] ?? {})) && !(c in COLUMN_NOT_REMAPPED);
      return false;
    }).map(({ t, c }) => `${t}.${c}`);
    expect(problems).toEqual([]);
    await db.close();
  }, 120000);
});

describe("restore_finance_backup with the realistic fixture (applied schema)", () => {
  it("seeds every table; investment rows are written after the server restore when the server does not count them", async () => {
    const { db, fixture } = await seeded();
    const counts = await rowCounts(db, OWNER_A);
    for (const t of BACKUP_TABLES) if (!(VERBATIM_TABLES as readonly string[]).includes(t)) expect(counts[t], t).toBe(fixture.data[t]?.length ?? 0);
    expect(counts["period_close_evidence"]).toBe(0); // archived as unverified history, never live evidence
    const exported = await exportBackup(db, OWNER_A);
    expect(withoutClosures(prefs(exported))).toEqual(withoutClosures(prefs(fixture)));
    expect(orphans(exported.data)).toEqual([]);
    await db.close();
  }, 120000);

  it("cross-account restore: zero orphans in the database, identical counts and totals, repeat restore does not duplicate, source untouched", async () => {
    const { db } = await seeded();
    const fromA = await exportBackup(db, OWNER_A);
    const plan = await planRestore(fromA, OWNER_B, { stageFiles: true });
    expect(plan.report.unmapped).toEqual([]);
    expect(plan.report.unclassified).toEqual([]);
    await restore(db, OWNER_B, plan.data);
    const toB = await exportBackup(db, OWNER_B);
    expect(orphans(toB.data)).toEqual([]);
    const { rows: rowsA, ...totalsA } = moneyTotals(fromA.data);
    const { rows: rowsB, ...totalsB } = moneyTotals(toB.data);
    expect(totalsB).toEqual(totalsA);
    expect(rowsB).toEqual(rowsA);
    expect(withoutClosures(prefs(toB))).toEqual(withoutClosures(prefs({ ...fromA, data: plan.data })));
    // Database-level links resolve inside B's own rows.
    await actAs(db, OWNER_B);
    const [links] = (await db.query<{ bad: number }>(`SELECT
      (SELECT count(*) FROM public.documents d WHERE d.owner_id = $1 AND d.transaction_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = d.transaction_id AND e.employee_id = $1))
    + (SELECT count(*) FROM public.expenses e WHERE e.employee_id = $1 AND e.account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = e.account_id AND a.owner_id = $1))
    + (SELECT count(*) FROM public.security_holdings h WHERE h.owner_id = $1 AND NOT EXISTS (SELECT 1 FROM public.demat_accounts d WHERE d.id = h.demat_id AND d.owner_id = $1)) AS bad`, [OWNER_B])).rows;
    expect(Number(links!.bad)).toBe(0);
    const once = await rowCounts(db, OWNER_B);
    await restore(db, OWNER_B, (await planRestore(fromA, OWNER_B, { stageFiles: true })).data);
    expect(await rowCounts(db, OWNER_B)).toEqual(once);
    expect(await exportBackup(db, OWNER_A)).toEqual(fromA);
    await db.close();
  }, 120000);

  it("legacy v1 JSON and v2 ZIP backups restore through the real restore function", async () => {
    const db = await fullSchemaDb();
    const C = "00000000-0000-4000-8000-0000000000c3";
    await addUsers(db, { [OWNER_A]: "a@x.in", [OWNER_B]: "b@x.in", [C]: "c@x.in" });
    const full = await buildBackupFixture();
    const v1Tables = ["finance_preferences", "family_members", "accounts", "category_budgets", "expenses", "commitments", "loans", "goals", "asset_valuations", "documents"] as const;
    const v1 = readBackup(strToU8(JSON.stringify({ app: "ledgerline", version: 1, exportedAt: "2025-01-01", data: Object.fromEntries(v1Tables.map((t) => [t, full.data[t]])) })), false).backup;
    const v2: Backup = { ...JSON.parse(JSON.stringify(full)) as Backup, version: 2 };
    delete v2.data.demat_accounts; delete v2.data.security_holdings;
    const v2read = readBackup(createBackupZip(v2, fixtureFiles(v2)), true).backup;
    for (const [owner, backup] of [[OWNER_B, v1], [C, v2read]] as const) {
      const plan = await planRestore(backup, owner, { stageFiles: true });
      expect(plan.report.crossAccount).toBe(true);
      const counts = await restore(db, owner, plan.data);
      expect(counts["demat_accounts"] ?? 0).toBe(0);
      const back = await exportBackup(db, owner);
      for (const t of v1Tables) expect(back.data[t]?.length, `${backup.version} ${t}`).toBe(backup.data[t]?.length ?? 0);
      expect(moneyTotals(back.data).entries).toEqual(moneyTotals(backup.data).entries);
    }
    // v2 carries drafts, so everything resolves; v1 never had draft rows (its only unresolved link is the statement
    // upload's draft link, which shares the saved entry's id and follows it).
    expect(orphans((await exportBackup(db, C)).data)).toEqual([]);
    expect(orphans((await exportBackup(db, OWNER_B)).data).map((o) => o.path)).toEqual(["finance_preferences[0].data.statementUploads[0].linkedDrafts[0].draftId"]);
    await db.close();
  }, 120000);

  it("same-account restore twice keeps one copy and byte-identical preferences", async () => {
    const { db } = await seeded();
    const before = await exportBackup(db, OWNER_A);
    await restore(db, OWNER_A, (await planRestore(before, OWNER_A)).data);
    const once = await rowCounts(db, OWNER_A);
    await restore(db, OWNER_A, (await planRestore(before, OWNER_A)).data);
    const after = await exportBackup(db, OWNER_A);
    // Live records keep one copy; the backup's closing history is archived once as unverified history (the archive
    // id is a hash of the history, so the repeat restore adds nothing).
    const expected = Object.fromEntries(BACKUP_TABLES.map((t) => [t, before.data[t]?.length ?? 0]));
    expect(once).toEqual({ ...expected, imported_period_history: expected["imported_period_history"]! + 1 });
    expect(await rowCounts(db, OWNER_A)).toEqual(once);
    expect(JSON.stringify(prefs(after))).toBe(JSON.stringify(prefs(before)));
    const strip = (b: Backup) => JSON.stringify({ ...b.data, imported_period_history: undefined }, (k, v: unknown) => (k === "updated_at" || k.endsWith("revision") ? undefined : v)); // server-managed save markers
    expect(strip(after)).toBe(strip(before));
    await db.close();
  }, 120000);

  it("legacy depreciation ids collide across owners in the database; owner-scoped ids do not (R12)", async () => {
    const { db } = await seeded();
    await restore(db, OWNER_B, (await planRestore(await exportBackup(db, OWNER_A), OWNER_B)).data);
    const key = depreciationEntryKey(ID.laptopAsset, "2026-05");
    const legacy = await stableUuid(...key);
    const insert = async (owner: string, id: string) => { await actAs(db, owner); return (await db.query("INSERT INTO public.expenses(id,employee_id,title,amount,category,expense_date,account_id) SELECT $1,$2,'Depreciation · Laptop · 2026-05',3333.33,'Depreciation','2026-05-31',(SELECT id FROM public.accounts WHERE owner_id=$2 AND name='Fixed assets') ON CONFLICT (id) DO NOTHING RETURNING id", [id, owner])).rows.length; };
    expect(await insert(OWNER_A, legacy)).toBe(1); // A posts May with the old key-only id
    expect(await insert(OWNER_B, legacy)).toBe(0); // B's old-style post silently conflicts: the collision
    const b = await postingIdFor(OWNER_B, key, new Set());
    expect(await insert(OWNER_B, b.id)).toBe(1);
    expect(b.id).not.toBe(legacy);
    await db.close();
  }, 120000);

  it("the original owner's saved legacy posting is reused even when the screen has not loaded it (no second copy)", async () => {
    const { db } = await seeded();
    const key = depreciationEntryKey(ID.laptopAsset, "2026-04");
    const legacy = await stableUuid(...key);
    const saved = async (ids: string[]) => { await actAs(db, OWNER_A); return new Set((await db.query<{ id: string }>("SELECT id FROM public.expenses WHERE employee_id = $1 AND id = ANY($2::uuid[])", [OWNER_A, ids])).rows.map((r) => r.id)); };
    expect((await saved([legacy])).has(legacy)).toBe(true); // posted in April under the legacy id (fixture)
    const count = async () => { await actAs(db, OWNER_A); return (await db.query<{ n: number }>("SELECT count(*)::int n FROM public.expenses WHERE employee_id = $1 AND title LIKE 'Depreciation%2026-04'", [OWNER_A])).rows[0]!.n; };
    const post = async (id: string) => { await actAs(db, OWNER_A); await db.query("INSERT INTO public.expenses(id,employee_id,title,amount,category,expense_date) VALUES ($1,$2,'Depreciation · Laptop · 2026-04',3333.33,'Depreciation','2026-04-30') ON CONFLICT (id) DO NOTHING", [id, OWNER_A]); };
    // Choosing from an incomplete on-screen list would pick a fresh id and save a second April entry.
    const guessed = await postingIdFor(OWNER_A, key, new Set());
    expect(guessed.id).toBe(await ownerPostingId(OWNER_A, key));
    // Checking the saved records reuses the legacy id, so a retry stays idempotent.
    const [checked] = await resolvePostingIds(OWNER_A, [key], saved);
    expect(checked).toEqual({ id: legacy, posted: true });
    await post(checked!.id);
    expect(await count()).toBe(1);
    await post(guessed.id);
    expect(await count()).toBe(2); // what the unchecked id would have done
    await db.close();
  }, 120000);

  it("a backup holding a legacy and an owner-scoped copy of one posting restores both rows across accounts", async () => {
    const { db } = await seeded();
    const key = depreciationEntryKey(ID.laptopAsset, "2026-04");
    await actAs(db, OWNER_A);
    await db.query("INSERT INTO public.expenses(id,employee_id,title,amount,category,expense_date) VALUES ($1,$2,'Depreciation · Laptop · 2026-04 (copy)',3333.33,'Depreciation','2026-04-30')", [await ownerPostingId(OWNER_A, key), OWNER_A]);
    const fromA = await exportBackup(db, OWNER_A);
    const plan = await planRestore(fromA, OWNER_B);
    expect(new Set(plan.data.expenses?.map((e) => e["id"])).size).toBe(fromA.data.expenses?.length);
    await restore(db, OWNER_B, plan.data);
    expect((await rowCounts(db, OWNER_B))["expenses"]).toBe(fromA.data.expenses?.length);
    await db.close();
  }, 120000);
});
