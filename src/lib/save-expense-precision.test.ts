// Lead review of ed20f1a1: the saveExpense server path itself (not only its helpers) refuses sub-paise source
// amounts before writing anything, and posts INR once, half-up, at the posting boundary — while an edit that
// keeps the source amount, currency and rate keeps the stored posted amount exactly (KK ruling, 11 Nov 2026).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (d: unknown) => unknown = (d) => d;
    const b = {
      middleware: () => b,
      inputValidator: (v: (d: unknown) => unknown) => { validate = v; return b; },
      handler: (fn: (a: { data: unknown; context: unknown }) => unknown) => async (a: { data: unknown; context: unknown }) => fn({ data: validate(a.data), context: a.context }),
    };
    return b;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

import * as fx from "./fx.functions";
const { saveExpense } = fx;
import { receiptReviewCheck } from "./receipt-reading";

type Row = Record<string, unknown>;
/** A tiny stand-in for the Supabase query builder: records every write and serves one stored row. */
function fakeSupabase(stored: Row | null = null) {
  const writes: { op: string; row: Row }[] = [];
  const from = () => {
    let op = "select", row: Row = {};
    const q: Record<string, unknown> = {};
    const result = () => {
      if (op !== "select") return { data: op === "update" ? { id: row["id"] ?? stored?.["id"] } : [{ id: row["id"] }], error: null };
      return { data: [], error: null };
    };
    for (const m of ["select", "eq", "limit"]) q[m] = () => q;
    q["update"] = (r: Row) => { op = "update"; row = r; writes.push({ op, row: r }); return q; };
    q["upsert"] = (r: Row) => { op = "upsert"; row = r; writes.push({ op, row: r }); return q; };
    q["insert"] = (r: Row) => { op = "insert"; row = r; writes.push({ op, row: r }); return q; };
    q["maybeSingle"] = async () => ({ data: stored, error: null });
    q["single"] = async () => (op === "select" ? { data: stored, error: null } : result());
    q["then"] = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
    return q;
  };
  return { supabase: { from }, writes };
}

const USER = "11111111-1111-4111-8111-111111111111";
const ENTRY = "22222222-2222-4222-8222-222222222222";
const input = (x: Row = {}) => ({
  id: null, createId: ENTRY, title: "Bill", merchant: "Shop", category: "Meals", scope: "personal", memberId: null, currency: "INR",
  originalAmount: 1234.56, date: "2026-11-10", description: "", paymentMethod: "cash", ...x,
});
let rate = 1;
beforeEach(() => {
  rate = 1;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ date: "2026-11-10", rates: { INR: rate } }) })));
});
afterEach(() => vi.unstubAllGlobals());
const call = (data: Row, stored: Row | null = null) => {
  const db = fakeSupabase(stored);
  const run = saveExpense as unknown as (a: { data: unknown; context: unknown }) => Promise<{ ok: boolean; error?: string }>;
  return run({ data, context: { supabase: db.supabase, userId: USER } }).then((r) => ({ r, writes: db.writes }));
};

