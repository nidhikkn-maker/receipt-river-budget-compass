// P0-001 screen regression: no Delete on assets; Archive needs confirmation + reason; Archived assets view; restore;
// net worth and book value unchanged. The store mock saves through the real preserveForSave/normalizePreferences path.
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Asset } from "@/lib/assets";
import { normalizePreferences, type FinancePreferences } from "@/lib/preferences";
import { canonical, preserveForSave } from "@/lib/preserve-records";
import { withoutArchiveFields } from "@/lib/archive";

const OWNER = "11111111-1111-4111-8111-111111111111";
const state = vi.hoisted(() => ({ stored: {} as Record<string, unknown>, store: {} as Record<string, unknown>, version: 0, listeners: new Set<() => void>(), saves: 0 }));
vi.mock("@/lib/store", () => ({ useStore: () => { useSyncExternalStore((l) => { state.listeners.add(l); return () => state.listeners.delete(l); }, () => state.version); return state.store; } }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (value: unknown) => value, useRouterState: () => "", Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("@/components/AppShell", () => ({ PageTitle: ({ title, sub }: { title: string; sub?: string }) => <header><h1>{title}</h1><p data-testid="subtitle">{sub}</p></header> }));
vi.mock("@/components/books/PropertyPanel", () => ({ PropertyPanel: () => null }));
vi.mock("@/components/books/AssetBooks", () => ({ AssetLifecycle: () => <p>Lifecycle</p>, DepreciationBooks: () => null }));
vi.mock("@/components/books/AssetCheck", () => ({ AssetCheck: () => null }));
vi.mock("@/lib/investments/holdings-store", () => ({ loadDemat: async () => [] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => { const q: Record<string, unknown> = { then: (done: (x: unknown) => unknown) => Promise.resolve(done({ data: [], error: null })) }; for (const n of ["select", "in", "order", "limit", "eq", "maybeSingle"]) q[n] = () => q; return q; } } }));

import { Route } from "@/routes/_authenticated/assets";
import { NetWorthCard } from "@/components/books/NetWorthCard";
const Assets = (Route as unknown as { component: () => React.ReactElement }).component;

const laptop: Asset = { id: "laptop", name: "MacBook Pro (office)", kind: "computer", cost: 185000, inUse: "2025-05-12", sharePct: 100, bookMethod: "wdv", bookRatePct: 40, docId: "doc-inv", docIds: ["doc-photo"], tag: "TH-CMP-014", accountId: "acc-fixed", paymentId: "txn-buy", ownerEntityId: "ent-1" };
const flat: Asset = { id: "flat", name: "Anna Nagar flat", kind: "property", cost: 8500000, inUse: "2019-03-01", sharePct: 50, bookMethod: "slm", bookRatePct: 0 };

function publish(stored: Record<string, unknown>) {
  state.stored = stored;
  state.store = {
    userId: OWNER, preferences: normalizePreferences(stored as Partial<FinancePreferences>), transactions: [], accounts: [], valuations: [], loans: [],
    documents: [{ id: "doc-inv", title: "Croma invoice" }],
    savePreferences: async (next: FinancePreferences) => { state.saves++; publish(preserveForSave(state.stored, next) as unknown as Record<string, unknown>); },
  };
  state.version++; act(() => { state.listeners.forEach((f) => f()); });
}
const storedAssets = () => state.stored["assets"] as (Asset & Record<string, unknown>)[];
const netWorth = () => screen.getByLabelText("Net worth summary").textContent;
const subtitle = () => screen.getByTestId("subtitle").textContent;

beforeEach(() => { state.saves = 0; publish({ assets: [laptop, flat] }); });
afterEach(() => { cleanup(); state.listeners.clear(); });

async function openArchive() {
  fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
  fireEvent.click(screen.getByRole("button", { name: "Archive" }));
  return screen.findByRole("dialog");
}

describe("asset register: archive instead of delete", () => {
  it("offers no Delete control anywhere, so an asset cannot be removed by accident", () => {
    render(<Assets />);
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    expect(screen.queryByRole("button", { name: /delete|remove/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(state.saves).toBe(0);
  });

  it("archive needs confirmation and a reason; cancelling changes nothing", async () => {
    render(<Assets />);
    const dialog = await openArchive();
    expect(within(dialog).getByText("Archive this asset?")).toBeInTheDocument();
    expect(within(dialog).getByText(/use Lifecycle on the asset instead/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Archive asset" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "old" } });
    expect(confirm).toBeDisabled();
    expect(within(dialog).getByText(/at least 5 letters/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(state.saves).toBe(0);
    expect(storedAssets()).toEqual([laptop, flat]);
  });

  it("archives with who/when/why, keeps the record and every figure, lists it under Archived assets, and restores", async () => {
    render(<><NetWorthCard /><Assets /></>);
    await waitFor(() => expect(netWorth()).toMatch(/₹/));
    const worthBefore = netWorth(), subBefore = subtitle();
    const dialog = await openArchive();
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Moved to company books" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Archive asset" }));
    await waitFor(() => expect(state.saves).toBe(1));

    const saved = storedAssets();
    expect(saved).toHaveLength(2);
    const a = saved.find((x) => x.id === "laptop")!;
    expect(canonical(withoutArchiveFields(a))).toBe(canonical(laptop));
    expect(a.archivedBy).toBe(OWNER);
    expect(Date.parse(a.archivedAt ?? "")).not.toBeNaN();
    expect(a.archiveReason).toBe("Moved to company books");
    expect(a.archiveHistory).toEqual([{ action: "archived", at: a.archivedAt, by: OWNER, reason: "Moved to company books" }]);
    expect(saved.find((x) => x.id === "flat")).toEqual(flat);

    // Active list no longer offers editing it; the Archived assets view shows it with who/when/why and Restore.
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
    const view = screen.getByText("Archived assets (1)").closest("details")!;
    expect(within(view).getByText(/MacBook Pro \(office\)/)).toBeInTheDocument();
    expect(within(view).getAllByText("Archived").length).toBeGreaterThan(0);
    expect(within(view).getAllByText(/Archived by you on .* · Reason: Moved to company books/).length).toBeGreaterThan(0);
    expect(within(view).getByText(/now ₹/)).toBeInTheDocument();
    // Figures unchanged: book value total and net worth.
    expect(subtitle()).toBe(`${subBefore} · includes 1 archived`);
    expect(netWorth()).toBe(worthBefore);

    fireEvent.click(within(view).getByRole("button", { name: "Restore" }));
    const restore = await screen.findByRole("dialog");
    expect(within(restore).getByText("Restore this asset?")).toBeInTheDocument();
    expect(within(restore).getByRole("button", { name: "Restore asset" })).toBeDisabled();
    fireEvent.change(within(restore).getByLabelText("Reason"), { target: { value: "Archived by mistake" } });
    fireEvent.click(within(restore).getByRole("button", { name: "Restore asset" }));
    await waitFor(() => expect(state.saves).toBe(2));

    const back = storedAssets().find((x) => x.id === "laptop")!;
    expect(back.archivedAt).toBeUndefined();
    expect(canonical(withoutArchiveFields(back))).toBe(canonical(laptop));
    expect(back.archiveHistory?.map((e) => [e.action, e.by, e.reason])).toEqual([["archived", OWNER, "Moved to company books"], ["restored", OWNER, "Archived by mistake"]]);
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(2);
    expect(screen.getByText("Archived assets (0)")).toBeInTheDocument();
    expect(subtitle()).toBe(subBefore);
    expect(netWorth()).toBe(worthBefore);
  });
});
