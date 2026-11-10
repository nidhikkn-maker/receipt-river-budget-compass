// @vitest-environment node
// Phase 3 completion, item 4: asset depreciation integrated with balanced accounting (PROPOSED
// P8_asset_depreciation_posting.sql on P6 registers + P7 r2). Approved book depreciation posts a balanced
// batch in the asset's legal entity; prepared (monthly job) depreciation posts nothing; archived assets
// still depreciate (P0-001); one depreciation per asset and month; disposal stays a separate workflow.
// Also proves the whole proposed stack installs together (P1, P2, P4, P5, P5b, P6, P7, P8) and that the
// rollback chain refuses out of order and restores the catalog exactly.
// Isolated in-memory PGlite (drizzle/migrations 0000-0088 + proposed SQL). Never Cloud.
import { describe, it, expect, beforeAll } from "vitest";
import { actAs, readSql } from "../test/full-schema-pglite";
import {
  ACC, C1, DIR, INSERT_EXPENSE, P5_RB, P7, P7_RB, T, U, activate, as, attempt, e, entityId, errorText, exParams, first, id, journalTb, personalKey, q, seededDb,
  stepUp, type Db, type Ex,
} from "../test/phase3-fixture";

const P5B = `${DIR}P5b_restore_investments.sql`;
const P6 = `${DIR}P6_registers.sql`;
const P6_RB = `${DIR}P6_registers.rollback.sql`;
const P8 = `${DIR}P8_asset_depreciation_posting.sql`;
const P8_RB = `${DIR}P8_asset_depreciation_posting.rollback.sql`;
const PERSONAL = personalKey(U.O);
const FA = { c1: id(151), p: id(152), wrong: id(153) } as const;
const ASSETS = [
  { id: "ast-laptop", name: "Design laptop", kind: "computer", cost: 120000, inUse: "2026-04-01", ownerEntityId: C1, sharePct: 100, bookMethod: "slm", bookRatePct: 0, usefulLifeYears: 5, accountId: FA.c1 },
  // archived (status only, P0-001): still depreciates
  { id: "ast-car", name: "Family car", kind: "vehicle", cost: 600000, inUse: "2026-04-01", sharePct: 100, bookMethod: "slm", bookRatePct: 15, accountId: FA.p,
    archivedAt: "2026-06-30T10:00:00.000Z", archiveReason: "Moved to the village house", archivedBy: U.O },
  // a C1 asset whose ledger account sits in the personal books: never an inter-entity guess
  { id: "ast-printer", name: "Office printer", kind: "computer", cost: 24000, inUse: "2026-04-01", ownerEntityId: C1, sharePct: 100, bookMethod: "slm", bookRatePct: 0, usefulLifeYears: 4, accountId: FA.wrong },
];
const DEP = { laptopMay: id(9501), carMay: id(9502), printerMay: id(9503), laptopMayDup: id(9504), laptopJun: id(9505), disposal: id(9506) } as const;
/** The entry the app's Approve & add saves (assets-ledger.ts depreciationEntry): non-cash adjustment lowering the asset account. */
const dep = (entry: string, acc: string, date: string, amount: number, title: string, tags = ["depreciation"]): Ex =>
  ({ id: entry, acc, date, amount, type: "adjustment", adjSign: -1, category: "Depreciation", title, tags });
const CATALOG = `
  SELECT 'f' k, p.oid::regprocedure::text n, md5(p.prosrc) || coalesce(p.proacl::text, '') || p.prosecdef::text v FROM pg_proc p WHERE p.pronamespace IN ('public'::regnamespace, 'phase3_p7'::regnamespace, 'security_p4'::regnamespace)
  UNION ALL SELECT 't', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) || t.tgenabled::text FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
  UNION ALL SELECT 'p', tablename || '.' || policyname, coalesce(qual, '') || coalesce(with_check, '') FROM pg_policies WHERE schemaname = 'public'
  UNION ALL SELECT 'c', table_name || '.' || column_name, data_type || is_nullable FROM information_schema.columns WHERE table_schema = 'public'
  UNION ALL SELECT 'n', nspname, '' FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema', 'security_rollback_archive') ORDER BY 1, 2`;
