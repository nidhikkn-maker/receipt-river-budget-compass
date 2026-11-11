// Single offline signal: the real StoreProvider's money movements (finance_operation, including the P20 claim receipt
// correction) follow the store's own `online` state (useStore().online), never navigator.onLine, so a screen that
// shows "online" never sees a payment refused as offline, and a screen that shows "offline" never sends one.
// Fake Supabase client and device storage only; no Cloud.
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ rpc: [] as { name: string; args: Record<string, unknown> }[], from: [] as string[], saved: [] as unknown[], queued: [] as unknown[],
  removed: [] as string[], pending: [] as Record<string, unknown>[] }));
vi.mock("@/integrations/supabase/client", () => {
  const result = (table: string) => ({ data: table === "finance_preferences" || table === "profiles" ? null : [], error: null });
  const builder = (table: string): unknown => new Proxy({}, {
    get: (_t, k) => k === "then" ? (ok: (v: unknown) => void, bad: (e: unknown) => void) => Promise.resolve(result(table)).then(ok, bad)
      : k === "maybeSingle" || k === "single" ? () => Promise.resolve(result(table)) : () => builder(table),
  });
  return { supabase: {
    from: (t: string) => { h.from.push(t); return builder(t); },
    rpc: async (name: string, args: Record<string, unknown>) => { h.rpc.push({ name, args }); return { data: { ok: true }, error: null }; },
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  } };
});
vi.mock("./offline", () => ({
  getSnapshot: async () => undefined, putSnapshot: async () => {},
  pendingEntries: async () => [...h.pending], queueEntry: async (e: unknown) => { h.queued.push(e); }, removePending: async (id: string) => { h.removed.push(id); h.pending = h.pending.filter((p) => p["id"] !== id); },
}));
vi.mock("./fx.functions", () => ({ saveExpense: async (x: unknown) => { h.saved.push(x); return { ok: true }; } }));
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

afterEach(() => { cleanup(); h.rpc.length = 0; h.from.length = 0; h.saved.length = 0; h.queued.length = 0; h.removed.length = 0; h.pending = []; seen.s = null; setNavigatorOnline(true); });
const reset = () => { h.rpc.length = 0; h.from.length = 0; h.saved.length = 0; h.queued.length = 0; h.removed.length = 0; };
const cloudWrites = () => [...h.rpc.map((c) => `rpc:${c.name}`), ...h.from.map((t) => `from:${t}`), ...h.saved.map(() => "saveExpense")];
const OWNER = "11111111-1111-4111-8111-111111111111";
const entry = { title: "Tea", merchant: "", category: "Food", scope: "personal", memberId: null, amount: 50, currency: "INR", date: "2026-11-01", description: "", paymentMethod: "cash", txnType: "expense", accountId: "bank" };
/** Every store write path that refuses offline, called with minimal arguments (the gate is their first check). */
const writePaths = (s: Seen): [string, () => Promise<unknown>][] => [
  ["saveStatementUpload", () => s.saveStatementUpload({} as never)],
  ["commitDocumentRecords", () => s.commitDocumentRecords("doc", {} as never, false)],
  ["postOpening", () => s.postOpening({ id: "x", entityId: "e", fy: "2026-27", date: "2026-04-01", lines: [], exceptions: [], docId: null })],
  ["postAccounting", () => s.postAccounting({ owner: OWNER } as never)],
  ["correctFinancialEntries", () => s.correctFinancialEntries({} as never, "id")],
  ["confirmTransfer", () => s.confirmTransfer({ id: "t", debit: visa, destId: "d", credit: null })],
  ["applyReviewMetadata", () => s.applyReviewMetadata({} as never, "id")],
  ["applyReviewMapping", () => s.applyReviewMapping({} as never)],
  ["saveRecurringReview", () => s.saveRecurringReview({} as never, "id")],
  ["save (edit)", () => s.save(entry as never, { id: visa.id })],
];
const message = (p: Promise<unknown>) => Promise.race([p.then(() => "", (e: Error) => e?.message ?? String(e)), new Promise<string>((r) => setTimeout(() => r("(still running)"), 500))]);

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

describe("useStore().online is the single offline signal for every store write path, the offline queue and the cloud read", () => {
  it("store offline while navigator.onLine is true: every write path refuses, a new entry is queued, nothing reaches the cloud", async () => {
    setNavigatorOnline(true);
    await mount();
    await act(async () => { window.dispatchEvent(new Event("offline")); });
    await settle();
    const s = seen.s!;
    expect([s.online, navigator.onLine]).toEqual([false, true]);
    reset();
    for (const [name, run] of writePaths(s)) expect([name, await message(run())]).toEqual([name, expect.stringMatching(/Reconnect/)]);
    // a new entry is queued exactly as offline today (stable id), never saved
    await act(async () => { await s.save(entry as never, { createId: "44444444-4444-4444-8444-444444444444" }); });
    expect(h.queued).toHaveLength(1);
    expect((h.queued[0] as { id: string }).id).toBe("44444444-4444-4444-8444-444444444444");
    // the cloud read does not run either
    await act(async () => { await s.refresh().catch(() => {}); });
    await settle();
    expect(cloudWrites()).toEqual([]);
  });

  it("store online while navigator.onLine is false: write paths pass the offline gate, a new entry is saved (not queued) and the read runs", async () => {
    setNavigatorOnline(true);
    await mount();
    setNavigatorOnline(false); // no 'offline' event: the store still reads online
    const s = seen.s!;
    expect(s.online).toBe(true);
    reset();
    for (const [name, run] of writePaths(s)) expect([name, await message(run())]).toEqual([name, expect.not.stringMatching(/Reconnect/)]);
    reset();
    await act(async () => { await s.save(entry as never, { createId: "55555555-5555-4555-8555-555555555555", noRefresh: true }); });
    expect(h.queued).toEqual([]);
    expect(h.saved).toHaveLength(1);
    reset();
    await act(async () => { await s.refresh().catch(() => {}); });
    expect(h.from.length).toBeGreaterThan(0);
  });

  it("the offline queue flushes on the store's signal: held while the store is offline, saved once on the 'online' event", async () => {
    setNavigatorOnline(false);
    h.pending = [{ id: "66666666-6666-4666-8666-666666666666", owner: OWNER, input: entry, files: [], createdAt: "2026-11-01T00:00:00Z" }];
    await mount();
    expect(seen.s!.online).toBe(false);
    expect(h.saved).toEqual([]);
    // navigator back without the event: the store still reads offline, so nothing is flushed
    setNavigatorOnline(true);
    await act(async () => { await seen.s!.refresh().catch(() => {}); });
    await settle();
    expect(h.saved).toEqual([]);
    expect(h.removed).toEqual([]);
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await settle();
    expect(seen.s!.online).toBe(true);
    expect(h.saved).toHaveLength(1);
    expect(h.removed).toEqual(["66666666-6666-4666-8666-666666666666"]);
    expect(h.queued).toEqual([]);
  });
});
