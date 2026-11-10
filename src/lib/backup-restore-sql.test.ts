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
import { accountValue, ledgerView, netWorth, txnFromRow, type Account, type LedgerRow } from "./ledger";
import { outstandingOf } from "./reimbursements";
import { fingerprintLines } from "./statement-fingerprint";
import { statementLineRef } from "./statement-line-claims";

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

// ---------------------------------------------------------------------------------------------------------------------------
// P0 closure (Track A, KK: "cross-account backup restore integrity ... must be resolved before production eligibility").
// The realistic fixture plus three statement/withdrawal rows, restored from owner A into owner B through the REAL
// restore_finance_backup transaction (row security as B). Every figure is recomputed from each owner's own database rows by
// the REAL readers (txnFromRow → ledgerView → accountBalance / netWorth / outstandingOf) and compared with hand-calculated values.
describe("cross-account restore integrity: figures, embedded references, source untouched, failed restore", () => {
  // Hand-calculated (fixture, after ledgerView): HDFC Savings 50,000.00 − 2,500.00 groceries + 16,600.00 bounced − 16,600.00 its
  // reversal + 16,600.00 claim back + 1,000,000.00 loan disbursal − 3,000.00 maintenance (the 5,000.00 "Card bill" is a transfer
  // counterpart row, never counted) = 1,061,100.00; then the rows added here: − 1,234.50 (statement line) − 649.00 (Statement
  // Desk document line); the withdrawn 450.00 is excluded → 1,059,216.50. HDFC Visa owes 16,600.00 (hotel). KR Current 250,000.00
  // − 120,000.00 − 18,305.08 = 111,694.92. Fixed assets: valuation 112,000.00 (30 Jun) is the account value. USD wallet 0.
  // Net worth = 1,059,216.50 + 111,694.92 + 112,000.00 + 0 − 16,600.00 = 1,266,311.42. Loan outstanding (loans row) 950,000.00.
  // Claims outstanding: the hotel claim is received in full → 0.00.
  const HAND = { "HDFC Savings": 1059216.5, "HDFC Visa": 16600, "KR Current": 111694.92, "Fixed assets": 112000, "USD wallet": 0 } as Record<string, number>;
  const SL = "00000000-0000-4000-8000-00000000c101", DOCREF = "00000000-0000-4000-8000-00000000c102", WD = "00000000-0000-4000-8000-00000000c103";
  async function figuresOf(db: PGlite, owner: string) {
    await actAs(db, owner);
    const rows = (await db.query<{ j: LedgerRow & Record<string, unknown> }>("SELECT to_jsonb(e) j FROM public.expenses e WHERE employee_id = $1", [owner])).rows.map((r) => r.j);
    const accounts = (await db.query<{ j: Record<string, unknown> }>("SELECT to_jsonb(a) j FROM public.accounts a WHERE owner_id = $1", [owner])).rows.map((r) => ({ id: String(r.j["id"]), name: String(r.j["name"]), kind: r.j["kind"] as Account["kind"], openingBalance: Number(r.j["opening_balance"]), archived: !!r.j["archived"] }));
    const valuations = (await db.query<{ j: Record<string, unknown> }>("SELECT to_jsonb(v) j FROM public.asset_valuations v WHERE owner_id = $1", [owner])).rows.map((r) => ({ accountId: String(r.j["account_id"]), value: Number(r.j["value"]), valuedOn: String(r.j["valued_on"]), source: String(r.j["source"]) }));
    const loans = (await db.query<{ p: string }>("SELECT coalesce(sum(principal_outstanding),0)::text p FROM public.loans WHERE owner_id = $1", [owner])).rows[0]!.p;
    await actAs(db, null);
    const view = ledgerView(rows.map(txnFromRow));
    const claims = rows.filter((r) => r["reimbursement_status"] !== "none" && r["txn_type"] === "expense").map((r) => outstandingOf({ amount: Number(r["amount"]), reimbursementStatus: r["reimbursement_status"], reimbursement: r["reimbursement"] } as never));
    return {
      balances: Object.fromEntries(accounts.map((a) => [a.name, accountValue(a, view, valuations).value])),
      netWorth: netWorth(accounts, view, valuations).net,
      loanOutstanding: Number(loans),
      claimsOutstanding: claims.reduce((s, x) => s + x, 0),
      entries: view.length,
    };
  }

  it("B's restored copy has A's hand-calculated figures; every embedded id is B's own; A is untouched; a failed restore changes nothing", async () => {
    const { db } = await seeded();
    await actAs(db, null);
    const fps = fingerprintLines([{ ref: "1", date: "2026-04-11", description: "UPI/SWIGGY/412345678901", amount: 1234.5, direction: "debit" }], ID.bank);
    const lineRef = statementLineRef(fps[0]!);
    const docRef = `document:${ID.statement} · 2026-04-12 · NETFLIX SUBSCRIPTION`;
    const withdrawal = { state: "withdrawn", at: "2026-04-13T10:00:00.000Z", by: OWNER_A, reason: "Entered twice by mistake", history: [{ action: "withdrawn", at: "2026-04-13T10:00:00.000Z", by: OWNER_A, reason: "Entered twice by mistake" }] };
    const add = "INSERT INTO public.expenses(id,employee_id,title,category,amount,original_amount,currency,expense_date,account_id,description,statement_ref,reconciled_at,receipt_details) VALUES ($1,$2,$3,'Food and beverages',$4,$4,'INR',$5,$6,'',$7,$8,$9::jsonb)";
    await db.query(add, [SL, OWNER_A, "Swiggy", 1234.5, "2026-04-11", ID.bank, lineRef, "2026-04-12T00:00:00Z", "{}"]);
    await db.query(add, [DOCREF, OWNER_A, "Netflix", 649, "2026-04-12", ID.bank, docRef, "2026-04-12T00:00:00Z", "{}"]);
    await db.query(add, [WD, OWNER_A, "Lunch", 450, "2026-04-13", ID.bank, null, null, JSON.stringify({ withdrawal })]);
    // A Statement Desk upload whose evidence and undo rows carry the same document reference.
    await db.query("UPDATE public.finance_preferences SET data = jsonb_set(data, '{statementUploads}', $2::jsonb) WHERE owner_id = $1", [OWNER_A, JSON.stringify([{ id: "00000000-0000-4000-8000-00000000c1a0", label: "hdfc-apr.pdf", at: "2026-04-12T00:00:00Z", posted: [DOCREF], reconciled: [], sources: [{ documentId: ID.statement, accountId: ID.bank }], evidence: [{ id: DOCREF, ref: docRef }], undoRows: [{ id: DOCREF, ref: docRef, revision: 0 }] }])]);

    const figA = await figuresOf(db, OWNER_A);
    expect(figA.balances).toEqual(HAND);
    expect(figA.netWorth).toBe(1266311.42);
    expect(figA.loanOutstanding).toBe(950000);
    expect(figA.claimsOutstanding).toBe(0);

    const fromA = await exportBackup(db, OWNER_A);
    const plan = await planRestore(fromA, OWNER_B, { stageFiles: true });
    expect(plan.report.unmapped).toEqual([]);
    expect(plan.report.unclassified).toEqual([]);
    await restore(db, OWNER_B, plan.data);
    const toB = await exportBackup(db, OWNER_B);
    const figB = await figuresOf(db, OWNER_B);
    expect(figB).toEqual(figA);

    // Every owner-linked row id of A is replaced in B's rows (verbatim closure archives excepted: unverified history by design).
    const aIds = new Set(BACKUP_TABLES.flatMap((t) => (fromA.data[t] ?? []).map((r) => r["id"]).filter((x): x is string => typeof x === "string")));
    // PREFERENCE_VERBATIM sections (preserved originals, frozen return drafts, closure history) are archived as saved, by design.
    const withoutVerbatim = (r: Record<string, unknown>) => { const d = { ...(r["data"] as Record<string, unknown>) }; delete d["preservedRecords"]; d["books"] = { ...(d["books"] as Record<string, unknown>), savedDrafts: undefined, closedPeriods: undefined, periodLog: undefined }; return { ...r, data: d }; };
    const leaks: string[] = [];
    for (const t of BACKUP_TABLES) {
      if ((VERBATIM_TABLES as readonly string[]).includes(t)) continue;
      for (const r of toB.data[t] ?? []) for (const m of JSON.stringify(t === "finance_preferences" ? withoutVerbatim(r) : r).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? []) if (aIds.has(m)) leaks.push(`${t}:${m}`);
    }
    expect(leaks).toEqual([]);
    // The statement references follow the restored rows: the account and document named in them are B's own.
    const bId = (t: "accounts" | "documents", old: string) => plan.data[t]![(fromA.data[t] ?? []).findIndex((x) => x["id"] === old)]!["id"] as string;
    const bRows = (toB.data["expenses"] ?? []) as Record<string, unknown>[];
    const bBank = bId("accounts", ID.bank), bStatement = bId("documents", ID.statement);
    expect(bRows.map((r) => r["statement_ref"])).toContain(lineRef.replace(ID.bank, bBank));
    expect(bRows.map((r) => r["statement_ref"])).toContain(docRef.replace(ID.statement, bStatement));
    const bUpload = ((toB.data["finance_preferences"]![0]!["data"] as Record<string, unknown>)["statementUploads"] as { evidence: { id: string; ref: string }[]; undoRows: { id: string; ref: string }[] }[])[0]!;
    const bDocEntry = bRows.find((r) => r["statement_ref"] === docRef.replace(ID.statement, bStatement))!;
    expect(bUpload.evidence).toEqual([{ id: bDocEntry["id"], ref: bDocEntry["statement_ref"] }]); // evidence still matches its entry
    expect(bUpload.undoRows[0]).toMatchObject({ id: bDocEntry["id"], ref: bDocEntry["statement_ref"] });
    // The withdrawn entry stays withdrawn with its history (actor = the person who withdrew it), excluded from B's figures.
    const bWd = bRows.find((r) => (r["receipt_details"] as { withdrawal?: unknown } | null)?.withdrawal);
    expect((bWd!["receipt_details"] as { withdrawal: unknown }).withdrawal).toEqual(withdrawal);
    // Archive entries follow their rows (recordArchive ids "<table>:<B row id>").
    const bArchive = ((toB.data["finance_preferences"]![0]!["data"] as Record<string, unknown>)["recordArchive"] as { id: string; recordId: string }[]);
    for (const e of bArchive) { expect(aIds.has(e.recordId)).toBe(false); expect(e.id.endsWith(e.recordId)).toBe(true); }
    // A is untouched.
    expect(await exportBackup(db, OWNER_A)).toEqual(fromA);
    expect(await figuresOf(db, OWNER_A)).toEqual(figA);

    // Failure injection: a restore whose last table holds an invalid row fails inside the transaction → B and A exactly as before.
    const broken = { ...plan.data, documents: [...(plan.data["documents"] ?? []), { id: "00000000-0000-4000-8000-00000000c1ff", title: null, file_path: null }] };
    await expect(restore(db, OWNER_B, broken)).rejects.toThrow();
    expect(await exportBackup(db, OWNER_B)).toEqual(toB);
    expect(await figuresOf(db, OWNER_B)).toEqual(figB);
    expect(await exportBackup(db, OWNER_A)).toEqual(fromA);
    await db.close();
  }, 180000);
});

