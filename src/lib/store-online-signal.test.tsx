// Single offline signal: the real StoreProvider's money movements (finance_operation, including the P20 claim receipt
// correction) follow the store's own `online` state (useStore().online), never navigator.onLine, so a screen that
// shows "online" never sees a payment refused as offline, and a screen that shows "offline" never sends one.
// Fake Supabase client and device storage only; no Cloud.
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ rpc: [] as { name: string; args: Record<string, unknown> }[] }));
vi.mock("@/integrations/supabase/client", () => {
  const result = (table: string) => ({ data: table === "finance_preferences" || table === "profiles" ? null : [], error: null });
  const builder = (table: string): unknown => new Proxy({}, {
    get: (_t, k) => k === "then" ? (ok: (v: unknown) => void, bad: (e: unknown) => void) => Promise.resolve(result(table)).then(ok, bad)
      : k === "maybeSingle" || k === "single" ? () => Promise.resolve(result(table)) : () => builder(table),
  });
  return { supabase: {
    from: (t: string) => builder(t),
    rpc: async (name: string, args: Record<string, unknown>) => { h.rpc.push({ name, args }); return { data: { ok: true }, error: null }; },
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  } };
});
vi.mock("./offline", () => ({
  getSnapshot: async () => undefined, putSnapshot: async () => {},
  pendingEntries: async () => [], queueEntry: async () => {}, removePending: async () => {},
}));
vi.mock("./fx.functions", () => ({ saveExpense: async () => ({ ok: true }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn(), info: vi.fn() }) }));

import { StoreProvider, useStore } from "./store";
import type { Expense } from "./expenses";

type Seen = ReturnType<typeof useStore>;
const seen: { s: Seen | null } = { s: null };
function Probe() { seen.s = useStore(); return null; }
const setNavigatorOnline = (v: boolean) => Object.defineProperty(navigator, "onLine", { value: v, configurable: true });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 50)); });
const mount = async () => {
  await act(async () => { render(<StoreProvider userId="11111111-1111-4111-8111-111111111111"><Probe /></StoreProvider>); });
  await settle();
  return seen.s!;
};
const finance = () => h.rpc.filter((c) => c.name === "finance_operation");

// Case J's visa claim: 5,000 cited from a money-back entry that is already counted on the hotel claim.
const visa = { id: "22222222-2222-4222-8222-222222222222", title: "Visa", amount: 5000, originalAmount: 5000, currency: "INR", fxRate: 1, date: "2026-10-12",
  category: "Travel", scope: "personal", txnType: "expense", accountId: "bank", receipts: [], tags: [], splits: [], allocations: [], paymentMethod: "upi",
  reimbursementStatus: "received",
  reimbursement: { kind: "employer", payer: "Alpha Traders", reimbursable: 5000, stage: "submitted", receipts: [{ id: "v1", txnId: "rr", date: "2026-10-25", amount: 5000 }] },
} as unknown as Expense;
const hotel = { ...visa, id: "33333333-3333-4333-8333-333333333333", title: "Hotel", reimbursementStatus: "pending",
  reimbursement: { kind: "employer", payer: "Alpha Traders", reimbursable: 5000, stage: "submitted", receipts: [] } } as unknown as Expense;
const correction = { receiptId: "v1", newAmount: 0, reason: "Already counted on the hotel claim", operationId: "op-online-1" };

afterEach(() => { cleanup(); h.rpc.length = 0; seen.s = null; setNavigatorOnline(true); });

describe("useStore().online is the single offline signal for money movements", () => {
  it("store offline while navigator.onLine is true: the correction and a receipt are refused honestly, no RPC is sent", async () => {
    setNavigatorOnline(true);
    await mount();
    await act(async () => { window.dispatchEvent(new Event("offline")); });
    await settle();
    const s = seen.s!;
    expect(s.online).toBe(false);
    expect(navigator.onLine).toBe(true);
    h.rpc.length = 0;
    await expect(s.correctReimbursementReceipt(visa, correction)).rejects.toThrow("Reconnect to update this claim");
    await expect(s.addReimbursementReceipt(hotel, { operationId: "op-online-2", amount: 1000, date: "2026-11-02", accountId: "bank" })).rejects.toThrow("Reconnect to record this payment");
    expect(finance()).toEqual([]);
  });

  it("store online while navigator.onLine is false: the store's signal governs and the correction is sent", async () => {
    setNavigatorOnline(true);
    await mount();
    setNavigatorOnline(false); // no 'offline' event: the store still reads online
    const s = seen.s!;
    expect(s.online).toBe(true);
    h.rpc.length = 0;
    await act(async () => { await s.correctReimbursementReceipt(visa, correction); });
    expect(finance()).toEqual([{ name: "finance_operation", args: { action: "correct_claim_receipt",
      payload: { operationId: "op-online-1", id: visa.id, receiptId: "v1", expectedAmount: 5000, newAmount: 0, reason: "Already counted on the hotel claim" } } }]);
  });
});
