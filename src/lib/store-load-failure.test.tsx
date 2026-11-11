// P0-004 / P0-017 regression: the real StoreProvider (src/lib/store.tsx) with a fake Supabase client whose
// ledger (expenses) and preferences reads fail, after the encrypted device copy was painted.
// Before the fix (evidence: docs/evidence/screens/2026-11-09-p0-evidence/repro-store-load-failure.before.tsx.txt)
// the failed read replaced the records with empty lists, reported "synced" and overwrote the device copy.
// Now: last known records stay, the failure is reported per area, and the device copy is not overwritten.
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fail: new Set<string>(),
  snapshot: null as unknown,
  put: [] as { expenses: unknown[]; preferences: { trips: unknown[] } }[],
  /** Tables whose read rejects: the whole cloud read throws (R14b). */
  throwOn: new Set<string>(),
}));
vi.mock("@/integrations/supabase/client", () => {
  const result = (table: string) => h.fail.has(table)
    ? { data: null, error: { message: "Could not connect to the database", code: "PGRST000" } }
    : { data: table === "finance_preferences" || table === "profiles" ? null : [], error: null };
  const settle = (table: string) => h.throwOn.has(table) ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve(result(table));
  const builder = (table: string): unknown => new Proxy({}, {
    get: (_t, k) => k === "then" ? (ok: (v: unknown) => void, bad: (e: unknown) => void) => settle(table).then(ok, bad)
      : k === "maybeSingle" || k === "single" ? () => settle(table) : () => builder(table),
  });
  return { supabase: { from: (t: string) => builder(t), rpc: async () => ({ data: null, error: null }), storage: { from: () => ({ remove: async () => ({ error: null }) }) } } };
});
vi.mock("./offline", () => ({
  getSnapshot: async () => h.snapshot,
  putSnapshot: async (_o: string, s: { expenses: unknown[]; preferences: { trips: unknown[] } }) => { h.put.push(s); },
  pendingEntries: async () => [], queueEntry: async () => {}, removePending: async () => {},
}));
vi.mock("./fx.functions", () => ({ saveExpense: async () => ({ ok: true }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn(), info: vi.fn() }) }));

import { StoreProvider, useStore } from "./store";
import { defaultPreferences } from "./preferences";

type Seen = ReturnType<typeof useStore>;
const seen: { s: Seen | null } = { s: null };
function Probe() { seen.s = useStore(); return null; }
const cachedExpense = { id: "e1", title: "Swiggy order", amount: 640, originalAmount: 640, currency: "INR", fxRate: 1, date: "2026-11-01", category: "Food", scope: "personal", txnType: "expense", accountId: "bank", receipts: [], tags: [], splits: [], allocations: [], paymentMethod: "upi" };
const trip = { id: "t1", name: "Goa", start: "2026-12-01", end: "2026-12-05" };

afterEach(() => { cleanup(); h.fail.clear(); h.throwOn.clear(); h.put.length = 0; seen.s = null; });

const mount = async () => {
  await act(async () => { render(<StoreProvider userId="11111111-1111-4111-8111-111111111111"><Probe /></StoreProvider>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  return seen.s!;
};
const snapshot = () => ({ name: "KK", members: [], expenses: [cachedExpense], accounts: [{ id: "bank", name: "HDFC", kind: "savings", openingBalance: 1000, archived: false }], commitments: [], rawLoans: [], goals: [], budgets: {}, preferences: { ...defaultPreferences(), trips: [trip] }, valuations: [], documents: [] });

describe("P0-017: a failed ledger/preferences read never wipes records or the device copy", () => {
  it("keeps cached transactions and trips, reports the failed areas, and does not overwrite the device copy", async () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    h.snapshot = snapshot();
    h.fail.add("expenses"); h.fail.add("finance_preferences");
    const s = await mount();
    expect(s.transactions.map((t) => t.id)).toEqual(["e1"]);
    expect(s.preferences.trips).toHaveLength(1);
    expect(s.syncState).toBe("error");
    expect([...s.loadErrors].sort()).toEqual(["settings", "transactions"]);
    expect(h.put).toHaveLength(0);
    await expect(s.savePreferences({ ...s.preferences, trips: [] })).rejects.toThrow(/couldn't load/);
  });

  it("a successful retry clears the failure and saves the fresh device copy", async () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    h.snapshot = snapshot();
    h.fail.add("expenses");
    let s = await mount();
    expect(s.loadErrors).toEqual(["transactions"]);
    h.fail.clear();
    await act(async () => { await seen.s!.refresh(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    s = seen.s!;
    expect(s.loadErrors).toEqual([]);
    expect(s.syncState).toBe("synced");
    expect(h.put.length).toBeGreaterThan(0);
  });

  it("a cold start with no device copy shows no records but reports the failure instead of 'synced'", async () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    h.snapshot = undefined;
    h.fail.add("expenses");
    const s = await mount();
    expect(s.transactions).toHaveLength(0);
    expect(s.loadErrors).toContain("transactions");
    expect(s.syncState).toBe("error");
    expect(h.put).toHaveLength(0);
  });
});

describe("R14b: a whole-read failure after the device copy was painted", () => {
  it("is reported as readFailure (not only syncState), keeps the cached records flagged, and never overwrites the device copy", async () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    h.snapshot = snapshot();
    h.throwOn.add("expenses");
    let s = await mount();
    expect(s.syncState).toBe("error");
    expect(s.readFailure).toMatchObject({ kind: "failed" });
    expect(s.loadErrors).toEqual([]);
    expect(s.transactions.map((t) => t.id)).toEqual(["e1"]); // values kept in memory
    expect(s.areaStatus("transactions")).toEqual({ status: "failed", note: null, cached: true });
    expect(s.areaStatus("accounts")).toEqual({ status: "failed", note: null, cached: true });
    expect(h.put).toHaveLength(0);
    h.throwOn.clear();
    await act(async () => { await seen.s!.refresh(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    s = seen.s!;
    expect(s.readFailure).toBeNull();
    expect(s.syncState).toBe("synced");
    expect(s.areaStatus("transactions").status).toBe("empty");
    expect(h.put.length).toBeGreaterThan(0);
  });
});
