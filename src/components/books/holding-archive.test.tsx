// P0-001 (requirement 8): manual investment holdings are archived, never removed, and stay valued in net worth.
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Holding } from "@/lib/books/types";
import { normalizePreferences, type FinancePreferences } from "@/lib/preferences";
import { canonical, preserveForSave } from "@/lib/preserve-records";
import { withoutArchiveFields } from "@/lib/archive";

const OWNER = "11111111-1111-4111-8111-111111111111";
const state = vi.hoisted(() => ({ stored: {} as Record<string, unknown>, store: {} as Record<string, unknown>, version: 0, listeners: new Set<() => void>(), saves: 0 }));
vi.mock("@/lib/store", () => ({ useStore: () => { useSyncExternalStore((l) => { state.listeners.add(l); return () => state.listeners.delete(l); }, () => state.version); return state.store; } }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@/lib/mutual-funds.functions", () => ({ getFundNav: vi.fn() }));
vi.mock("@/lib/investments/holdings-store", () => ({ loadDemat: async () => [] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => { const q: Record<string, unknown> = { then: (done: (x: unknown) => unknown) => Promise.resolve(done({ data: [], error: null })) }; for (const n of ["select", "in", "order", "limit", "eq", "maybeSingle"]) q[n] = () => q; return q; } } }));
vi.mock("@tanstack/react-router", () => ({ useRouterState: () => "", Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
import { MarketPanel } from "./MarketPanel";
import { NetWorthCard } from "./NetWorthCard";

const gold: Holding = { id: "gold", kind: "physical_gold", name: "Gold coins", quantity: 1, grams: 40, karat: 24, sharePct: 100, costBasis: 210000, source: "entered by you" };
const etf: Holding = { id: "etf", kind: "etf", name: "Nifty ETF", quantity: 10, sharePct: 100, source: "statement", isin: "INF000000001" };
function publish(stored: Record<string, unknown>) {
  state.stored = stored;
  state.store = { userId: OWNER, preferences: normalizePreferences(stored as Partial<FinancePreferences>), transactions: [], accounts: [], valuations: [], loans: [], documents: [],
    savePreferences: async (next: FinancePreferences) => { state.saves++; publish(preserveForSave(state.stored, next) as unknown as Record<string, unknown>); } };
  state.version++; act(() => { state.listeners.forEach((f) => f()); });
}
const holdings = () => (state.stored["books"] as { holdings: (Holding & Record<string, unknown>)[] }).holdings;
beforeEach(() => { state.saves = 0; publish({ books: { holdings: [gold, etf], goldRate: { perGram24k: 7600, date: "2026-11-08", source: "entered by you" } } }); });
afterEach(() => { cleanup(); state.listeners.clear(); });

it("holding: no Remove; archive with reason keeps it valued in net worth; restore is recorded", async () => {
  render(<><NetWorthCard /><MarketPanel /></>);
  fireEvent.click(screen.getByText("Investments & net worth"));
  await waitFor(() => expect(screen.getByLabelText("Net worth summary").textContent).toContain("3,04,000"));
  const worth = screen.getByLabelText("Net worth summary").textContent;
  expect(screen.queryByRole("button", { name: /remove|delete/i })).toBeNull();
  fireEvent.click(screen.getAllByRole("button", { name: "Archive" })[0]!);
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Archive this holding?")).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Archive holding" })).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Coins gifted to family trust; kept for records" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Archive holding" }));
  await waitFor(() => expect(state.saves).toBe(1));
  expect(holdings()).toHaveLength(2);
  const g = holdings().find((h) => h.id === "gold")!;
  expect(canonical(withoutArchiveFields(g))).toBe(canonical(gold));
  expect(g).toMatchObject({ archivedBy: OWNER, archiveReason: "Coins gifted to family trust; kept for records" });
  expect(holdings().find((h) => h.id === "etf")).toEqual(etf);
  expect(screen.getByLabelText("Net worth summary").textContent).toBe(worth);
  expect(screen.getByText(/Archived by you on .* still valued and counted/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Restore" }));
  const restore = await screen.findByRole("dialog");
  fireEvent.change(within(restore).getByLabelText("Reason"), { target: { value: "Archived by mistake" } });
  fireEvent.click(within(restore).getByRole("button", { name: "Restore holding" }));
  await waitFor(() => expect(state.saves).toBe(2));
  const back = holdings().find((h) => h.id === "gold")!;
  expect(back.archivedAt).toBeUndefined();
  expect(canonical(withoutArchiveFields(back))).toBe(canonical(gold));
  expect(back.archiveHistory?.map((e) => e.action)).toEqual(["archived", "restored"]);
  expect(screen.getByLabelText("Net worth summary").textContent).toBe(worth);
});
