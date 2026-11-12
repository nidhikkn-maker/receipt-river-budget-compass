// Release gate (review of 6394ac8): refresh() rejects when the cloud read fails, including the heal path after a missed
// 'online' event. Fire-and-forget callers (the header sync pill, the device unlock, About's "Check again") must not
// leave an unhandled rejection; the failure is shown the way the UI already shows it (syncState / readFailure), with
// no extra toast. Mocked store only; no Cloud.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  store: {} as Record<string, unknown>,
  onUnlock: null as null | (() => void),
  toasts: [] as string[],
}));
vi.mock("@/lib/store", () => ({ useStore: () => h.store }));
vi.mock("sonner", () => ({ toast: Object.assign((m: string) => { h.toasts.push(m); }, {
  error: (m: string) => { h.toasts.push(`error:${m}`); }, success: (m: string) => { h.toasts.push(`success:${m}`); }, message: () => {}, info: () => {},
}) }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => async () => {},
  useRouter: () => ({ invalidate: async () => {}, history: { block: () => () => {} } }),
  createFileRoute: () => (opts: unknown) => ({ options: opts }),
  Link: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/lib/app-lock-state", () => ({ useAppLocked: () => false }));
vi.mock("./OwnerLock", () => ({ OwnerLock: ({ children, onUnlock }: { children: unknown; onUnlock?: () => void }) => { h.onUnlock = onUnlock ?? null; return children; } }));
vi.mock("@/components/AppShell", () => ({ PageTitle: ({ title }: { title: string }) => title }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }) }) } }));

import { SyncStatus } from "./shell/SyncStatus";
import { DeviceLock } from "./DeviceLock";
import { Route as AboutRoute } from "@/routes/_authenticated/about";

const unhandled: unknown[] = [];
const onUnhandled = (e: unknown) => { unhandled.push(e); };
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
// A plain function, not vi.fn: a spy records settled results and so would itself handle the rejection.
let refreshCalls = 0;
const failingRefresh = () => () => { refreshCalls++; return Promise.reject(new TypeError("Failed to fetch")); };

beforeEach(() => {
  unhandled.length = 0; h.toasts.length = 0; refreshCalls = 0; h.onUnlock = null;
  process.on("unhandledRejection", onUnhandled);
  h.store = { syncState: "error", lastSyncedAt: null, pendingCount: 0, userId: "u1", loadErrors: [], online: true, readFailure: null, refresh: failingRefresh() };
});
afterEach(() => { cleanup(); process.off("unhandledRejection", onUnhandled); });

describe("a refresh that rejects is handled where it is fired and forgotten", () => {
  it("header sync pill (both forms): retried, no unhandled rejection, no extra toast; the pill keeps showing the failure", async () => {
    for (const compact of [true, false]) {
      cleanup();
      render(<SyncStatus compact={compact} />);
      fireEvent.click(screen.getByRole("button"));
      await flush();
      expect(screen.getByRole("button").textContent).toMatch(/Couldn't update/);
    }
    expect(refreshCalls).toBe(2);
    expect(unhandled).toEqual([]);
    expect(h.toasts).toEqual([]);
  });

  it("device unlock: the refetch failing leaves no unhandled rejection and no toast", async () => {
    render(<DeviceLock><p>page</p></DeviceLock>);
    expect(h.onUnlock).toBeTypeOf("function");
    act(() => { h.onUnlock!(); });
    await flush();
    expect(refreshCalls).toBe(1);
    expect(unhandled).toEqual([]);
    expect(h.toasts).toEqual([]);
  });

  it("About 'Check again': no unhandled rejection or toast; a whole-read failure shows on the records row", async () => {
    const About = (AboutRoute as unknown as { options: { component: () => JSX.Element } }).options.component;
    h.store = { ...h.store, readFailure: { kind: "failed", at: "2026-11-12T00:00:00Z", message: "Failed to fetch" } };
    render(<About />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await flush();
    expect(refreshCalls).toBe(1);
    expect(unhandled).toEqual([]);
    expect(h.toasts).toEqual([]);
    expect(screen.getByText(/Couldn't reach your records on the last refresh/)).toBeTruthy();
  });
});