describe("restore and withdrawn entries (RB-LED-01 / P0-033), with and without proposed P10", () => {
  for (const withP10 of [false, true]) {
    it(`${withP10 ? "with P10" : "applied schema"}: cross-account restore keeps a withdrawal with its history; an older same-account backup ${withP10 ? "never reinstates" : "REINSTATES (recorded gap)"} a withdrawn entry`, async () => {
      const db = await fullSchemaDb(withP10 ? [".lovable/staged-sql/proposed/P10_unposted_entry_withdrawal.sql"] : []);
      await addUsers(db, { [OWNER_A]: "a@x.in", [OWNER_B]: "b@x.in" });
      await actAs(db, null);
      await db.query("INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1,'{}')", [OWNER_A]);
      await db.query("INSERT INTO public.accounts(id, owner_id, name, kind, opening_balance) VALUES ($1,$2,'HDFC Savings','savings',10000)", [ID.bank, OWNER_A]);
      const E1 = "00000000-0000-4000-8000-00000000d001";
      await db.query("INSERT INTO public.expenses(id,employee_id,title,category,amount,original_amount,currency,expense_date,account_id,description) VALUES ($1,$2,'Lunch','Food and beverages',450,450,'INR','2026-11-09',$3,'')", [E1, OWNER_A, ID.bank]);
      const older = await exportBackup(db, OWNER_A); // taken before the withdrawal
      // Withdraw (P10 function, or the app's pre-P10 server path: the same receipt_details shape)
      const w = { state: "withdrawn", at: "2026-11-10T10:00:00.000Z", by: OWNER_A, reason: "Entered twice by mistake", history: [{ action: "withdrawn", at: "2026-11-10T10:00:00.000Z", by: OWNER_A, reason: "Entered twice by mistake" }] };
      if (withP10) { await actAs(db, OWNER_A); await db.query("SELECT public.withdraw_entry($1, 'Entered twice by mistake')", [E1]); }
      else await db.query("UPDATE public.expenses SET receipt_details = jsonb_build_object('withdrawal', $2::jsonb) WHERE id = $1", [E1, JSON.stringify(w)]);
      const balance = async (owner: string) => { await actAs(db, owner); const rows = (await db.query<{ j: LedgerRow }>("SELECT to_jsonb(e) j FROM public.expenses e WHERE employee_id = $1", [owner])).rows.map((r) => r.j); const acc = (await db.query<{ id: string }>("SELECT id FROM public.accounts WHERE owner_id = $1", [owner])).rows[0]!; return accountValue({ id: acc.id, name: "x", kind: "savings", openingBalance: 10000, archived: false }, ledgerView(rows.map(txnFromRow))).value; };
      expect(await balance(OWNER_A)).toBe(10000); // 10,000.00; the withdrawn 450.00 is excluded
      // cross-account: B gets the entry still withdrawn, history intact (INSERT with a complete valid history is accepted by P10)
      const now = await exportBackup(db, OWNER_A);
      await restore(db, OWNER_B, (await planRestore(now, OWNER_B, { stageFiles: true })).data);
      await actAs(db, OWNER_B);
      const bw = (await db.query<{ w: { state: string; history: unknown[] } }>("SELECT receipt_details->'withdrawal' w FROM public.expenses WHERE employee_id = $1", [OWNER_B])).rows[0]!.w;
      expect(bw.state).toBe("withdrawn");
      expect(bw.history).toHaveLength(1);
      expect(await balance(OWNER_B)).toBe(10000);
      // same-account restore of the OLDER backup (taken before the withdrawal)
      await restore(db, OWNER_A, older.data);
      await actAs(db, OWNER_A);
      const aw = (await db.query<{ w: { state: string } | null }>("SELECT receipt_details->'withdrawal' w FROM public.expenses WHERE id = $1", [E1])).rows[0]!.w;
      if (withP10) { expect(aw?.state).toBe("withdrawn"); expect(await balance(OWNER_A)).toBe(10000); }
      else { expect(aw).toBeNull(); expect(await balance(OWNER_A)).toBe(9550); } // recorded: the entry counts again (P0-033; closed by P10)
      await db.close();
    }, 180000);
  }
});
