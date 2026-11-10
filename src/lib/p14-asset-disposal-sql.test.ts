// @vitest-environment node
// Proposed P14 (P0-015 asset disposal approval) install / rollback at the SQL level, isolated PGlite only (never Cloud).
// The approval flow itself (server functions, PostgREST-shaped requests, posting on active books): failure-injection.test.ts D1-D4.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { actAs, addUsers, fullSchemaDb, readSql } from "@/test/full-schema-pglite";
import { disposalPlan } from "./asset-disposal";
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

describe("P14 asset disposal approval (SQL, isolated PGlite)", () => {
  for (const [name, extra] of [["applied schema", [] as string[]], ["whole proposed stack P1..P13 (P8 hook wrapped and restored)", STACK]] as const) {
    it(`${name}: installs; rollback refuses while requests exist, then restores the exact catalog`, async () => {
      const db = await fullSchemaDb([...extra]);
      await addUsers(db, { [O]: "o@x.in" });
      await db.query("INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1, '{}') ON CONFLICT (owner_id) DO NOTHING", [O]);
      const before = await catalog(db);
      await db.exec(readSql(P14));
      await expect(db.exec(readSql(P14))).rejects.toThrow(/already installed/);
      await db.exec("ROLLBACK");
      await db.query("INSERT INTO public.asset_disposal_requests(owner_id, asset_id, asset_name, method, disposal_date, proceeds, evidence_document_ids, reason, book_value, gain, entry_id, requested_by) VALUES ($1,'a1','Laptop','scrap','2026-10-31',0,ARRAY[gen_random_uuid()],'Broken beyond repair',1000,-1000,gen_random_uuid(),$1)", [O]);
      await expect(db.exec(readSql(P14_RB))).rejects.toThrow(/disposal requests exist/);
      await db.exec("ROLLBACK");
      await db.exec(readSql(P14_RB).replace("BEGIN;", "BEGIN; SET LOCAL phase3_p14.drop_requests = 'on';"));
      expect(await catalog(db)).toEqual(before);
      await db.close();
    }, 600_000);
  }
});

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
