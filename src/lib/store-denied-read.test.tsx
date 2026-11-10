// R14 + D8 (app side): the real StoreProvider (src/lib/store.tsx) over a fake Supabase client. Nothing reaches Cloud.
// R14: a read refused for permission is reported as "denied" (deniedAreas / loadErrorKind / useReadState), still listed in
// loadErrors so no screen shows it as empty, and a consumer renders UnauthorizedState instead of an empty or error state.
// D8: removeDocument refuses a locked original before any row or storage call.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fail: new Map<string, { error: Record<string, unknown>; status: number }>(),
  calls: [] as string[],
}));
vi.mock("@/integrations/supabase/client", () => {
  const result = (table: string) => {
    const f = h.fail.get(table);
    return f ? { data: null, error: f.error, status: f.status } : { data: table === "finance_preferences" || table === "profiles" ? null : [], error: null, status: 200 };
  };
  const builder = (table: string): unknown => new Proxy({}, {
    get: (_t, k) => k === "then" ? (ok: (v: unknown) => void, bad: (e: unknown) => void) => Promise.resolve(result(table)).then(ok, bad)
      : k === "maybeSingle" || k === "single" ? () => Promise.resolve(result(table)) : () => builder(table),
  });
  return { supabase: {
    from: (t: string) => { h.calls.push(`from:${t}`); return builder(t); },
    rpc: async (fn: string) => { h.calls.push(`rpc:${fn}`); return { data: null, error: null }; },
    storage: { from: (b: string) => ({ remove: async (paths: string[]) => { h.calls.push(`remove:${b}:${paths.join(",")}`); return { data: paths.map((name) => ({ name })), error: null }; } }) },
  } };
});
vi.mock("./offline", () => ({
  getSnapshot: async () => undefined, putSnapshot: async () => {},
  pendingEntries: async () => [], queueEntry: async () => {}, removePending: async () => {},
}));
vi.mock("./fx.functions", () => ({ saveExpense: async () => ({ ok: true }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn(), info: vi.fn() }) }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: unknown }) => children }));

import { StoreProvider, useReadState, useStore } from "./store";
import { areaReadState, isDeniedRead } from "./load-state";
import { LOCKED_EVIDENCE_MESSAGE } from "./evidence-lock";
import { EmptyState, ErrorState, UnauthorizedState } from "@/components/shell/States";
import type { VaultDoc } from "./documents";

type Seen = ReturnType<typeof useStore>;
const seen: { s: Seen | null } = { s: null };
function Probe() { seen.s = useStore(); return null; }
/** A typical records screen: denied -> UnauthorizedState, failed -> ErrorState, ok + nothing -> EmptyState. */
function DocumentsScreen() {
  const state = useReadState("documents");
  const { documents } = useStore();
  if (state === "denied") return <UnauthorizedState what="these documents" />;
  if (state === "failed") return <ErrorState what="your documents" />;
  return documents.length ? <ul>{documents.map((d) => <li key={d.id}>{d.title}</li>)}</ul> : <EmptyState title="No documents yet" />;
}

afterEach(() => { cleanup(); h.fail.clear(); h.calls.length = 0; seen.s = null; });
const mount = async () => {
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  await act(async () => { render(<StoreProvider userId="11111111-1111-4111-8111-111111111111"><Probe /><DocumentsScreen /></StoreProvider>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  return seen.s!;
};

describe("R14: permission-refused reads are a 'denied' state, never empty data", () => {
  it("classifies RLS / grant / 401 / 403 / locked-session errors as denied and outages as failed", () => {
    expect(isDeniedRead({ code: "42501", message: "permission denied for table documents" })).toBe(true);
    expect(isDeniedRead({ code: "PGRST301", message: "JWT expired" })).toBe(true);
    expect(isDeniedRead({ message: "new row violates row-level security policy" })).toBe(true);
    expect(isDeniedRead({ code: "", message: "Forbidden" }, 403)).toBe(true);
    expect(isDeniedRead({ code: "", message: "Unauthorized" }, 401)).toBe(true);
    expect(isDeniedRead({ code: "SESSION_LOCKED", message: "locked" })).toBe(true);
    expect(isDeniedRead({ code: "PGRST000", message: "Could not connect to the database" }, 503)).toBe(false);
    expect(isDeniedRead(null, 403)).toBe(false);
    expect(areaReadState(["documents", "goals"], ["documents"], "documents")).toBe("denied");
    expect(areaReadState(["documents", "goals"], ["documents"], "goals")).toBe("failed");
    expect(areaReadState([], [], "goals")).toBe("ok");
  });

  it("a denied documents read is reported as denied (and in loadErrors) and the screen renders UnauthorizedState", async () => {
    h.fail.set("documents", { error: { code: "42501", message: "permission denied for table documents" }, status: 403 });
    const s = await mount();
    expect(s.deniedAreas).toEqual(["documents"]);
    expect(s.loadErrors).toContain("documents");
    expect(s.loadErrorKind("documents")).toBe("denied");
    expect(s.loadErrorKind("accounts")).toBeNull();
    expect(s.syncState).toBe("error");
    expect(screen.getByRole("alert").textContent).toMatch(/You don't have access to these documents/);
    expect(screen.queryByText("No documents yet")).toBeNull();
  });

  it("an ordinary outage stays 'failed' (ErrorState), not denied, exactly as before", async () => {
    h.fail.set("documents", { error: { code: "PGRST000", message: "Could not connect to the database" }, status: 503 });
    const s = await mount();
    expect(s.deniedAreas).toEqual([]);
    expect(s.loadErrors).toEqual(["documents"]);
    expect(s.loadErrorKind("documents")).toBe("failed");
    expect(screen.queryByText(/You don't have access/)).toBeNull();
    expect(screen.queryByText("No documents yet")).toBeNull();
  });

  it("a denied ledger read (cold start full query) is denied too; a successful retry clears it", async () => {
    h.fail.set("expenses", { error: { code: "PGRST301", message: "JWT expired" }, status: 401 });
    let s = await mount();
    expect(s.deniedAreas).toEqual(["transactions"]);
    h.fail.clear();
    await act(async () => { await seen.s!.refresh(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    s = seen.s!;
    expect(s.deniedAreas).toEqual([]);
    expect(s.loadErrors).toEqual([]);
    expect(screen.getByText("No documents yet")).toBeTruthy();
  });
});

describe("D8: removeDocument refuses a locked original before any row or storage call", () => {
  const base = { id: "d1", title: "Invoice", docType: "other", filePath: "11111111-1111-4111-8111-111111111111/docs/inv.pdf", fileName: "inv.pdf", mimeType: "application/pdf", size: 10, notes: "pending-receipt", transactionId: null, fields: [] } as unknown as VaultDoc;

  it("locked: clear message, no rpc, no row delete, no storage remove", async () => {
    const s = await mount();
    h.calls.length = 0;
    await expect(s.removeDocument({ ...base, evidenceLocked: true })).rejects.toThrow(LOCKED_EVIDENCE_MESSAGE);
    expect(h.calls).toEqual([]);
  });

  it("unlocked staging copy: cleared through the P9 path, then the file is removed", async () => {
    const s = await mount();
    h.calls.length = 0;
    await act(async () => { await s.removeDocument({ ...base, evidenceLocked: false }); });
    expect(h.calls.slice(0, 2)).toEqual(["rpc:discard_used_pending_document", `remove:receipts:${base.filePath}`]);
  });
});