const catalog = async (db: Db) => { await actAs(db, null); return (await q<{ k: string; n: string; v: string }>(db, CATALOG)).map((r) => `${r.k}|${r.n}|${r.v}`); };

/** The app's approval: the adjustment entry is saved, then the journal is marked posted with the entry id. */
async function approve(db: Db, journals: Record<string, unknown>[]) {
  await actAs(db, null);
  await q(db, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{books,journals}', $2::jsonb) WHERE owner_id = $1", [U.O, JSON.stringify(journals)]);
}
const lines = async (db: Db, entry: string) => {
  await actAs(db, null);
  return q<{ k: string; code: string; s: string }>(db, `SELECT le.entity_key k, l.code, l.signed_amount::text s FROM public.posting_lines l JOIN public.posting_batches b ON b.id = l.batch_id
    JOIN public.legal_entities le ON le.id = b.legal_entity_id JOIN public.posting_events ev ON ev.id = b.event_id
    WHERE ev.event_key = 'ledger_entry:' || $1 AND b.kind <> 'reversal' AND NOT EXISTS (SELECT 1 FROM public.posting_batches r WHERE r.reverses_id = b.id) ORDER BY l.code`, [entry]);
};
const planExceptions = async (db: Db) => { await actAs(db, null); return first(await q<{ p: { exceptions: { exception: string; entryId?: string }[] } }>(db, "SELECT phase3_p7.plan($1) p", [U.O])).p.exceptions; };

describe("P8: approved depreciation posts balanced in the asset's legal entity", () => {
  let db: Db;
  let cat7: string[];
  const J = (jid: string, assetId: string, period: string, amount: number, status: "prepared" | "posted", tx?: string) => ({ id: jid, assetId, period, amount, kind: "book", status, ...(tx ? { transactionId: tx, postedOn: "2026-06-05" } : {}) });
  beforeAll(async () => {
    db = await seededDb([P5B, P6, P7]);
    await actAs(db, null);
    for (const [a, n, k] of [[FA.c1, "Alpha fixed assets", "other_asset"], [FA.p, "Car (asset)", "other_asset"], [FA.wrong, "Printer (asset)", "other_asset"]] as const) {
      await q(db, "INSERT INTO public.accounts(id, owner_id, name, kind) VALUES ($1,$2,$3,$4)", [a, U.O, n, k]);
    }
    await q(db, `UPDATE public.finance_preferences SET data = jsonb_set(jsonb_set(data, '{assets}', $2::jsonb), '{books,entityAccounts}', $3::jsonb) WHERE owner_id = $1`,
      [U.O, JSON.stringify(ASSETS), JSON.stringify({ [C1]: [ACC.A1, ACC.A2, FA.c1], "5b1f0c1e-7a3d-4c2e-9f10-0000000000c2": [ACC.B1] })]);
    await activate(db, U.O);
    cat7 = await catalog(db);
    await actAs(db, null);
    await db.exec(readSql(P8));
  }, T);

  it("installs only on P6 + P7 r2 and only once", async () => {
    expect(errorText(await attempt(db, null, () => db.exec(readSql(P8))))).toMatch(/already installed/);
    const { fullSchemaDb } = await import("../test/full-schema-pglite");
    const { P1, P2, P4, P5 } = await import("../test/phase3-fixture");
    await expect(fullSchemaDb([P1, P2, P4, P5, P7, P8])).rejects.toThrow(/requires P6/);
    await expect(fullSchemaDb([P1, P2, P4, P5, P6, P8])).rejects.toThrow(/requires P7/);
  }, T);

  it("prepared depreciation (monthly job) posts nothing; the saved entry before approval is an exception, never a posting", async () => {
    // the scheduled job appends PREPARED journals with the service role (no entry, no posting)
    await approve(db, [J("j-l-05", "ast-laptop", "2026-05", 2000, "prepared"), J("j-c-05", "ast-car", "2026-05", 7500, "prepared"), J("j-p-05", "ast-printer", "2026-05", 500, "prepared")]);
    expect(await lines(db, DEP.laptopMay)).toEqual([]);
    await as(db, U.O, async () => {
      await q(db, INSERT_EXPENSE, exParams(dep(DEP.laptopMay, FA.c1, "2026-05-31", 2000, "Depreciation · Design laptop · 2026-05")));
    });
    expect(await lines(db, DEP.laptopMay)).toEqual([]);
    expect((await planExceptions(db)).find((x) => x.entryId === DEP.laptopMay)?.exception).toBe("depreciation_not_approved");
  });

  it("approval posts Dr Depreciation / Cr the asset account in the asset's entity; archived assets still depreciate; a cross-entity account is an exception", async () => {
    await as(db, U.O, async () => {
      for (const [x, acc, amount, t] of [[DEP.carMay, FA.p, 7500, "Family car"], [DEP.printerMay, FA.wrong, 500, "Office printer"]] as const) {
        await q(db, INSERT_EXPENSE, exParams(dep(x, acc, "2026-05-31", amount, `Depreciation · ${t} · 2026-05`)));
      }
    });
    await approve(db, [J("j-l-05", "ast-laptop", "2026-05", 2000, "posted", DEP.laptopMay), J("j-c-05", "ast-car", "2026-05", 7500, "posted", DEP.carMay), J("j-p-05", "ast-printer", "2026-05", 500, "posted", DEP.printerMay)]);
    expect(await lines(db, DEP.laptopMay)).toEqual([{ k: C1, code: `account:${FA.c1}`, s: "-2000.00" }, { k: C1, code: "expense:Depreciation", s: "2000.00" }]);
    expect(await lines(db, DEP.carMay)).toEqual([{ k: PERSONAL, code: `account:${FA.p}`, s: "-7500.00" }, { k: PERSONAL, code: "expense:Depreciation", s: "7500.00" }]); // archived asset
    expect(await lines(db, DEP.printerMay)).toEqual([]);
    expect((await planExceptions(db)).find((x) => x.entryId === DEP.printerMay)?.exception).toBe("asset_entity_mismatch");
    // every batch balances; never a bank or card line
    const tb = await journalTb(db, U.O);
    expect(Object.values(tb[C1] ?? {}).reduce((s, n) => s + n, 0)).toBe(0);
  });

  it("one depreciation per asset and month; amounts must equal the journal; disposal stays a separate workflow; retries post once", async () => {
    await as(db, U.O, async () => {
      await q(db, INSERT_EXPENSE, exParams(dep(DEP.laptopMayDup, FA.c1, "2026-05-31", 2000, "Depreciation · Design laptop · 2026-05 (again)")));
      await q(db, INSERT_EXPENSE, exParams(dep(DEP.laptopJun, FA.c1, "2026-06-30", 1999, "Depreciation · Design laptop · 2026-06")));
      await q(db, INSERT_EXPENSE, exParams(dep(DEP.disposal, FA.c1, "2026-06-30", 50000, "Laptop written off", ["disposal"])));
      // retry of the same save (same createId) posts nothing new
      await q(db, INSERT_EXPENSE.replace(/\)$/, ") ON CONFLICT (id) DO NOTHING"), exParams(dep(DEP.laptopMay, FA.c1, "2026-05-31", 2000, "Depreciation · Design laptop · 2026-05")));
    });
    await approve(db, [J("j-l-05", "ast-laptop", "2026-05", 2000, "posted", DEP.laptopMay), J("j-c-05", "ast-car", "2026-05", 7500, "posted", DEP.carMay),
      J("j-p-05", "ast-printer", "2026-05", 500, "posted", DEP.printerMay), J("j-l-05b", "ast-laptop", "2026-05", 2000, "posted", DEP.laptopMayDup), J("j-l-06", "ast-laptop", "2026-06", 2000, "posted", DEP.laptopJun)]);
    const exc = Object.fromEntries((await planExceptions(db)).filter((x) => x.entryId).map((x) => [x.entryId, x.exception]));
    expect(exc[DEP.laptopMayDup]).toBe("duplicate_depreciation");
    expect(exc[DEP.laptopJun]).toBe("depreciation_amount_mismatch");
    expect(exc[DEP.disposal]).toBe("asset_disposal_workflow");
    expect(await lines(db, DEP.laptopMay)).toHaveLength(2); // the first approved journal keeps its single posting
    await actAs(db, null);
    expect(first(await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.posting_batches b JOIN public.posting_events ev ON ev.id = b.event_id WHERE ev.event_key = 'ledger_entry:' || $1", [DEP.laptopMay])).n).toBe(1);
    expect((await journalTb(db, U.O))[C1]?.["expense:Depreciation"]).toBe(2000);
  });

  it("the P6 register path agrees: the backfilled register keeps the posting unchanged (asset entity from the register scope)", async () => {
    await actAs(db, U.O);
    const p = first(await q<{ p: { source_sha256: string } }>(db, "SELECT public.preview_register_backfill('assets','{}') p")).p;
    await stepUp(db, U.O);
    await q(db, "SELECT public.commit_register_backfill('assets',$1,'{}')", [p.source_sha256]);
    await actAs(db, null);
    const reg = await q<{ e: string; s: string }>(db, "SELECT entry_id::text e, status s FROM public.depreciation_journals WHERE owner_id = $1 AND entry_id IS NOT NULL ORDER BY entry_id", [U.O]);
    expect(reg.map((r) => r.e)).toContain(DEP.laptopMay);
    expect(await lines(db, DEP.laptopMay)).toEqual([{ k: C1, code: `account:${FA.c1}`, s: "-2000.00" }, { k: C1, code: "expense:Depreciation", s: "2000.00" }]);
    expect(first(await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.posting_batches b JOIN public.posting_events ev ON ev.id = b.event_id WHERE ev.event_key = 'ledger_entry:' || $1", [DEP.laptopMay])).n).toBe(1);
  });

  it("a posted depreciation is corrected by reversal on the correction date like any entry (decision 1)", async () => {
    const r = await attempt(db, U.O, async () => {
      await stepUp(db, U.O);
      const out = first(await q<{ r: { reversalEntryId: string } }>(db, "SELECT public.reverse_ledger_entry($1,$2,'Car depreciation rate was wrong','2026-07-31') r", [id(9601), DEP.carMay])).r;
      return { out, tb: (await journalTb(db, U.O))[PERSONAL] };
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.tb?.["expense:Depreciation"]).toBeUndefined();
    expect(r.value.out.reversalEntryId).toBeTruthy();
  });

  it("the whole stack installs together; rollbacks refuse out of order and restore the catalog exactly", async () => {
    expect(errorText(await attempt(db, null, () => db.exec(readSql(P7_RB))))).toMatch(/P8_asset_depreciation_posting is installed/);
    expect(errorText(await attempt(db, null, () => db.exec(readSql(P6_RB))))).toMatch(/P8_asset_depreciation_posting is installed/);
    expect(errorText(await attempt(db, null, () => db.exec(readSql(P5_RB))))).toMatch(/P8_asset_depreciation_posting is installed/);
    expect(errorText(await attempt(db, null, () => db.exec(readSql(P8_RB))))).toMatch(/depreciation postings exist/);
    await actAs(db, null);
    await db.exec(`SET phase3_p8.rollback_with_postings = 'on'; ${readSql(P8_RB)}; RESET phase3_p8.rollback_with_postings;`);
    expect(await catalog(db)).toEqual(cat7); // P8 rollback restores the exact P6 + P7 catalog
    await db.exec(readSql(P8)); // and re-installs
    await db.exec(`SET phase3_p8.rollback_with_postings = 'on'; ${readSql(P8_RB)}; RESET phase3_p8.rollback_with_postings;`);
    await db.exec(`SET phase3_p7.rollback_archive_postings = 'on'; ${readSql(P7_RB)}; RESET phase3_p7.rollback_archive_postings;`);
    expect(first(await q<{ n: number }>(db, "SELECT count(*)::int n FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'reverses_entry_id'")).n).toBe(0);
    expect(first(await q<{ e: string }>(db, "SELECT tgenabled::text e FROM pg_trigger WHERE tgname = 'clear_empty_category_history'")).e).toBe("O");
    await db.exec(readSql(P7)); // P7 re-installs on P6 after its rollback
    expect(e(1)).toBeTruthy();
  }, T);
});