describe("saveExpense refuses sub-paise source amounts (server)", () => {
  it("₹1234.567 is refused with the precision error and nothing is written", async () => {
    const { r, writes } = await call(input({ originalAmount: 1234.567 }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/INR 1234\.567 has more decimals than can be recorded/);
    expect(writes).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("₹1234.56 is accepted and posted exactly", async () => {
    const { r, writes } = await call(input());
    expect(r.ok).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.row).toMatchObject({ original_amount: 1234.56, amount: 1234.56, currency: "INR" });
  });
  it("JPY 1234.5 is accepted at the server but flagged for review", async () => {
    rate = 0.55;
    const { r, writes } = await call(input({ currency: "JPY", originalAmount: 1234.5 }));
    expect(r.ok).toBe(true);
    expect(writes[0]!.row).toMatchObject({ original_amount: 1234.5, currency: "JPY", fx_rate: 0.55, amount: 678.98 });
    expect(receiptReviewCheck(1234.5, {}, "JPY")).toMatchObject({ needed: true, precision: [expect.objectContaining({ read: "1234.5", allowed: 0 })] });
  });
});

describe("posting boundary: INR rounded once, half-up; posted records never recomputed", () => {
  it("a new USD 1.15 entry at 83.3 posts ₹95.80 (binary rounding gave 95.79)", async () => {
        rate = 83.3;
    const { r, writes } = await call(input({ currency: "USD", originalAmount: 1.15 }));
    expect(r.ok).toBe(true);
    expect(writes[0]!.row).toMatchObject({ original_amount: 1.15, currency: "USD", fx_rate: 83.3, amount: 95.8 });
  });
  const stored = { id: ENTRY, receipt_details: null, original_amount: 1.15, currency: "USD", expense_date: "2026-11-10", fx_rate: 83.3, fx_date: "2026-11-10", amount: 95.79 };
  it("editing only the category of an existing ₹95.79 entry keeps 95.79", async () => {
    rate = 83.3;
    const { r, writes } = await call(input({ id: ENTRY, createId: undefined, currency: "USD", originalAmount: 1.15, category: "Travel" }), stored);
    expect(r.ok).toBe(true);
    expect(writes).toEqual([{ op: "update", row: expect.objectContaining({ category: "Travel", amount: 95.79, fx_rate: 83.3 }) }]);
  });
  it("a category-only edit keeps ₹95.79 and fx_rate 83.3 even when the provider now returns 83.1, and fetches no rate", async () => {
    rate = 83.1; // a revised historical rate must not move a posted record
    const { r, writes } = await call(input({ id: ENTRY, createId: undefined, currency: "USD", originalAmount: 1.15, category: "Travel" }), stored);
    expect(r.ok).toBe(true);
    expect(writes).toEqual([{ op: "update", row: expect.objectContaining({ category: "Travel", amount: 95.79, fx_rate: 83.3, fx_date: "2026-11-10", original_amount: 1.15 }) }]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("a date-only edit recomputes half-up with the new date's rate, even when that rate equals the stored one", async () => {
    rate = 83.3; // same rate on the new date: the date changed, so ₹95.79 (old binary rounding) is recomputed to 95.80
    const same = await call(input({ id: ENTRY, createId: undefined, currency: "USD", originalAmount: 1.15, date: "2026-11-09" }), stored);
    expect(same.writes[0]!.row).toMatchObject({ amount: 95.8, fx_rate: 83.3, expense_date: "2026-11-09" });
    vi.mocked(fetch).mockClear();
    rate = 83.1; // 1.15 × 83.1 = 95.565 → 95.57 (binary rounding gave 95.56)
    const { writes } = await call(input({ id: ENTRY, createId: undefined, currency: "USD", originalAmount: 1.15, date: "2026-11-09" }), stored);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0]![0])).toContain("/2026-11-09?from=USD");
    expect(writes[0]!.row).toMatchObject({ amount: 95.57, fx_rate: 83.1, expense_date: "2026-11-09" });
  });
  it("an edit whose source amount or currency changes recomputes half-up", async () => {
    expect(fx.postedInrAmount(1.15, 83.3)).toBe(95.8);
    const { unchangedPosting } = fx;
    expect(unchangedPosting(stored, { originalAmount: 2.15, currency: "USD", date: "2026-11-10" })).toBeNull();
    expect(unchangedPosting(stored, { originalAmount: 1.15, currency: "EUR", date: "2026-11-10" })).toBeNull();
    expect(unchangedPosting({ ...stored, fx_rate: "83.30000000", original_amount: "1.15", amount: "95.79" }, { originalAmount: 1.15, currency: "USD", date: "2026-11-10" })).toEqual({ rate: 83.3, date: "2026-11-10", amount: 95.79 });
    rate = 83.3;
    const { writes } = await call(input({ id: ENTRY, createId: undefined, currency: "USD", originalAmount: 2.15 }), stored);
    expect(writes[0]!.row).toMatchObject({ amount: 179.1, fx_rate: 83.3 }); // 179.095
  });
});
