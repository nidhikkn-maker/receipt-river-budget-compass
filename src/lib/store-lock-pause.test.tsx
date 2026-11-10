// P0-029 remainder: the real StoreProvider (src/lib/store.tsx) with a fake Supabase client that counts every
// request. While the app is locked (app-lock-state.ts) no cloud read, offline-queue flush or paint happens; an
// authorised unlock flushes and refreshes exactly once; a load the lock interrupted never paints its result.
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  calls: [] as string[],
  saves: [] as string[],
  hold: null as null | { promise: Promise<void>; release: () => void },
  title: "Swiggy order",
  pending: [] as { id: string; owner: string; input: unknown; files: File[]; createdAt: string }[],
}));
vi.mock("@/integrations/supabase/client", () => {
  const row = () => ({ id: "e1", title: h.title, amount: 640, original_amount: 640, currency: "INR", fx_rate: 1, expense_date: "2026-11-01", category: "Food", scope: "personal", txn_type: "expense", account_id: "bank", receipts: [], tags: [], splits: [], allocations: [], payment_method: "upi", receipt_details: {} });
  const result = async (table: string) => {
    if (table === "expenses" && h.hold) await h.hold.promise;
    return { data: table === "finance_preferences" || table === "profiles" ? null : table === "expenses" ? [row()] : [], error: null };
  };
  const builder = (table: string): unknown => new Proxy({}, {
    get: (_t, k) => k === "then" ? (ok: (v: unknown) => void, bad: (e: unknown) => void) => result(table).then(ok, bad)
      : k === "maybeSingle" || k === "single" ? () => result(table) : () => builder(table),
  });
  return { supabase: { from: (t: string) => { h.calls.push(t); return builder(t); }, rpc: async (n: string) => { h.calls.push(`rpc:${n}`); return { data: null, error: null }; }, storage: { from: () => ({ remove: async () => ({ error: null }) }) } } };
});
vi.mock("./offline", () => ({
  getSnapshot: async () => undefined,
  putSnapshot: async () => {},
  pendingEntries: async () => [...h.pending], queueEntry: async () => {},
  removePending: async (id: string) => { h.pending = h.pending.filter((p) => p.id !== id); },
}));
vi.mock("./fx.functions", () => ({ saveExpense: async ({ data }: { data: { createId?: string } }) => { h.saves.push(data.createId ?? "edit"); return { ok: true }; } }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn(), info: vi.fn() }) }));

import { StoreProvider, useStore } from "./store";
import { setAppLocked } from "./app-lock-state";
import { STALE_LOCK_MS } from "./lock-gate";

const seen: { s: ReturnType<typeof useStore> | null } = { s: null };
function Probe() { seen.s = useStore(); return null; }
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
/** One full store load reads the profile once (a cold start reads the ledger twice: light, then full). */
const loads = () => h.calls.filter((c) => c === "profiles").length;
const lock = (v: boolean) => act(async () => { setAppLocked(v); });
const mount = async () => {
  await act(async () => { render(<StoreProvider userId="11111111-1111-4111-8111-111111111111"><Probe /></StoreProvider>); });
  await settle();
};
const hold = () => { let release = () => {}; const promise = new Promise<void>((r) => { release = r; }); h.hold = { promise, release }; return h.hold; };
const entry = (id: string) => ({ id, owner: "11111111-1111-4111-8111-111111111111", createdAt: "2026-11-10T09:00:00Z", files: [],
  input: { title: "Chai", merchant: "", category: "Food", scope: "personal", memberId: null, amount: 40, currency: "INR", date: "2026-11-10", description: "", paymentMethod: "cash", txnType: "expense", accountId: "bank" } });

beforeEach(() => { Object.defineProperty(navigator, "onLine", { value: true, configurable: true }); });
afterEach(async () => { await lock(false); cleanup(); h.calls.length = 0; h.saves.length = 0; h.hold = null; h.pending = []; h.title = "Swiggy order"; seen.s = null; vi.restoreAllMocks(); });

describe("P0-029: the financial store pauses while the app is locked", () => {
  it("issues no request while locked (refresh, reconnect, offline flush) and exactly one refresh after unlock", async () => {
    await mount();
    expect(loads()).toBe(1);
    h.calls.length = 0;
    await lock(true);
    h.pending = [entry("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")];
    await act(async () => { await seen.s!.refresh(); await seen.s!.refresh(); window.dispatchEvent(new Event("online")); await seen.s!.retrySync(); });
    await settle();
    expect(h.calls).toEqual([]);
    expect(h.saves).toEqual([]);
    await lock(false);
    await settle();
    expect(h.saves).toEqual(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]);
    expect(loads()).toBe(1);
    expect(h.pending).toEqual([]);
  });

  it("a refresh in flight when the app locks never paints its result; unlock refreshes once and paints", async () => {
    await mount();
    expect(seen.s!.transactions[0]?.title).toBe("Swiggy order");
    h.calls.length = 0;
    const gate = hold();
    h.title = "Salary ₹2,45,000.00";
    let done = false;
    await act(async () => { void seen.s!.refresh().then(() => { done = true; }); });
    expect(loads()).toBe(1);
    await lock(true);
    await act(async () => { gate.release(); });
    await settle();
    expect(done).toBe(true);
    expect(seen.s!.transactions[0]?.title).toBe("Swiggy order");
    h.hold = null;
    await lock(false);
    await settle();
    expect(loads()).toBe(2);
    expect(seen.s!.transactions[0]?.title).toBe("Salary ₹2,45,000.00");
  });

  it("lock/unlock races: a re-lock before the resumed refresh starts defers it again; the final unlock refreshes once", async () => {
    await mount();
    h.calls.length = 0;
    await lock(true);
    await act(async () => { await seen.s!.refresh(); });
    // Unlock and lock again in the same tick: the resumed refresh finds the app locked and waits.
    await act(async () => { setAppLocked(false); setAppLocked(true); });
    await settle();
    expect(h.calls).toEqual([]);
    for (let i = 0; i < 5; i++) await act(async () => { setAppLocked(false); setAppLocked(true); });
    await settle();
    expect(h.calls).toEqual([]);
    await lock(false);
    await settle();
    expect(loads()).toBe(1);
  });

  it("a brief lock that deferred nothing causes no load; a lock longer than the stale limit refreshes once on unlock", async () => {
    await mount();
    h.calls.length = 0;
    await lock(true); await lock(false); await settle();
    expect(h.calls).toEqual([]);
    const start = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(start);
    await lock(true);
    now.mockReturnValue(start + STALE_LOCK_MS + 1);
    await lock(false); await settle();
    expect(loads()).toBe(1);
  });
});
