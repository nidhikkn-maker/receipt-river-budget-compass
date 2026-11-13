// @vitest-environment node
// Proposed P14 (P0-015 asset disposal approval) install / rollback at the SQL level, isolated PGlite only (never Cloud).
// The approval flow itself (server functions, PostgREST-shaped requests, posting on active books): failure-injection.test.ts D1-D4.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { actAs, addUsers, fullSchemaDb, readSql } from "@/test/full-schema-pglite";
import { disposalPlan } from "./asset-disposal";
import { DEMO_GUEST_STEPS, removeDemoGuestRecords } from "./demo-cleanup";
import type { Asset } from "./assets";

const O = "00000000-0000-4000-8000-000000000001";
const D = ".lovable/staged-sql/proposed/";
const P14 = `${D}P14_asset_disposal_approval.sql`, P14_RB = `${D}P14_asset_disposal_approval.rollback.sql`;
const STACK = ["P1_security_containment", "P2_v31_role_model", "P4_step_up_and_assistant_limits", "P5_legal_entities_foundation", "P5b_restore_investments", "P6_registers", "P7_balanced_posting", "P8_asset_depreciation_posting", "P9_statement_import_idempotency_and_archive_guards", "P10_unposted_entry_withdrawal", "P11_backup_restore_receipts", "P13_team_change_requests"].map((f) => `${D}${f}.sql`);
const CATALOG = `
  SELECT 'f' k, p.oid::regprocedure::text n, md5(p.prosrc) || coalesce(p.proacl::text, '') || p.prosecdef::text v FROM pg_proc p WHERE p.pronamespace IN ('public'::regnamespace) OR p.pronamespace::regnamespace::text = 'phase3_p7'
  UNION ALL SELECT 't', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
  UNION ALL SELECT 'c', table_name || '.' || column_name, data_type FROM information_schema.columns WHERE table_schema = 'public'
  UNION ALL SELECT 'p', tablename || '.' || policyname, cmd || coalesce(qual, '') FROM pg_policies WHERE schemaname = 'public'
  UNION ALL SELECT 'n', nspname, '' FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1, 2`;
const catalog = async (db: PGlite) => { await actAs(db, null); return (await db.query<{ k: string; n: string; v: string }>(CATALOG)).rows.map((r) => `${r.k}|${r.n}|${r.v}`); };

// ---------------------------------------------------------------------------------------------------------------------------
// P14-a (WS-E batch 6-8 check, high): the database must not trust a book value supplied by the caller. Direct RPC calls as
// signed-in users (no server function), whole proposed stack P1..P13 (P4 step-up installed) + P14. Hand-calculated fixture:
// Server cost 3,00,000.00, put to use 2026-04-01, straight line 20% a year = 5,000.00 a month; disposal 2026-10-31 → 7 months
// → book value 2,65,000.00. Corrected-cost fixture (R-E-S2): 61,000.00 at 20% = 1,016.666… a month × 7 = 7,116.666… →
// full precision 53,883.33; the retired per-month rounding gave 53,883.31 (both within the database tolerance).
const V = "00000000-0000-4000-8000-000000000002", F = "00000000-0000-4000-8000-000000000003";
type Row = Record<string, unknown>;
const q1 = async <T = Row>(db: PGlite, uid: string | null, sql: string, params: unknown[] = []) => { await actAs(db, uid); try { return (await db.query<T>(sql, params)).rows; } finally { await actAs(db, null); } };
const err = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return (e as Error).message; } };
async function seed(db: PGlite, owner: string, asset: Row) {
  const acc = crypto.randomUUID(), doc = crypto.randomUUID();
  await actAs(db, null);
  await db.query("INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1, '{}') ON CONFLICT (owner_id) DO NOTHING", [owner]);
  await db.query("INSERT INTO public.accounts(id, owner_id, name, kind, opening_balance) VALUES ($1,$2,'Fixed assets','other_asset',0)", [acc, owner]);
  await db.query("INSERT INTO public.documents(id, owner_id, title, file_path, file_name, size_bytes, notes) VALUES ($1,$2,'Disposal note',$3,'note.pdf',1000,'')", [doc, owner, `${owner}/docs/${doc}-note.pdf`]);
  const a = { id: `ast-${crypto.randomUUID().slice(0, 8)}`, name: "Server", kind: "computer", cost: 300000, inUse: "2026-04-01", sharePct: 100, bookMethod: "slm", bookRatePct: 20, accountId: acc, ...asset };
  await db.query("UPDATE public.finance_preferences SET data = jsonb_set(coalesce(data, '{}'), '{assets}', coalesce(data->'assets', '[]') || $2::jsonb) WHERE owner_id = $1", [owner, JSON.stringify([a])]);
  return { a, acc, doc };
}
// named arguments: p_book_value is the optional, last consistency-check argument (R-E-I15)
const REQ = "SELECT public.request_asset_disposal(p_asset => $1, p_method => 'write_off', p_date => '2026-10-31'::date, p_proceeds => 0, p_proceeds_entry => NULL, p_evidence => ARRAY[$2]::uuid[], p_reason => 'Written off after the fire', p_book_value => $3, p_entry => $4) id";
const stepUp = async (db: PGlite, uid: string) => { await actAs(db, null); await db.exec("SET ROLE service_role"); await db.query("SELECT public.record_step_up($1,'password',300)", [uid]); await actAs(db, null); };

