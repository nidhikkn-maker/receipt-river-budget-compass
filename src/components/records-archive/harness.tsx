// Test harness for the C1 archive screens: an isolated in-memory store whose savePreferences goes through the real
// preserveForSave + normalizePreferences path (as store.tsx does), so a test sees exactly what would be stored.
// Table-backed methods (removeLoan, removeDocument, ...) are spies; nothing reaches Supabase or any hosted service.
import { useSyncExternalStore } from "react";
import { act } from "@testing-library/react";
import { vi } from "vitest";
import { normalizePreferences, type FinancePreferences } from "@/lib/preferences";
import { preserveForSave } from "@/lib/preserve-records";

export const OWNER = "11111111-1111-4111-8111-111111111111";

export const harness = {
  stored: {} as Record<string, unknown>,
  store: {} as Record<string, unknown>,
  extra: {} as Record<string, unknown>,
  version: 0,
  listeners: new Set<() => void>(),
  saves: 0,
  calls: [] as { name: string; args: unknown[] }[],
};

/** A table-backed store method that only records the call. */
export const spy = (name: string) => vi.fn(async (...args: unknown[]) => { harness.calls.push({ name, args }); });
export const callsOf = (name: string) => harness.calls.filter((c) => c.name === name);

export function publish(stored: Record<string, unknown>, extra: Record<string, unknown> = harness.extra) {
  harness.stored = stored;
  harness.extra = extra;
  harness.store = {
    userId: OWNER, transactions: [], accounts: [], valuations: [], loans: [], goals: [], commitments: [], documents: [], budgets: {}, members: [],
    ...extra,
    preferences: normalizePreferences(stored as Partial<FinancePreferences>),
    savePreferences: async (next: FinancePreferences) => { harness.saves++; publish(preserveForSave(harness.stored, next) as unknown as Record<string, unknown>, harness.extra); },
  };
  harness.version++;
  act(() => { harness.listeners.forEach((f) => f()); });
}

export function reset(stored: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  harness.saves = 0; harness.calls = []; harness.listeners.clear();
  publish(stored, extra);
}

export function useStoreMock() {
  useSyncExternalStore((l) => { harness.listeners.add(l); return () => { harness.listeners.delete(l); }; }, () => harness.version);
  return harness.store;
}

/** Minimal @tanstack/react-router stand-in for route components rendered outside a router. */
export const routeState = { search: {} as Record<string, unknown>, params: {} as Record<string, string> };
export const routerMock = {
  createFileRoute: () => (value: Record<string, unknown>) => ({ ...value, useSearch: () => routeState.search, useParams: () => routeState.params }),
  useRouter: () => ({ navigate: async () => undefined }),
  Link: ({ children, to }: { children?: React.ReactNode; to?: string }) => <a href={to}>{children}</a>,
  useNavigate: () => () => undefined,
  useSearch: () => ({}),
  useRouterState: ({ select }: { select?: (s: unknown) => unknown } = {}) => { const s = { location: { hash: "", pathname: "/", search: {}, state: {} } }; return select ? select(s) : s; },
};

/** Fill the reason in the open Archive/Restore dialog and confirm. Returns the dialog title seen. */
export async function confirmInDialog(reason: string, confirmName: RegExp) {
  const { screen, fireEvent, within, waitFor } = await import("@testing-library/react");
  const dialog = await screen.findByRole("dialog");
  const title = within(dialog).getByRole("heading").textContent ?? "";
  const confirm = within(dialog).getByRole("button", { name: confirmName });
  if (!(confirm as HTMLButtonElement).disabled) throw new Error("Confirm should be disabled until a reason is given");
  fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: reason } });
  fireEvent.click(within(dialog).getByRole("button", { name: confirmName }));
  await waitFor(() => { if (screen.queryByRole("dialog")) throw new Error("dialog still open"); });
  return title;
}

/** The record with the archive fields removed, for byte-identity checks against the original. */
export function bare(r: unknown): unknown {
  const o = { ...(r as Record<string, unknown>) };
  for (const k of ["archivedAt", "archivedBy", "archiveReason", "archiveHistory"]) delete o[k];
  return o;
}