describe("P14-a: the database derives and checks the disposal book value (direct RPC, whole stack + P14)", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await fullSchemaDb([...STACK, P14]);
    await addUsers(db, { [O]: "o@x.in", [V]: "v@x.in", [F]: "f@x.in" });
  }, 600_000);
  afterAll(async () => { await db.close(); });

  it("a forged book value (0, or far from the register) is refused at request and approval; nothing is disposed", async () => {
    const s = await seed(db, O, {});
    for (const forged of [0, 1, 264000, 300000]) {
      expect(await err(q1(db, O, REQ, [s.a.id, s.doc, forged, crypto.randomUUID()]))).toMatch(/P14_BOOK_VALUE/);
    }
    expect((await q1(db, null, "SELECT count(*)::int n FROM public.asset_disposal_requests WHERE owner_id = $1", [O]))[0]).toEqual({ n: 0 });
    // a genuine request cannot be approved with a different (forged) book value either
    const [{ id }] = (await q1<{ id: string }>(db, O, REQ, [s.a.id, s.doc, 265000, crypto.randomUUID()])) as [{ id: string }];
    await stepUp(db, O);
    expect(await err(q1(db, O, "SELECT public.decide_asset_disposal($1, true, 'Approved after review', 0)", [id]))).toMatch(/P14_CHANGED|P14_BOOK_VALUE/);
    const a = (await q1<{ a: Row }>(db, null, "SELECT a FROM public.finance_preferences p, jsonb_array_elements(p.data->'assets') a WHERE p.owner_id = $1 AND a->>'id' = $2", [O, s.a.id]))[0]!.a;
    expect(a["soldOn"]).toBeUndefined();
    await q1(db, O, "SELECT public.cancel_asset_disposal($1, 'Test cleanup only')", [id]);
  });

  it("the correct book value is accepted (exact, and the retired per-month rounding within tolerance); step-up is required to approve", async () => {
    const s = await seed(db, O, {});
    const [{ id }] = (await q1<{ id: string }>(db, O, REQ, [s.a.id, s.doc, 265000, crypto.randomUUID()])) as [{ id: string }];
    const r = (await q1<Row>(db, null, "SELECT book_value::float8 bv, gain::float8 g, inputs->'database' d FROM public.asset_disposal_requests WHERE id = $1", [id]))[0]!;
    expect(r).toMatchObject({ bv: 265000, g: -265000, d: { value: 265000, months: 7, tolerance: 0.54 } });
    await actAs(db, null); await db.query("DELETE FROM public.step_up_grants WHERE owner_id = $1", [O]);
    expect(await err(q1(db, O, "SELECT public.decide_asset_disposal($1, true, 'Approved after review', 265000)", [id]))).toMatch(/STEP_UP_REQUIRED/);
    await stepUp(db, O);
    expect((await q1<{ r: Row }>(db, O, "SELECT public.decide_asset_disposal($1, true, 'Approved after review', 265000) r", [id]))[0]!.r).toMatchObject({ status: "approved" });
    expect((await q1<{ n: number }>(db, null, "SELECT amount::float8 n FROM public.expenses WHERE employee_id = $1 AND 'disposal' = ANY(tags)", [O]))).toEqual([{ n: 265000 }]);
    // corrected-cost fixture: full precision 53,883.33; the retired per-month figure 53,883.31 is within the tolerance
    const c = await seed(db, O, { cost: 61000, name: "Laptop" });
    const [{ id: id2 }] = (await q1<{ id: string }>(db, O, REQ, [c.a.id, c.doc, 53883.31, crypto.randomUUID()])) as [{ id: string }];
    expect((await q1<Row>(db, null, "SELECT inputs->'database'->'value' v FROM public.asset_disposal_requests WHERE id = $1", [id2]))[0]).toEqual({ v: 53883.33 });
    expect(await err(q1(db, O, REQ, [c.a.id, c.doc, 53880, crypto.randomUUID()]))).toMatch(/P14_BOOK_VALUE|P14_PENDING/);
    await q1(db, O, "SELECT public.cancel_asset_disposal($1, 'Test cleanup only')", [id2]);
    expect(await err(q1(db, O, REQ, [c.a.id, c.doc, 53880, crypto.randomUUID()]))).toMatch(/P14_BOOK_VALUE: the book value 53880.00 does not follow from the register \(the database works out 53883.33\)/);
  });

  // R-E-I15 (P14-a residual, WS-E independent check): an in-tolerance but different caller figure was STORED and posted.
  // Corrected-cost fixture: the database works out 53,883.33 (tolerance 0.54 for 7 months). 53,883.87 / 53,882.79 are inside.
  const stored = async (id: string) => (await q1<Row>(db, null, "SELECT book_value::text bv, gain::text g, status FROM public.asset_disposal_requests WHERE id = $1", [id]))[0]!;
  const assetRow = async (owner: string, assetId: string) => (await q1<{ a: Row }>(db, null, "SELECT a FROM public.finance_preferences p, jsonb_array_elements(p.data->'assets') a WHERE p.owner_id = $1 AND a->>'id' = $2", [owner, assetId]))[0]!.a;
  it("R-E-I15: an in-tolerance but different book value is ignored; the request stores, the approval records and posts exactly the database figure", async () => {
    for (const [given, atDecision] of [[53883.87, 53882.79], [53882.79, null]] as const) {
      const c = await seed(db, O, { cost: 61000, name: "Laptop" });
      const entry = crypto.randomUUID();
      const pre = (await q1<{ p: Row }>(db, O, "SELECT public.preview_asset_disposal($1, '2026-10-31', 0) p", [c.a.id]))[0]!.p;
      const [{ id }] = (await q1<{ id: string }>(db, O, REQ, [c.a.id, c.doc, given, entry])) as [{ id: string }];
      expect(await stored(id)).toEqual({ bv: "53883.33", g: "-53883.33", status: "pending" });
      expect(pre["bookValue"]).toBe(53883.33); // the preview equals the stored figure
      expect(Number(pre["gain"])).toBe(-53883.33);
      expect((await q1<{ i: Row }>(db, null, "SELECT inputs i FROM public.asset_disposal_requests WHERE id = $1", [id]))[0]!.i).not.toHaveProperty("bookValue");
      await stepUp(db, O);
      expect((await q1<{ r: Row }>(db, O, "SELECT public.decide_asset_disposal($1, true, 'Approved after review', $2) r", [id, atDecision]))[0]!.r).toMatchObject({ status: "approved", entry });
      expect(await stored(id)).toMatchObject({ bv: "53883.33", g: "-53883.33", status: "approved" });
      const e = (await q1<Row>(db, null, "SELECT amount::text amount, original_amount::text original, adjustment_sign s, account_id::text acc FROM public.expenses WHERE id = $1", [entry]))[0];
      expect(e).toEqual({ amount: "53883.33", original: "53883.33", s: -1, acc: c.acc });
      expect((await assetRow(O, c.a.id))["disposal"]).toMatchObject({ bookValue: 53883.33, gain: -53883.33, entryId: entry });
      // the balanced posting P7/P8 would write for it (P14's classify hook): Dr Loss 53,883.33 / Cr the asset account 53,883.33
      const post = (await q1<{ j: { lines: { code: string; debit: number; credit: number }[] } }>(db, null, "SELECT phase3_p7.classify_adjustment(e, NULL, 'asset') j FROM public.expenses e WHERE e.id = $1", [entry]))[0]!.j;
      expect(post.lines.map((l) => [l.code, String(l.debit), String(l.credit)])).toEqual([["expense:Loss on asset disposal (book value)", "53883.33", "0"], [`account:${c.acc}`, "0", "53883.33"]]);
    }
  });

  it("R-E-I15: outside the tolerance is refused at request and decision; a register change between request and decision refuses the approval", async () => {
    const c = await seed(db, O, { cost: 61000, name: "Laptop" });
    for (const v of [53883.88, 53882.78]) expect(await err(q1(db, O, REQ, [c.a.id, c.doc, v, crypto.randomUUID()]))).toMatch(/P14_BOOK_VALUE: /);
    const [{ id }] = (await q1<{ id: string }>(db, O, REQ, [c.a.id, c.doc, null, crypto.randomUUID()])) as [{ id: string }];
    expect(await stored(id)).toMatchObject({ bv: "53883.33" });
    await stepUp(db, O);
    expect(await err(q1(db, O, "SELECT public.decide_asset_disposal($1, true, 'Approved after review', 53883.88)", [id]))).toMatch(/P14_BOOK_VALUE: /);
    // the register changes after the request (cost corrected 61,000.00 -> 61,000.30: inside the request tolerance, still refused)
    for (const cost of [61000.3, 60000]) {
      await actAs(db, null);
      await db.query("UPDATE public.finance_preferences p SET data = jsonb_set(p.data, '{assets}', (SELECT jsonb_agg(CASE WHEN a->>'id' = $2 THEN a || jsonb_build_object('cost', $3::numeric) ELSE a END) FROM jsonb_array_elements(p.data->'assets') a)) WHERE owner_id = $1", [O, c.a.id, cost]);
      expect(await err(q1(db, O, "SELECT public.decide_asset_disposal($1, true, 'Approved after review', NULL)", [id]))).toMatch(/P14_BOOK_VALUE_CHANGED: the register changed since the request \(book value 53883.33 then, /);
    }
    expect(await stored(id)).toMatchObject({ bv: "53883.33", status: "pending" });
    expect((await assetRow(O, c.a.id))["soldOn"]).toBeUndefined();
    expect((await q1<Row>(db, null, "SELECT count(*)::int n FROM public.expenses WHERE id = (SELECT entry_id FROM public.asset_disposal_requests WHERE id = $1)", [id]))[0]).toEqual({ n: 0 });
    await q1(db, O, "SELECT public.cancel_asset_disposal($1, 'Test cleanup only')", [id]);
  });

  it("a session setting no longer opens the disposal guards (phase3_p14.writing is a transaction-bound row only P14's functions write)", async () => {
    const s = await seed(db, O, {});
    const sold = "UPDATE public.finance_preferences p SET data = jsonb_set(p.data, '{assets}', (SELECT jsonb_agg(CASE WHEN a->>'id' = $2 THEN a || '{\"soldOn\":\"2026-10-31\",\"saleValue\":1}' ELSE a END) FROM jsonb_array_elements(p.data->'assets') a)) WHERE owner_id = $1";
    await actAs(db, O);
    await db.exec("BEGIN");
    await db.query("SELECT set_config('phase3_p14.writing', 'on', true)");
    const r = await err(db.query(sold, [O, s.a.id]));
    await db.exec("ROLLBACK"); await actAs(db, null);
    expect(r).toMatch(/P14_DISPOSAL_APPROVAL_REQUIRED/);
    expect(await err(q1(db, O, "INSERT INTO phase3_p14.writing(transaction_id) VALUES (txid_current())"))).toMatch(/permission denied/);
  });

  it("an asset the database cannot price (recorded estimate changes, building policy, no rate) is refused, never trusted", async () => {
    const shapes: Row[] = [
      { policyHistory: [{ field: "bookRatePct", at: "2026-07-01T00:00:00Z", effectiveFrom: "2026-07", fromRaw: 20, toRaw: 40 }] },
      { kind: "property", buildingPolicy: [{ effectiveFrom: "2026-04", method: "slm", ratePct: 5 }] },
      { bookRatePct: null },
    ];
    for (const extra of shapes) {
      const s = await seed(db, O, extra);
      expect(await err(q1(db, O, REQ, [s.a.id, s.doc, 265000, crypto.randomUUID()]))).toMatch(/P14_UNVERIFIABLE/);
      expect(((await q1<{ p: Row }>(db, O, "SELECT public.preview_asset_disposal($1, '2026-10-31', 0) p", [s.a.id]))[0]!.p["problems"] as string[]).join()).toMatch(/cannot check/);
    }
  });

  it("preview returns the database's plan and has no side effects; another owner can neither preview, request nor decide", async () => {
    const s = await seed(db, O, {});
    const snap = async () => (await q1<Row>(db, null, "SELECT (SELECT count(*)::int FROM public.asset_disposal_requests) r, (SELECT count(*)::int FROM public.expenses) e, (SELECT md5(data::text) FROM public.finance_preferences WHERE owner_id = $1) p", [O]))[0];
    const before = await snap();
    const p = (await q1<{ p: Row }>(db, O, "SELECT public.preview_asset_disposal($1, '2026-10-31', 250000) p", [s.a.id]))[0]!.p;
    expect(p).toMatchObject({ bookValue: 265000, gain: -15000, months: 7, accountId: s.acc, problems: [] });
    expect(await snap()).toEqual(before);
    expect((await q1<{ v: string }>(db, null, "SELECT provolatile v FROM pg_proc WHERE oid = 'public.preview_asset_disposal(text,date,numeric)'::regprocedure"))[0]).toEqual({ v: "s" });
    await seed(db, V, {});
    expect(await err(q1(db, V, "SELECT public.preview_asset_disposal($1, '2026-10-31', 0)", [s.a.id]))).toMatch(/P14_NOT_FOUND/);
    expect(await err(q1(db, V, REQ, [s.a.id, s.doc, 265000, crypto.randomUUID()]))).toMatch(/P14_NOT_FOUND/);
    const [{ id }] = (await q1<{ id: string }>(db, O, REQ, [s.a.id, s.doc, 265000, crypto.randomUUID()])) as [{ id: string }];
    await stepUp(db, V);
    expect(await err(q1(db, V, "SELECT public.decide_asset_disposal($1, true, 'Approved by a stranger', 265000)", [id]))).toMatch(/P14_NOT_PERMITTED/);
    expect(await err(q1(db, V, "SELECT public.cancel_asset_disposal($1, 'Cancelled by a stranger')", [id]))).toMatch(/P14_NOT_PERMITTED/);
    expect((await q1<Row>(db, V, "SELECT id FROM public.asset_disposal_requests"))).toEqual([]);
    expect(await err(q1(db, V, "SELECT phase3_p14.book_value('{}'::jsonb, current_date)"))).toMatch(/permission denied/);
    await q1(db, O, "SELECT public.cancel_asset_disposal($1, 'Test cleanup only')", [id]);
  });

  it("the database working agrees with the app engine (disposalPlan) within tolerance across SLM/WDV, life/rate, residual, opening WDV and adjustments", async () => {
    const shapes: Row[] = [
      {}, { inUse: "2026-04-17" }, { bookMethod: "wdv", bookRatePct: 40 }, { bookMethod: "wdv", usefulLifeYears: 5, residualPct: 5 },
      { usefulLifeYears: 3, residualPct: 10 }, { inUse: "2019-09-12", usefulLifeYears: 3 }, { cost: 61000, inUse: "2021-01-31", bookMethod: "wdv", bookRatePct: 15 },
      { inUse: "2020-06-01", openingWdv: { fy: "2024-25", book: 120000 } },
      { inUse: "2025-05-20", adjustments: [{ date: "2025-12-10", amount: -40000, kind: "impairment", note: "" }, { date: "2026-06-01", amount: 15000, kind: "revaluation", note: "" }] },
      { kind: "property", cost: 4500000 }, { cost: 123456.78, inUse: "2024-02-29", bookMethod: "wdv", bookRatePct: 33.33 },
    ];
    for (const extra of shapes) {
      const s = await seed(db, O, extra);
      const app = disposalPlan(s.a as unknown as Asset, { date: "2026-10-31", proceeds: 0 }, []);
      const p = (await q1<{ p: { bookValue: number; tolerance: number } }>(db, O, "SELECT public.preview_asset_disposal($1, '2026-10-31', 0) p", [s.a.id]))[0]!.p;
      expect(Math.abs(app.bookValue - p.bookValue), JSON.stringify({ extra, app: app.bookValue, db: p.bookValue })).toBeLessThanOrEqual(p.tolerance);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// P14-c (copy rule; WS-E fin8 / independent note 4226890837): an asset id stored more than once in finance_preferences.assets.
// The database chooses the copy with the app's rule (disposalCopy → disposedOn / depreciationCopy) for the disposal month and
// the owner, records its position (asset_ordinal) and the approval writes only that row. Each case uses its own owner.
// Hand-calculated fixture (1): machinery 1,20,000.00 SLM 20% (no life) = 24,000.00 a year = 2,000.00 a month; in use
// 2026-04-01; disposal 2026-10-15: Apr-Sep 6 x 2,000 = 12,000 + Oct 2,000 x 15/31 = 967.74 → book value 1,07,032.26;
// proceeds 1,00,000.00 → loss 7,032.26. The land (3,00,000,00 property) stored first with the same id is never priced.
describe("P14-c: the disposal copy of a duplicated asset id (app rule, ordinal, one row written)", () => {
  let db: PGlite;
  const owners = Array.from({ length: 8 }, (_, i) => `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`);
  beforeAll(async () => {
    db = await fullSchemaDb([...STACK, P14]);
    await addUsers(db, Object.fromEntries(owners.map((o, i) => [o, `c${i}@x.in`])));
  }, 600_000);
  afterAll(async () => { await db.close(); });

  const base = async (owner: string) => {
    const acc = crypto.randomUUID(), doc = crypto.randomUUID();
    await actAs(db, null);
    await db.query("INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1, '{}') ON CONFLICT (owner_id) DO NOTHING", [owner]);
    await db.query("INSERT INTO public.accounts(id, owner_id, name, kind, opening_balance) VALUES ($1,$2,'Fixed assets','other_asset',0)", [acc, owner]);
    await db.query("INSERT INTO public.documents(id, owner_id, title, file_path, file_name, size_bytes, notes) VALUES ($1,$2,'Sale invoice',$3,'inv.pdf',1000,'')", [doc, owner, `${owner}/docs/${doc}-inv.pdf`]);
    return { acc, doc };
  };
  const setRegister = async (owner: string, rows: Row[]) => { await actAs(db, null); await db.query("UPDATE public.finance_preferences SET data = jsonb_set(data, '{assets}', $2::jsonb) WHERE owner_id = $1", [owner, JSON.stringify(rows)]); };
  const register = async (owner: string) => (await q1<{ t: string }>(db, null, "SELECT data::text t FROM public.finance_preferences WHERE owner_id = $1", [owner]))[0]!.t;
  const rows = async (owner: string) => (await q1<{ a: Row[] }>(db, null, "SELECT data->'assets' a FROM public.finance_preferences WHERE owner_id = $1", [owner]))[0]!.a;
  const SALE = "SELECT public.request_asset_disposal(p_asset => $1, p_method => 'sale', p_date => $2::date, p_proceeds => 100000, p_proceeds_entry => NULL, p_evidence => ARRAY[$3]::uuid[], p_reason => 'Sold to a dealer', p_entry => $4, p_book_value => $5, p_owner_entity => $6) id";
  const request = async (owner: string, id: string, date: string, doc: string, bv: number | null, ent: string | null = null) =>
    (await q1<{ id: string }>(db, owner, SALE, [id, date, doc, crypto.randomUUID(), bv, ent]))[0]!.id;
  const stored = async (id: string) => (await q1<Row>(db, null, "SELECT asset_ordinal o, book_value::text bv, gain::text g, status, inputs->'copy' c FROM public.asset_disposal_requests WHERE id = $1", [id]))[0]!;
  const approve = async (owner: string, id: string) => { await stepUp(db, owner); return (await q1<{ r: Row }>(db, owner, "SELECT public.decide_asset_disposal($1, true, 'Approved after review', NULL) r", [id]))[0]!.r; };
  const land = (acc: string, x: Row = {}): Row => ({ id: "AST-1", name: "Plot", kind: "property", cost: 3000000, inUse: "2026-04-01", sharePct: 100, accountId: acc, ...x });
  const machine = (acc: string, x: Row = {}): Row => ({ id: "AST-1", name: "Lathe", kind: "machinery", cost: 120000, inUse: "2026-04-01", sharePct: 100, bookMethod: "slm", bookRatePct: 20, accountId: acc, ...x });

  it("(1) land first + machinery second under one id: the request prices the machinery (1,07,032.26, app parity), the approval marks only that row", async () => {
    const o = owners[0]!, { acc, doc } = await base(o);
    await setRegister(o, [land(acc), machine(acc)]);
    const app = disposalPlan(machine(acc) as unknown as Asset, { date: "2026-10-15", proceeds: 100000 }, []);
    expect(app.bookValue).toBe(107032.26);
    const id = await request(o, "AST-1", "2026-10-15", doc, app.bookValue);
    expect(await stored(id)).toEqual({ o: 2, bv: "107032.26", g: "-7032.26", status: "pending", c: { ordinal: 2, ownerEntityId: null } });
    const before = await rows(o);
    expect(await approve(o, id)).toMatchObject({ status: "approved", ordinal: 2, bookValue: 107032.26 });
    const after = await rows(o);
    expect(after[0]).toEqual(before[0]); // the land row is untouched
    expect(after[1]).toMatchObject({ ...before[1], soldOn: "2026-10-15", saleValue: 100000, disposal: { requestId: id, bookValue: 107032.26, gain: -7032.26 } });
  });

  it("(2) an excluded duplicate is never chosen; a chosen copy sold before the disposal month refuses the request (already disposed)", async () => {
    const o = owners[1]!, { acc, doc } = await base(o);
    // excluded copy first (different cost): never priced
    await setRegister(o, [machine(acc, { cost: 500000, excludedAt: "2026-06-01T00:00:00Z" }), machine(acc)]);
    const pre = (await q1<{ p: Row }>(db, o, "SELECT public.preview_asset_disposal($1, '2026-10-15', 100000, NULL) p", ["AST-1"]))[0]!.p;
    expect(pre).toMatchObject({ bookValue: 107032.26, ordinal: 2, problems: [] });
    const id = await request(o, "AST-1", "2026-10-15", doc, 107032.26);
    expect(await stored(id)).toMatchObject({ o: 2, bv: "107032.26" });
    await q1(db, o, "SELECT public.cancel_asset_disposal($1, 'Test cleanup only')", [id]);
    // copy B first but in use only from August; copy A (in use April) is the copy chosen in June and was sold 2026-06-10:
    // the asset is disposed; a later disposal is refused, never priced from copy B
    const o2 = owners[2]!, b2 = await base(o2);
    await setRegister(o2, [machine(b2.acc, { name: "Lathe (B)", inUse: "2026-08-01" }), machine(b2.acc, { soldOn: "2026-06-10", saleValue: 90000 })]);
    const snap = await register(o2);
    expect(await err(request(o2, "AST-1", "2026-10-15", b2.doc, null))).toMatch(/P14_ALREADY_DISPOSED: already disposed on 2026-06-10/);
    expect((await q1<{ p: Row }>(db, o2, "SELECT public.preview_asset_disposal($1, '2026-10-15', 100000) p", ["AST-1"]))[0]!.p).toMatchObject({ bookValue: null, problems: [expect.stringMatching(/already disposed on 2026-06-10/)] });
    expect(await register(o2)).toBe(snap);
    expect((await q1(db, null, "SELECT count(*)::int n FROM public.asset_disposal_requests WHERE owner_id = $1", [o2]))[0]).toEqual({ n: 0 });
  });

  it("(3) two entities share an id: a request for entity A updates only A's chosen row; B's row stays byte-identical", async () => {
    const o = owners[3]!, { acc, doc } = await base(o);
    await setRegister(o, [machine(acc, { name: "Lathe (B)", ownerEntityId: "ent-b", cost: 240000 }), machine(acc, { ownerEntityId: "ent-a" })]);
    // not naming the owner is refused (copies under two owners), as the app refuses
    expect(await err(request(o, "AST-1", "2026-10-15", doc, null))).toMatch(/P14_OWNER/);
    const id = await request(o, "AST-1", "2026-10-15", doc, 107032.26, "ent-a");
    expect(await stored(id)).toMatchObject({ o: 2, bv: "107032.26", c: { ordinal: 2, ownerEntityId: "ent-a" } });
    const bBefore = (await q1<{ t: string }>(db, null, "SELECT (data->'assets'->0)::text t FROM public.finance_preferences WHERE owner_id = $1", [o]))[0]!.t;
    expect(await approve(o, id)).toMatchObject({ status: "approved", ordinal: 2 });
    expect((await q1<{ t: string }>(db, null, "SELECT (data->'assets'->0)::text t FROM public.finance_preferences WHERE owner_id = $1", [o]))[0]!.t).toBe(bBefore);
    expect((await rows(o))[1]).toMatchObject({ ownerEntityId: "ent-a", soldOn: "2026-10-15" });
    expect((await rows(o))[0]).not.toHaveProperty("soldOn");
  });

  it("(4) preview, request and approval agree on the copy (ordinal) and the book value", async () => {
    const o = owners[4]!, { acc, doc } = await base(o);
    await setRegister(o, [machine(acc, { excludedAt: "2026-05-01T00:00:00Z", cost: 1 }), land(acc), machine(acc, { name: "Lathe (later)", inUse: "2026-09-01", cost: 999999 }), machine(acc)]);
    // October: both machinery copies (positions 3 and 4) are in use; depreciationCopy takes the first in storage order (3).
    const app3 = disposalPlan(machine(acc, { name: "Lathe (later)", inUse: "2026-09-01", cost: 999999 }) as unknown as Asset, { date: "2026-10-15", proceeds: 100000 }, []);
    const pre = (await q1<{ p: Row }>(db, o, "SELECT public.preview_asset_disposal($1, '2026-10-15', 100000, '') p", ["AST-1"]))[0]!.p;
    expect(pre).toMatchObject({ ordinal: 3, ownerEntityId: null, problems: [] });
    expect(Math.abs(Number(pre["bookValue"]) - app3.bookValue)).toBeLessThanOrEqual(Number(pre["tolerance"]));
    const id = await request(o, "AST-1", "2026-10-15", doc, app3.bookValue, "");
    expect(await stored(id)).toMatchObject({ o: 3, bv: Number(pre["bookValue"]).toFixed(2) });
    // August (before the September copy is in use): the April copy (position 4) is chosen
    const pre8 = (await q1<{ p: Row }>(db, o, "SELECT public.preview_asset_disposal($1, '2026-08-20', 0) p", ["AST-1"]))[0]!.p;
    expect(pre8).toMatchObject({ ordinal: 4 });
    expect(await approve(o, id)).toMatchObject({ status: "approved", ordinal: 3, bookValue: pre["bookValue"] });
    const after = await rows(o);
    expect(after.map((a) => a["soldOn"] ?? null)).toEqual([null, null, "2026-10-15", null]);
    // once the chosen copy is sold the id stops (app disposedOn): any later disposal of the id is refused
    expect(await err(request(o, "AST-1", "2026-11-01", doc, null, ""))).toMatch(/P14_ALREADY_DISPOSED: already disposed on 2026-10-15/);
  });

  it("(5) a refused approval (the priced row changed or moved after the request) leaves the register byte-identical and the request pending", async () => {
    const o = owners[5]!, { acc, doc } = await base(o);
    await setRegister(o, [land(acc), machine(acc)]);
    const id = await request(o, "AST-1", "2026-10-15", doc, 107032.26);
    // (a) the rows are swapped: the row at the recorded position is now the land
    await setRegister(o, [machine(acc), land(acc)]);
    let snap = await register(o);
    await stepUp(db, o);
    expect(await err(q1(db, o, "SELECT public.decide_asset_disposal($1, true, 'Approved after review', NULL)", [id]))).toMatch(/P14_CHANGED/);
    expect(await register(o)).toBe(snap);
    // (b) the priced row is edited (a non-financial field): still refused, nothing written
    await setRegister(o, [land(acc), machine(acc, { name: "Lathe, renamed" })]);
    snap = await register(o);
    expect(await err(q1(db, o, "SELECT public.decide_asset_disposal($1, true, 'Approved after review', NULL)", [id]))).toMatch(/P14_CHANGED/);
    expect(await register(o)).toBe(snap);
    expect(await stored(id)).toMatchObject({ status: "pending" });
    expect((await q1(db, null, "SELECT count(*)::int n FROM public.expenses WHERE employee_id = $1", [o]))[0]).toEqual({ n: 0 });
  });

  it("(6) the disposal-field guard covers every row of an id: a client cannot mark a second copy sold without approval", async () => {
    const o = owners[6]!, { acc } = await base(o);
    await setRegister(o, [land(acc), machine(acc)]);
    const snap = await register(o);
    const mark = "UPDATE public.finance_preferences SET data = jsonb_set(data, '{assets,1}', (data->'assets'->1) || '{\"soldOn\":\"2026-10-15\",\"saleValue\":1}') WHERE owner_id = $1";
    expect(await err(q1(db, o, mark, [o]))).toMatch(/P14_DISPOSAL_APPROVAL_REQUIRED/);
    expect(await register(o)).toBe(snap);
    // an ordinary edit of the second copy is still allowed
    await q1(db, o, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{assets,1,name}', '\"Lathe 2\"') WHERE owner_id = $1", [o]);
    expect((await rows(o))[1]).toMatchObject({ name: "Lathe 2" });
  });
});

describe("P14-a without P4 (applied schema + P14): approval fails closed, rejection still works", () => {
  it("no step-up check installed → an approval is refused (P14_STEP_UP_UNAVAILABLE) and nothing is disposed", async () => {
    const db = await fullSchemaDb([P14]);
    await addUsers(db, { [O]: "o@x.in" });
    const s = await seed(db, O, {});
    const [{ id }] = (await q1<{ id: string }>(db, O, REQ, [s.a.id, s.doc, 265000, crypto.randomUUID()])) as [{ id: string }];
    expect(await err(q1(db, O, "SELECT public.decide_asset_disposal($1, true, 'Approved after review', 265000)", [id]))).toMatch(/P14_STEP_UP_UNAVAILABLE/);
    expect((await q1<{ r: Row }>(db, O, "SELECT public.decide_asset_disposal($1, false, 'Not this time', NULL) r", [id]))[0]!.r).toMatchObject({ status: "rejected" });
    expect((await q1<Row>(db, null, "SELECT count(*)::int n FROM public.expenses WHERE 'disposal' = ANY(tags)"))[0]).toEqual({ n: 0 });
    await db.close();
  }, 600_000);
});

// ---------------------------------------------------------------------------------------------------------------------------
// Migration decision brief G9 / G10 (12 Nov 2026). G9: the rollback dropped public.asset_disposal_requests (CASCADE), destroying
// the disposal approval audit history; lead ruling (as for P20): the rollback retains the table and its rows read-only (row
// count + content md5 checked and recorded, writes refused, the owner's read kept) and a re-install adopts them. G10: no
// erasure or demo-cleanup path removed a request row; as for P20, only the owner's own confirmed erasure (E1) and the demo
// cleanup of an anonymous demo guest (E2) remove them, for that owner only. Isolated PGlite only.
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const RO = u(11), RV = u(12), RE = u(13), RG = u(14), RX = u(15), RF = u(16), RG2 = u(17), RA = u(18), RY = u(19), RC = u(20);
/** One statement as another database role (anon, service_role) or as the superuser (null), in its own transaction. */
async function asRole(db: PGlite, role: "anon" | "service_role" | null, s: string, p: unknown[] = []) {
  await actAs(db, null);
  await db.exec("BEGIN");
  try { if (role) await db.exec(`SET LOCAL ROLE ${role}`); const rows = (await db.query(s, p)).rows; await db.exec("COMMIT"); return rows; }
  catch (e) { await db.exec("ROLLBACK"); throw e; }
  finally { await actAs(db, null); }
}
/** One statement as a signed-in client (role authenticated, RLS), in its own transaction. */
async function asUser(db: PGlite, uid: string, s: string, p: unknown[] = []) {
  await actAs(db, uid);
  await db.exec("BEGIN");
  try { const rows = (await db.query<Row>(s, p)).rows; await db.exec("COMMIT"); return rows; }
  catch (e) { await db.exec("ROLLBACK"); throw e; }
  finally { await actAs(db, null); }
}
/** Every request row as stored (superuser view), in a stable order. */
const allRequests = async (db: PGlite) => (await q1<{ id: string; owner_id: string; status: string; j: string }>(db, null,
  "SELECT id::text, owner_id::text, status, r::text j FROM public.asset_disposal_requests r ORDER BY id"));
const countOf = async (db: PGlite, owner: string) => (await q1<{ n: number }>(db, null, "SELECT count(*)::int n FROM public.asset_disposal_requests WHERE owner_id = $1", [owner]))[0]!.n;
const TAMPER_INSERT = (owner: string) => `INSERT INTO public.asset_disposal_requests(owner_id, asset_id, asset_name, method, disposal_date, proceeds, evidence_document_ids, reason, book_value, gain, entry_id, requested_by)
  VALUES ('${owner}','forged','Forged','scrap','2026-10-31',0,ARRAY[gen_random_uuid()],'Forged audit row',1,-1,gen_random_uuid(),'${owner}')`;

for (const [label, extra, stack] of [["applied schema", [] as string[], false], ["proposed stack P1..P13 (P4 step-up)", STACK, true]] as const) {
  describe(`P14 disposal audit trail: retained by rollback, removed only by erasure / demo cleanup — ${label} (SQL, isolated PGlite)`, () => {
    let db: PGlite;
    let before: string[];
    let afterRollback: string[];
    let pendingAtRollback = "";
    let companyAtRollback = "";
    beforeAll(async () => {
      db = await fullSchemaDb([...extra]);
      await addUsers(db, { [RO]: "ro@x.in", [RV]: "rv@x.in", [RE]: "re@x.in", [RG]: "", [RX]: "", [RF]: "rf@x.in", [RG2]: "", [RA]: "ra@x.in", [RY]: "ry@x.in", [RC]: "" });
      for (const id of [RO, RV, RE, RG, RX, RF, RG2, RY, RC]) await db.query("INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1, '{}') ON CONFLICT (owner_id) DO NOTHING", [id]);
      // RG / RG2: visitor demo guests (demo_sessions row, anonymous identity); RX: anonymous without a demo session (spoofing);
      // RY: a real (non-anonymous) account that has a demo_sessions row; RC: a demo guest that later converts to a real account.
      await db.query("UPDATE auth.users SET is_anonymous = true WHERE id IN ($1, $2, $3, $4)", [RG, RG2, RX, RC]);
      await db.query("INSERT INTO public.demo_sessions(owner_id, label) VALUES ($1,'guest-1'), ($2,'guest-2'), ($3,'ry@x.in'), ($4,'guest-3')", [RG, RG2, RY, RC]);
      // RA: a Finance approver for RO's company c1 (applied: finance role + approve switch; P1: also an active company grant)
      await db.query("INSERT INTO public.user_roles(user_id, role) VALUES ($1,'finance')", [RA]);
      await db.query("UPDATE public.role_permissions SET allowed = true WHERE role = 'finance' AND action IN ('view_expenses','approve')");
      await db.query("INSERT INTO public.entity_members(owner_id, entity_id, member_id, member_email, can_write) VALUES ($1,'c1',$2,'ra@x.in',true)", [RO, RA]);
      await db.query("ALTER ROLE service_role BYPASSRLS"); // as on Supabase: the guard, not RLS, must stop the service role
      before = await catalog(db);
    }, 600_000);
    afterAll(async () => { await db?.close(); });

    /** A request through the real RPC as the owner; returns its id. */
    const request = async (owner: string, asset: Row = {}) => {
      const s = await seed(db, owner, asset);
      return (await q1<{ id: string }>(db, owner, REQ, [s.a.id, s.doc, null, crypto.randomUUID()]))[0]!.id;
    };
    /** A decision through the real RPC (stack: after the owner's step-up; without P4 only a rejection is possible). */
    const decide = async (owner: string, id: string, approve: boolean) => {
      if (stack) await stepUp(db, owner);
      return (await q1<{ r: Row }>(db, owner, "SELECT public.decide_asset_disposal($1, $2, 'Decided after review', NULL) r", [id, approve]))[0]!.r;
    };
    /** The user's confirmed erasure (Settings: delete my data), as the signed-in user. */
    const erase = async (uid: string) => { if (stack) await stepUp(db, uid); await asUser(db, uid, "SELECT public.delete_my_finance_data()"); };
    /** The hourly demo cleanup's record removal (src/lib/demo-cleanup.ts, as the route runs it) as the service role. */
    const demoCleanup = (uid: string) => removeDemoGuestRecords((table) => ({ delete: () => ({ eq: async (column: string, value: string) => {
      try { await asRole(db, "service_role", `DELETE FROM public.${table} WHERE ${column} = $1`, [value]); return { error: null }; } catch (error) { return { error }; }
    } }) }), uid);

    it("installs once", async () => {
      await db.exec(readSql(P14));
      await expect(db.exec(readSql(P14))).rejects.toThrow(/already installed/);
      await db.exec("ROLLBACK");
    }, 600_000);

    it("G10 E1: the owner's confirmed erasure removes that owner's requests (decided and pending) only", async () => {
      const decided = await request(RE);
      expect(await decide(RE, decided, false)).toMatchObject({ status: "rejected" });
      await request(RE);
      await request(RO);
      const others = (await allRequests(db)).filter((r) => r.owner_id !== RE);
      expect(await countOf(db, RE)).toBe(2);
      // signed-in deletes stay refused, also by the owner and also with the erasure flag set by hand: clients hold no DELETE
      expect(await err(asUser(db, RE, "DELETE FROM public.asset_disposal_requests WHERE owner_id = $1", [RE]))).toMatch(/permission denied/);
      const withFlag = async (uid: string, q: string, p: unknown[]) => {
        await actAs(db, uid); await db.exec("BEGIN");
        try { await db.query("SELECT set_config('ledgerline.erasing', 'on', true)"); return (await db.query<Row>(q, p)).rows; }
        finally { await db.exec("ROLLBACK"); await actAs(db, null); }
      };
      expect(await err(withFlag(RE, "DELETE FROM public.asset_disposal_requests WHERE owner_id = $1", [RE]))).toMatch(/permission denied/);
      // Honest pre-P18 behaviour (accepted for now, as P20; KK decision brief): without P18 the E1 condition is the
      // client-settable setting, so with the flag set the guard answers "removable" for the caller's own rows (never for
      // another owner's). With P18 installed it answers false (see "P14 with P18" below).
      expect(await withFlag(RE, "SELECT phase3_p14_audit.removal_allowed($1) own, phase3_p14_audit.removal_allowed($2) other", [RE, RO])).toEqual([{ own: true, other: false }]);
      expect(await countOf(db, RE)).toBe(2);
      await erase(RE);
      expect(await countOf(db, RE)).toBe(0);
      expect(await allRequests(db)).toEqual(others);
    }, 600_000);

    it("G10 E2: the demo cleanup removes an anonymous guest's requests; the service role / operator cannot remove anyone else's", async () => {
      await request(RG);
      await request(RX);
      await request(RY);
      await request(RC);
      // RC converts (upgrades to a real account by email) after making a request; the demo_sessions row is still there
      await q1(db, null, "UPDATE auth.users SET is_anonymous = false, email = 'rc@x.in' WHERE id = $1", [RC]);
      const others = (await allRequests(db)).filter((r) => r.owner_id !== RG);
      expect(DEMO_GUEST_STEPS.map((x) => x.table)).toContain("asset_disposal_requests");
      // not a demo guest: the service role (RLS bypassed) and the operator are refused by the guard
      expect(await err(asRole(db, "service_role", "DELETE FROM public.asset_disposal_requests WHERE owner_id = $1", [RO]))).toMatch(/P14_AUDIT_KEPT/);
      expect(await err(asRole(db, null, "DELETE FROM public.asset_disposal_requests WHERE owner_id = $1", [RO]))).toMatch(/P14_AUDIT_KEPT/);
      expect(await err(asRole(db, "service_role", "UPDATE public.asset_disposal_requests SET reason = 'rewritten by the service' WHERE owner_id = $1", [RO]))).toMatch(/permission denied/);
      expect(await err(asRole(db, null, "UPDATE public.asset_disposal_requests SET reason = 'rewritten by the operator' WHERE owner_id = $1", [RO]))).toMatch(/P14_AUDIT_KEPT/);
      expect(await err(asRole(db, null, "TRUNCATE public.asset_disposal_requests"))).toMatch(/P14_AUDIT_KEPT/);
      expect(await demoCleanup(RG)).toEqual({ ok: true });
      expect(await countOf(db, RG)).toBe(0);
      // an anonymous user without a demo session is not a guest: the cleanup stops at this step (identity kept)
      expect(await demoCleanup(RX)).toMatchObject({ ok: false, table: "asset_disposal_requests", error: expect.stringMatching(/P14_AUDIT_KEPT/) });
      // a real account with a demo_sessions row (RY) and a converted guest (RC) are not anonymous: never removed by E2
      for (const who of [RY, RC]) {
        expect(await err(asRole(db, "service_role", "DELETE FROM public.asset_disposal_requests WHERE owner_id = $1", [who])), who).toMatch(/P14_AUDIT_KEPT/);
        expect(await err(asRole(db, null, "DELETE FROM public.asset_disposal_requests WHERE owner_id = $1", [who])), who).toMatch(/P14_AUDIT_KEPT/);
        expect(await demoCleanup(who), who).toMatchObject({ ok: false, table: "asset_disposal_requests", error: expect.stringMatching(/P14_AUDIT_KEPT/) });
        expect(await countOf(db, who), who).toBe(1);
      }
      expect(await allRequests(db)).toEqual(others);
    }, 600_000);

    it("G9: rollback retains every request and decision unchanged, read-only and owner-readable; everything else is restored", async () => {
      const decided = await request(RO);
      expect(await decide(RO, decided, stack)).toMatchObject({ status: stack ? "approved" : "rejected" });
      pendingAtRollback = await request(RO);
      const companyRequest = await request(RO, { entityId: "c1" });
      companyAtRollback = companyRequest;
      await request(RV);
      await request(RF);
      await request(RG2);
      const kept = await allRequests(db);
      const own = (uid: string) => kept.filter((r) => r.owner_id === uid).length;
      expect(own(RO)).toBe(4);
      // while installed, the Finance approver for c1 reads that request (approvers' read policy); RV (no role) reads none of RO's
      const approverSees = async () => (await asUser(db, RA, "SELECT id::text id FROM public.asset_disposal_requests WHERE owner_id = $1", [RO])).map((r) => r["id"]);
      expect(await approverSees()).toContain(companyRequest);
      expect((await asUser(db, RV, "SELECT count(*)::int n FROM public.asset_disposal_requests WHERE owner_id = $1", [RO]))[0]!["n"]).toBe(0);

      await db.exec(readSql(P14_RB));
      afterRollback = await catalog(db);
      // nothing P14 added remains except the retained trail, its guards and its records
      expect(before.filter((x) => !afterRollback.includes(x))).toEqual([]);
      expect(afterRollback.filter((x) => /^[nt]\|/.test(x) && !before.includes(x)).map((x) => x.split("|").slice(0, 2).join("|")).sort()).toEqual([
        "n|phase3_p14_audit", "n|phase3_p14_retained",
        "t|asset_disposal_requests.asset_disposal_requests_guard", "t|asset_disposal_requests.asset_disposal_requests_no_truncate",
        "t|asset_disposal_requests.asset_disposal_requests_retained_record", "t|expenses.p14_disposal_requests_follow_erasure"]);
      expect(afterRollback.filter((x) => !before.includes(x)).every((x) => /asset_disposal_requests|phase3_p14_audit|phase3_p14_retained|p14_disposal_requests_follow_erasure/.test(x))).toBe(true);
      expect((await q1<{ n: number }>(db, null, "SELECT count(*)::int n FROM pg_namespace WHERE nspname = 'phase3_p14'"))[0]!.n).toBe(0);
      expect((await q1<{ n: number }>(db, null, "SELECT count(*)::int n FROM pg_proc WHERE proname IN ('request_asset_disposal', 'decide_asset_disposal', 'cancel_asset_disposal', 'preview_asset_disposal')"))[0]!.n).toBe(0);
      // every row is still there, unchanged; the rollback is recorded (row count + content md5) and on the table comment
      expect(await allRequests(db)).toEqual(kept);
      const [rec] = await q1<{ rows: string; ok: boolean }>(db, null, "SELECT r.rows::text, r.table_oid = 'public.asset_disposal_requests'::regclass::oid AND r.content_md5 = (SELECT md5(coalesce(string_agg(c::text, E'\\n' ORDER BY c.id), '')) FROM (SELECT * FROM public.asset_disposal_requests) c) ok FROM phase3_p14_retained.rollback r");
      expect(rec).toEqual({ rows: String(kept.length), ok: true });
      expect((await q1<{ c: string }>(db, null, "SELECT obj_description('public.asset_disposal_requests'::regclass, 'pg_class') c"))[0]!.c).toMatch(new RegExp(`P14 rolled back .*: ${kept.length} disposal requests retained read-only`));
      // readable by their owner only (the approvers' read went with phase3_p14); anon reads nothing
      expect((await asUser(db, RO, "SELECT count(*)::int n FROM public.asset_disposal_requests"))[0]!["n"]).toBe(own(RO));
      expect(await approverSees()).toEqual([]);
      expect((await asUser(db, RA, "SELECT count(*)::int n FROM public.asset_disposal_requests"))[0]!["n"]).toBe(0);
      expect((await asUser(db, RV, "SELECT count(*)::int n FROM public.asset_disposal_requests"))[0]!["n"]).toBe(own(RV));
      expect(await err(asRole(db, "anon", "SELECT count(*) FROM public.asset_disposal_requests"))).toMatch(/permission denied/);
      // writable by no one: signed-in owner, service role, operator (DML; DDL is out of scope)
      const row = kept.find((r) => r.owner_id === RO)!;
      const ins = [TAMPER_INSERT(RO), []] as const;
      const upd = ["UPDATE public.asset_disposal_requests SET reason = 'rewritten after rollback', status = 'cancelled', decided_at = now() WHERE id = $1", [row.id]] as const;
      const del = ["DELETE FROM public.asset_disposal_requests WHERE id = $1", [row.id]] as const;
      for (const [q, p] of [ins, upd, del]) {
        expect(await err(asUser(db, RO, q, [...p]))).toMatch(/permission denied/);
        expect(await err(asRole(db, "service_role", q, [...p]))).toMatch(q === del[0] ? /retained audit history/ : /permission denied/);
        expect(await err(asRole(db, null, q, [...p]))).toMatch(/retained audit history/);
      }
      expect(await err(asUser(db, RO, "TRUNCATE public.asset_disposal_requests"))).toMatch(/permission denied/);
      expect(await err(asRole(db, "service_role", "TRUNCATE public.asset_disposal_requests"))).toMatch(/permission denied/);
      expect(await err(asRole(db, null, "TRUNCATE public.asset_disposal_requests"))).toMatch(/retained audit history/);
      expect(await allRequests(db)).toEqual(kept);
      // G10 while retained: confirmed erasure (RF) and the demo cleanup (RG2) remove exactly their own owner's rows, and the
      // rollback record follows the rows that remain
      await erase(RF);
      expect(await allRequests(db)).toEqual(kept.filter((r) => r.owner_id !== RF));
      expect(await demoCleanup(RG2)).toEqual({ ok: true });
      expect(await allRequests(db)).toEqual(kept.filter((r) => r.owner_id !== RF && r.owner_id !== RG2));
      const [now] = await q1<{ ok: boolean }>(db, null, "SELECT r.rows = (SELECT count(*) FROM public.asset_disposal_requests) AND r.content_md5 = (SELECT md5(coalesce(string_agg(c::text, E'\\n' ORDER BY c.id), '')) FROM public.asset_disposal_requests c) ok FROM phase3_p14_retained.rollback r");
      expect(now!.ok).toBe(true);
    }, 600_000);

    it("G9: re-installing P14 keeps every retained row, decides a request pending at rollback, appends new ones; a second rollback retains them all", async () => {
      const kept = await allRequests(db);
      await db.exec(readSql(P14));
      expect(await allRequests(db)).toEqual(kept);
      expect((await q1<{ n: number }>(db, null, "SELECT count(*)::int n FROM pg_namespace WHERE nspname = 'phase3_p14_retained'"))[0]!.n).toBe(0);
      expect((await q1<{ c: string }>(db, null, "SELECT obj_description('public.asset_disposal_requests'::regclass, 'pg_class') c"))[0]!.c).toMatch(/P14 rolled back .*; P14 re-installed .*: earlier requests kept/);
      // the request still pending at rollback is decided through the re-installed workflow; a new request appends
      expect(await q1<{ r: Row }>(db, RO, "SELECT public.cancel_asset_disposal($1, 'No longer needed after re-install') r", [pendingAtRollback])).toEqual([{ r: expect.objectContaining({ status: "cancelled", replayed: false }) }]);
      const fresh = await request(RV);
      const now = await allRequests(db);
      expect(now.filter((r) => kept.every((k) => k.id !== r.id)).map((r) => r.id)).toEqual([fresh]);
      expect(now.filter((r) => r.id !== pendingAtRollback && r.id !== fresh)).toEqual(kept.filter((r) => r.id !== pendingAtRollback));
      // the installed rules are back: client writes refused, approvers' read policy restored
      expect(await err(asUser(db, RO, "DELETE FROM public.asset_disposal_requests"))).toMatch(/permission denied/);
      expect((await asUser(db, RV, "SELECT count(*)::int n FROM public.asset_disposal_requests WHERE owner_id = $1", [RO]))[0]!["n"]).toBe(0);
      // the approver's read is back with the re-installed policy
      expect((await asUser(db, RA, "SELECT id::text id FROM public.asset_disposal_requests WHERE owner_id = $1", [RO])).map((r) => r["id"])).toContain(companyAtRollback);
      expect((await q1<{ p: string }>(db, null, "SELECT string_agg(polname, ',' ORDER BY polname) p FROM pg_policy WHERE polrelid = 'public.asset_disposal_requests'::regclass"))[0]!.p).toContain("Disposal requests: owner and approvers read");
      // the rollback refuses guards that are not in the ordinary mode, disabled record upkeep / erasure follow-up, and a
      // follow-up trigger with the right name that calls another function (L6)
      for (const ddl of [
        "ALTER TABLE public.asset_disposal_requests ENABLE ALWAYS TRIGGER asset_disposal_requests_guard",
        "ALTER TABLE public.asset_disposal_requests DISABLE TRIGGER asset_disposal_requests_retained_record",
        "ALTER TABLE public.expenses DISABLE TRIGGER p14_disposal_requests_follow_erasure",
        `CREATE FUNCTION public.p14_test_noop() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NULL; END $f$;
         DROP TRIGGER p14_disposal_requests_follow_erasure ON public.expenses;
         CREATE TRIGGER p14_disposal_requests_follow_erasure AFTER DELETE ON public.expenses FOR EACH STATEMENT EXECUTE FUNCTION public.p14_test_noop()`,
      ]) {
        await db.exec("BEGIN");
        await db.exec(ddl);
        await expect(db.exec(readSql(P14_RB)), ddl).rejects.toThrow(/guards are missing or disabled/);
        await db.exec("ROLLBACK");
        expect((await q1<{ n: number }>(db, null, "SELECT count(*)::int n FROM pg_namespace WHERE nspname = 'phase3_p14'"))[0]!.n, ddl).toBe(1);
      }
      // a second rollback retains old and new rows and leaves the same catalog as the first
      const all = await allRequests(db);
      await db.exec(readSql(P14_RB));
      expect(await allRequests(db)).toEqual(all);
      expect(await catalog(db)).toEqual(afterRollback);
      // a retained table that changed (rows around the guards, shape, policies, grants, identity) is never adopted
      const tampered: [string, RegExp][] = [
        ["ALTER TABLE public.asset_disposal_requests DISABLE TRIGGER USER; UPDATE public.asset_disposal_requests SET reason = 'rewritten around the guards' WHERE id = (SELECT id FROM public.asset_disposal_requests ORDER BY id LIMIT 1); ALTER TABLE public.asset_disposal_requests ENABLE TRIGGER USER", /retained disposal requests changed since the P14 rollback/],
        ["ALTER TABLE public.asset_disposal_requests DISABLE TRIGGER USER; DELETE FROM public.asset_disposal_requests WHERE id = (SELECT id FROM public.asset_disposal_requests ORDER BY id LIMIT 1); ALTER TABLE public.asset_disposal_requests ENABLE TRIGGER USER", /retained disposal requests changed since the P14 rollback/],
        [`SET LOCAL session_replication_role = replica; ${TAMPER_INSERT(RO)}; SET LOCAL session_replication_role = origin`, /retained disposal requests changed since the P14 rollback/],
        ["ALTER TABLE public.asset_disposal_requests ALTER COLUMN reason DROP NOT NULL", /does not have the P14 audit shape/],
        ["DROP INDEX public.asset_disposal_requests_one_open", /does not have the P14 audit shape/],
        ["ALTER TABLE public.asset_disposal_requests ADD CONSTRAINT stray_fk FOREIGN KEY (entry_id) REFERENCES public.expenses(id) ON DELETE CASCADE NOT VALID", /does not have the P14 audit shape/],
        ["CREATE POLICY \"anyone writes\" ON public.asset_disposal_requests FOR INSERT TO authenticated WITH CHECK (true)", /triggers or policies P14 did not create/],
        ["CREATE ROLE p14_stray; GRANT INSERT ON public.asset_disposal_requests TO p14_stray", /unexpected privilege/],
        ["ALTER TABLE public.asset_disposal_requests OWNER TO service_role", /not the audit trail the P14 rollback retained/],
        ["DROP TABLE phase3_p14_retained.rollback; DROP SCHEMA phase3_p14_retained", /not an audit trail retained by a P14 rollback/],
      ];
      // rows changed with the guards disabled, then a permitted E2 delete: the record goes stale for good, never laundered
      const launder = `ALTER TABLE public.asset_disposal_requests DISABLE TRIGGER USER; ${TAMPER_INSERT(RG2)}; ALTER TABLE public.asset_disposal_requests ENABLE TRIGGER USER;
        SET LOCAL ROLE service_role; DELETE FROM public.asset_disposal_requests WHERE owner_id = '${RG2}'; RESET ROLE;`;
      await db.exec("BEGIN");
      await db.exec("ALTER TABLE public.asset_disposal_requests DISABLE TRIGGER USER; UPDATE public.asset_disposal_requests SET reason = 'rewritten around the guards' WHERE id = (SELECT id FROM public.asset_disposal_requests ORDER BY id LIMIT 1); ALTER TABLE public.asset_disposal_requests ENABLE TRIGGER USER");
      await db.exec(launder);
      expect((await db.query<{ m: string }>("SELECT content_md5 m FROM phase3_p14_retained.rollback")).rows[0]!.m).toMatch(/^stale since /);
      await expect(db.exec(readSql(P14))).rejects.toThrow(/retained disposal requests changed/);
      await db.exec("ROLLBACK");
      for (const [ddl, re] of tampered) {
        await db.exec("BEGIN");
        await db.exec(ddl);
        await expect(db.exec(readSql(P14)), ddl).rejects.toThrow(re);
        await db.exec("ROLLBACK");
        expect((await q1<{ n: number }>(db, null, "SELECT count(*)::int n FROM pg_namespace WHERE nspname = 'phase3_p14'"))[0]!.n).toBe(0);
      }
      expect(await allRequests(db)).toEqual(all);
    }, 600_000);
  });
}

// ---------------------------------------------------------------------------------------------------------------------------
// Review of fab1ed3, M1: P14 re-installed after P18 re-created phase3_p14.exempt() trusting ledgerline.erasing, so an owner
// who set it in plain SQL could change soldOn / saleValue / disposal or insert a disposal entry without approval (and a P14
// rollback under P18 dropped a function P18's rollback restores). P18 is installed last and rolled back first: P14 now
// refuses to install or roll back while P18 is installed. Also L2: E1 with P18 installed, before and after a P14 rollback.
// Whole proposed stack P1..P13 (P4 step-up) + P14 + P18, isolated PGlite only.
const P18 = `${D}P18_erasure_authority.sql`, P18_RB = `${D}P18_erasure_authority.rollback.sql`;
const P18_RB_DROP_AUDIT = () => readSql(P18_RB).replace("BEGIN;", "BEGIN; SET LOCAL phase3_p18.drop_audit = 'on';");
const SA = u(31), SB = u(32), SC = u(33);
const SOLD = "UPDATE public.finance_preferences p SET data = jsonb_set(p.data, '{assets}', (SELECT jsonb_agg(CASE WHEN a->>'id' = $2 THEN a || '{\"soldOn\":\"2026-10-31\",\"saleValue\":1,\"disposal\":{\"requestId\":\"faked\"}}' ELSE a END) FROM jsonb_array_elements(p.data->'assets') a)) WHERE owner_id = $1";
const DISPOSAL_ENTRY = "INSERT INTO public.expenses(id, employee_id, title, category, amount, original_amount, currency, fx_rate, expense_date, description, payment_method, txn_type, account_id, adjustment_sign, tags) VALUES (gen_random_uuid(), $1, 'Disposal · Server', 'Asset disposal', 265000, 265000, 'INR', 1, '2026-10-31', '', 'other', 'adjustment', $2, -1, ARRAY['disposal'])";
/** The faked erasure: as the signed-in owner, set ledgerline.erasing = 'on' in plain SQL and attempt the write ("ok" or the error). */
async function fakedErasure(db: PGlite, uid: string, q: string, p: unknown[]) {
  await actAs(db, uid); await db.exec("BEGIN");
  try { await db.query("SELECT set_config('ledgerline.erasing', 'on', true)"); return `ok ${JSON.stringify((await db.query(q, p)).rows)}`; }
  catch (e) { return (e as Error).message; }
  finally { await db.exec("ROLLBACK"); await actAs(db, null); }
}
/** The same flag set by a superuser session acting for the owner (auth.uid() = owner), deleting the owner's requests. */
async function flaggedOperatorDelete(db: PGlite, uid: string) {
  await actAs(db, null); await db.exec("BEGIN");
  try { await db.query("SELECT set_config('test.uid', $1, true), set_config('ledgerline.erasing', 'on', true)", [uid]); await db.query("DELETE FROM public.asset_disposal_requests WHERE owner_id = $1", [uid]); return "ok"; }
  catch (e) { return (e as Error).message; }
  finally { await db.exec("ROLLBACK"); await actAs(db, null); }
}
const readsErasing = async (db: PGlite) => (await q1<{ f: string }>(db, null, `SELECT p.oid::regprocedure::text f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'phase3_p18', 'phase3_p18_private') AND p.prosrc LIKE '%current_setting(''ledgerline.erasing''%' ORDER BY 1`)).map((r) => r.f);
const installed = async (db: PGlite, schema: string) => (await q1<{ n: number }>(db, null, "SELECT count(*)::int n FROM pg_namespace WHERE nspname = $1", [schema]))[0]!.n === 1;

describe("P14 with P18 (M1): no faked-erasure bypass; P14 installs and rolls back only while P18 is not installed (SQL, isolated PGlite)", () => {
  it("P18 authority only; P14 rollback / install refused under P18; the documented order (P18 rolled back first) works; E1 removes only the caller's requests", async () => {
    const db = await fullSchemaDb([...STACK, P14, P18]);
    try {
      await addUsers(db, { [SA]: "sa@x.in", [SB]: "sb@x.in", [SC]: "sc@x.in" });
      const request = async (owner: string) => {
        const s = await seed(db, owner, {});
        const id = (await q1<{ id: string }>(db, owner, REQ, [s.a.id, s.doc, null, crypto.randomUUID()]))[0]!.id;
        return { ...s, id };
      };
      const erase = async (uid: string) => { await stepUp(db, uid); await q1(db, uid, "SELECT public.delete_my_finance_data()"); };
      await request(SA);
      const b = await request(SB);
      await request(SC);
      expect(await readsErasing(db)).toEqual([]);
      // the faked erasure opens nothing: disposal fields, a disposal entry, the trail itself
      expect(await fakedErasure(db, SB, SOLD, [SB, b.a.id])).toMatch(/P14_DISPOSAL_APPROVAL_REQUIRED/);
      expect(await fakedErasure(db, SB, DISPOSAL_ENTRY, [SB, b.acc])).toMatch(/P14_DISPOSAL_APPROVAL_REQUIRED/);
      expect(await flaggedOperatorDelete(db, SB)).toMatch(/P14_AUDIT_KEPT/);
      expect(await fakedErasure(db, SB, "SELECT phase3_p14_audit.removal_allowed($1) r", [SB])).toBe('ok [{"r":false}]');
      expect((await q1<Row>(db, null, "SELECT count(*)::int n FROM public.asset_disposal_requests WHERE owner_id = $1", [SB]))[0]).toEqual({ n: 1 });
      // E1 through the P18 authority removes the caller's requests only
      const others = (await allRequests(db)).filter((r) => r.owner_id !== SA);
      await erase(SA);
      expect(await countOf(db, SA)).toBe(0);
      expect(await allRequests(db)).toEqual(others);

      // P14 cannot be rolled back (nor installed again) while P18 is installed
      await expect(db.exec(readSql(P14_RB))).rejects.toThrow(/P14 rollback: P18 \(erasure authority\) is installed; roll back P18 first/);
      await db.exec("ROLLBACK");
      await expect(db.exec(readSql(P14))).rejects.toThrow(/already installed/);
      await db.exec("ROLLBACK");
      expect(await installed(db, "phase3_p14")).toBe(true);
      expect(await fakedErasure(db, SB, SOLD, [SB, b.a.id])).toMatch(/P14_DISPOSAL_APPROVAL_REQUIRED/);

      // documented order: P18 first (its audit rows exported, KK approval), then P14; P18's rollback restores the pre-P18 reads
      await db.exec(P18_RB_DROP_AUDIT());
      expect(await readsErasing(db)).toEqual(expect.arrayContaining(["phase3_p14.exempt()", "phase3_p14_audit.removal_allowed(uuid)"]));
      await db.exec(readSql(P14_RB));
      expect(await installed(db, "phase3_p14_retained")).toBe(true);
      // P18 installed over the retained trail: removal_allowed moves to the authority
      await db.exec(readSql(P18));
      expect(await readsErasing(db)).toEqual([]);
      // re-installing P14 under P18 is refused (it would re-create guards trusting the setting); nothing changes
      const kept = await allRequests(db);
      await expect(db.exec(readSql(P14))).rejects.toThrow(/P14: P18 \(erasure authority\) is installed; roll back P18 first/);
      await db.exec("ROLLBACK");
      expect(await installed(db, "phase3_p14")).toBe(false);
      expect(await readsErasing(db)).toEqual([]);
      expect(await allRequests(db)).toEqual(kept);
      // retained trail under P18: the faked erasure removes nothing; E1 through P18 removes only the caller's requests
      expect(await flaggedOperatorDelete(db, SB)).toMatch(/retained audit history/);
      await erase(SB);
      expect(await allRequests(db)).toEqual(kept.filter((r) => r.owner_id !== SB));
      expect(await countOf(db, SC)).toBe(1);
      const [rec] = await q1<{ ok: boolean }>(db, null, "SELECT r.rows = (SELECT count(*) FROM public.asset_disposal_requests) AND r.content_md5 = (SELECT md5(coalesce(string_agg(c::text, E'\\n' ORDER BY c.id), '')) FROM public.asset_disposal_requests c) ok FROM phase3_p14_retained.rollback r");
      expect(rec).toEqual({ ok: true });
      // documented order again: P18 rolled back, P14 re-installed (adopts the trail), P18 re-installed; still no bypass
      await db.exec(P18_RB_DROP_AUDIT());
      await db.exec(readSql(P14));
      await db.exec(readSql(P18));
      expect(await readsErasing(db)).toEqual([]);
      const c = await seed(db, SC, {});
      expect(await fakedErasure(db, SC, SOLD, [SC, c.a.id])).toMatch(/P14_DISPOSAL_APPROVAL_REQUIRED/);
      expect(await fakedErasure(db, SC, DISPOSAL_ENTRY, [SC, c.acc])).toMatch(/P14_DISPOSAL_APPROVAL_REQUIRED/);
      expect(await flaggedOperatorDelete(db, SC)).toMatch(/P14_AUDIT_KEPT/);
      expect(await countOf(db, SC)).toBe(1);
    } finally { await db.close(); }
  }, 900_000);
});
