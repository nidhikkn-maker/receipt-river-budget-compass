// R14 + D8 (app side): the real StoreProvider (src/lib/store.tsx) over a fake Supabase client. Nothing reaches Cloud.
// R14: a read refused for permission is reported as "denied" (deniedAreas / loadErrorKind / useReadState), still listed in
// loadErrors so no screen shows it as empty, and a consumer renders UnauthorizedState instead of an empty or error state.
// D8: removeDocument refuses a locked original before any row or storage call.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fail: new Map<string, { error: Record<string, unknown>; status: number }>(),
  calls: [] as string[],
  snapshot: undefined as unknown,
  rows: new Map<string, unknown[]>(),
  hold: new Map<string, Promise<void>>(),
  /** Signed-in user the fake auth reports; null = no session. */
  session: "11111111-1111-4111-8111-111111111111" as string | null,
  sessionError: false,
  /** Tables whose read rejects (the whole cloud read throws, e.g. "Failed to fetch"), as opposed to returning an error. */
  throwOn: new Set<string>(),
}));
vi.mock("@/integrations/supabase/client", () => {
  const result = (table: string) => {
    const f = h.fail.get(table);
    return f ? { data: null, error: f.error, status: f.status } : { data: table === "finance_preferences" || table === "profiles" ? null : h.rows.get(table) ?? [], error: null, status: 200 };
  };
  const settle = (table: string) => (h.hold.get(table) ?? Promise.resolve()).then(() => { if (h.throwOn.has(table)) throw new TypeError("Failed to fetch"); return result(table); });
  const builder = (table: string): unknown => new Proxy({}, {
    get: (_t, k) => k === "then" ? (ok: (v: unknown) => void, bad: (e: unknown) => void) => settle(table).then(ok, bad)
      : k === "maybeSingle" || k === "single" ? () => settle(table) : () => builder(table),
  });
  return { supabase: {
    auth: { getSession: async () => h.sessionError ? { data: { session: null }, error: { message: "Failed to fetch" } } : ({ data: { session: h.session ? { user: { id: h.session } } : null }, error: null }) },
    from: (t: string) => { h.calls.push(`from:${t}`); return builder(t); },
    rpc: async (fn: string) => { h.calls.push(`rpc:${fn}`); return { data: null, error: null }; },
    storage: { from: (b: string) => ({ remove: async (paths: string[]) => { h.calls.push(`remove:${b}:${paths.join(",")}`); return { data: paths.map((name) => ({ name })), error: null }; } }) },
  } };
});
vi.mock("./offline", () => ({
  getSnapshot: async () => h.snapshot, putSnapshot: async () => {},
  pendingEntries: async () => [], queueEntry: async () => {}, removePending: async () => {},
}));
vi.mock("./fx.functions", () => ({ saveExpense: async () => ({ ok: true }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn(), info: vi.fn() }) }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: unknown }) => children }));

import { StoreProvider, useAreaStatus, useReadState, useStore } from "./store";
import { ALL_LOAD_AREAS, areaConfirmedEmpty, areaMayPaintValues, areaReadState, areaShowsValues, areaStatus, DENIED_OFFLINE_NOTE, isDeniedRead, type AreaStatus } from "./load-state";
import { money } from "./expenses";
import { defaultPreferences } from "./preferences";
import { LOCKED_EVIDENCE_MESSAGE } from "./evidence-lock";
import { EmptyState, ErrorState, LoadingState, OfflineState, OfflineUnavailableState, UnauthorizedState } from "@/components/shell/States";
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

/** The same screen on the full R14 status: every state maps to its shared state component. */
function VaultScreen() {
  const { status, note } = useAreaStatus("documents");
  const { documents, refresh } = useStore();
  const list = <ul aria-label="documents">{documents.map((d) => <li key={d.id}>{d.title}</li>)}</ul>;
  switch (status) {
    case "loading": return <LoadingState label="Loading documents" />;
    case "offline": return note ? <><OfflineState /><p role="note">{note}</p></> : <><OfflineState />{list}</>;
    case "unavailable": return <OfflineUnavailableState what="your documents" />;
    case "denied": return <UnauthorizedState what="these documents" />;
    case "failed": return <ErrorState what="your documents" onRetry={refresh} />;
    case "empty": return <EmptyState title="No documents yet" />;
    case "ready": return list;
    default: return assertNever(status);
  }
}
function assertNever(x: never): never { throw new Error(`unhandled area status ${String(x)}`); }

/** A figures screen (balances / budget): offline-with-nothing-saved must show no ₹ figure, no "Not linked", no empty state. */
function MoneyScreen() {
  const accounts = useAreaStatus("accounts");
  const budgets = useAreaStatus("budgets");
  const s = useStore();
  const total = s.accounts.reduce((n, a) => n + a.openingBalance, 0);
  const view = (st: AreaStatus, body: () => import("react").ReactElement, empty: () => import("react").ReactElement) => {
    switch (st) {
      case "loading": return <LoadingState />;
      case "unavailable": return <OfflineUnavailableState what="these figures" />;
      case "denied": return <UnauthorizedState />;
      case "failed": return <ErrorState what="these figures" />;
      case "empty": return empty();
      case "offline": case "ready": return body();
      default: return assertNever(st);
    }
  };
  return <>
    <section aria-label="balance">{view(accounts.status, () => <p>{s.accounts.length ? money(total) : "Not linked"}</p>, () => <p>Not linked</p>)}</section>
    <section aria-label="budget">{view(budgets.status, () => <p>{money(Object.values(s.budgets).reduce<number>((n, v) => n + (v ?? 0), 0))}</p>, () => <EmptyState title="No budget yet" />)}</section>
  </>;
}

afterEach(() => { cleanup(); h.fail.clear(); h.throwOn.clear(); h.calls.length = 0; h.rows.clear(); h.hold.clear(); h.snapshot = undefined; h.session = USER; h.sessionError = false; seen.s = null; localStorage.clear(); });
const USER = "11111111-1111-4111-8111-111111111111";
/** Every documents title any render of the screen ever showed (to prove denied data never painted, even briefly). */
const painted = new Set<string>();
function Spy() { const { documents } = useStore(); for (const d of documents) painted.add(d.title); return null; }
const setOnline = (v: boolean) => Object.defineProperty(navigator, "onLine", { value: v, configurable: true });
const settleTicks = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 50)); }); };
const mount = async (screenEl: import("react").ReactElement = <DocumentsScreen />, onLine = true) => {
  setOnline(onLine);
  await act(async () => { render(<StoreProvider userId="11111111-1111-4111-8111-111111111111"><Probe />{screenEl}</StoreProvider>); });
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

const docRow = { id: "d9", title: "Insurance policy", doc_type: "other", file_path: "u/docs/p.pdf", file_name: "p.pdf", mime_type: "application/pdf", size_bytes: 10, created_at: "2026-11-01T00:00:00Z", fields: [], evidence_locked: false };
const cachedDoc = { id: "d9", title: "Insurance policy", docType: "other", filePath: "u/docs/p.pdf", fileName: "p.pdf", mimeType: "application/pdf", size: 10, fields: [], evidenceLocked: false };
const snapshot = () => ({ name: "KK", members: [], expenses: [], accounts: [], commitments: [], rawLoans: [], goals: [], budgets: {}, preferences: defaultPreferences(), valuations: [], documents: [cachedDoc] });

describe("R14: one status per area: loading, offline, failed, denied, empty (and ready)", () => {
  it("pure priority: offline > denied > failed > loading > empty/ready; offline after a denial carries a note", () => {
    const base = { settled: true, online: true, errors: [] as never[], denied: [] as never[], empty: false, hasData: true };
    expect(areaStatus({ ...base, settled: false }, "documents").status).toBe("loading");
    expect(areaStatus({ ...base, empty: true }, "documents").status).toBe("empty");
    expect(areaStatus(base, "documents").status).toBe("ready");
    expect(areaStatus({ ...base, errors: ["documents"] }, "documents").status).toBe("failed");
    expect(areaStatus({ ...base, errors: ["documents"], denied: ["documents"], empty: true }, "documents").status).toBe("denied");
    expect(areaStatus({ ...base, online: false, errors: ["documents"], denied: ["documents"] }, "documents")).toEqual({ status: "offline", note: DENIED_OFFLINE_NOTE });
    expect(areaStatus({ ...base, online: false }, "documents")).toEqual({ status: "offline", note: null });
  });

  it("loading: an area whose read has not arrived is 'loading' (never empty); then 'empty' once it arrives with nothing", async () => {
    let release = () => {};
    h.hold.set("documents", new Promise<void>((r) => { release = r; }));
    await mount(<VaultScreen />);
    expect(seen.s!.areaStatus("documents").status).toBe("loading");
    expect(seen.s!.areaStatus("accounts").status).toBe("empty");
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    await act(async () => { release(); });
    await settleTicks();
    expect(seen.s!.areaStatus("documents").status).toBe("empty");
    expect(screen.getByText("No documents yet")).toBeTruthy();
  });

  it("ready / empty: a successful read with records is 'ready', without records 'empty'", async () => {
    h.rows.set("documents", [docRow]);
    await mount(<VaultScreen />);
    expect(seen.s!.areaStatus("documents").status).toBe("ready");
    expect(seen.s!.areaStatus("goals").status).toBe("empty");
    expect(screen.getByText("Insurance policy")).toBeTruthy();
  });

  it("offline: the device copy shows under OfflineState, never as fresh", async () => {
    h.snapshot = snapshot();
    await mount(<VaultScreen />, false);
    expect(seen.s!.syncState).toBe("offline");
    expect(seen.s!.areaStatus("documents")).toEqual({ status: "offline", note: null });
    expect(screen.getByText("You're offline")).toBeTruthy();
    expect(screen.getByText("Insurance policy")).toBeTruthy();
  });

  it("failed: an outage is 'failed' with Retry; the cached record is not presented as current", async () => {
    h.snapshot = snapshot();
    h.fail.set("documents", { error: { code: "PGRST000", message: "Could not connect to the database" }, status: 503 });
    await mount(<VaultScreen />);
    expect(seen.s!.areaStatus("documents").status).toBe("failed");
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
    expect(screen.queryByText("Insurance policy")).toBeNull();
  });

  it("denied: the cached copy is flagged (status denied), never empty or ready; the screen shows UnauthorizedState only", async () => {
    h.snapshot = snapshot();
    h.fail.set("documents", { error: { code: "42501", message: "permission denied for table documents" }, status: 403 });
    await mount(<VaultScreen />);
    expect(seen.s!.areaStatus("documents").status).toBe("denied");
    expect(seen.s!.lastSyncedAt).toBeNull(); // nothing is reported as freshly synced
    expect(screen.getByText(/You don't have access to these documents/)).toBeTruthy();
    expect(screen.queryByText("Insurance policy")).toBeNull();
    expect(screen.queryByText("No documents yet")).toBeNull();
  });

  it("denied on a cold start (no device copy) is 'denied', not 'empty'", async () => {
    h.fail.set("documents", { error: { message: "new row violates row-level security policy" }, status: 403 });
    await mount(<VaultScreen />);
    expect(seen.s!.documents).toEqual([]);
    expect(seen.s!.areaStatus("documents").status).toBe("denied");
  });

  it("denied -> granted after re-auth: the next successful read clears the denial and shows records", async () => {
    h.fail.set("documents", { error: { code: "PGRST301", message: "JWT expired" }, status: 401 });
    await mount(<VaultScreen />);
    expect(seen.s!.areaStatus("documents").status).toBe("denied");
    h.fail.clear(); h.rows.set("documents", [docRow]); // signed in again
    await act(async () => { await seen.s!.refresh(); });
    await settleTicks();
    expect(seen.s!.areaStatus("documents").status).toBe("ready");
    expect(seen.s!.deniedAreas).toEqual([]);
    expect(screen.getByText("Insurance policy")).toBeTruthy();
  });

  it("denied while offline: offline wins, with a note that the last online check was refused; records stay hidden", async () => {
    h.snapshot = snapshot();
    h.fail.set("documents", { error: { code: "42501", message: "permission denied" }, status: 403 });
    await mount(<VaultScreen />);
    expect(seen.s!.areaStatus("documents").status).toBe("denied");
    setOnline(false);
    await act(async () => { window.dispatchEvent(new Event("offline")); });
    expect(seen.s!.areaStatus("documents")).toEqual({ status: "offline", note: DENIED_OFFLINE_NOTE });
    expect(screen.getByText("You're offline")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toBe(DENIED_OFFLINE_NOTE);
    expect(screen.queryByText("Insurance policy")).toBeNull();
    setOnline(true);
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(seen.s!.areaStatus("documents").status).toBe("denied"); // back online: still denied until a read succeeds
  });
});

describe("R14 (owner decisions): a denial clears the area at once and the device copy is not painted for it", () => {
  afterEach(() => painted.clear());
  const denied403 = { error: { code: "42501", message: "permission denied for table documents" }, status: 403 };

  it("permission revoked during an active session: granted -> denied clears the records from memory immediately", async () => {
    h.rows.set("documents", [docRow]);
    await mount(<VaultScreen />);
    expect(seen.s!.areaStatus("documents").status).toBe("ready");
    expect(screen.getByText("Insurance policy")).toBeTruthy();
    h.fail.set("documents", denied403);
    await act(async () => { await seen.s!.refresh(); });
    await settleTicks();
    expect(seen.s!.documents).toEqual([]);
    expect(seen.s!.areaStatus("documents").status).toBe("denied");
    expect(screen.queryByText("Insurance policy")).toBeNull();
    expect(screen.getByText(/You don't have access to these documents/)).toBeTruthy();
    // other areas are untouched
    expect(seen.s!.areaStatus("accounts").status).toBe("empty");
  });

  it("device snapshot: after a denial the next start (online or offline) never paints the cached area", async () => {
    h.snapshot = snapshot();
    h.fail.set("documents", denied403);
    await mount(<><VaultScreen /><Spy /></>);
    cleanup(); painted.clear();
    // restart offline: the snapshot still holds the record, but it is not painted; offline wins with the note
    await mount(<><VaultScreen /><Spy /></>, false);
    expect(seen.s!.areaStatus("documents")).toEqual({ status: "offline", note: DENIED_OFFLINE_NOTE });
    expect(seen.s!.documents).toEqual([]);
    expect(painted.has("Insurance policy")).toBe(false);
    cleanup(); painted.clear();
    // restart online, still denied: never painted, not even before the cloud answer
    await mount(<><VaultScreen /><Spy /></>);
    expect(seen.s!.areaStatus("documents").status).toBe("denied");
    expect(painted.has("Insurance policy")).toBe(false);
    cleanup(); painted.clear();
    // access restored: the next start reads it again and shows it
    h.fail.clear(); h.rows.set("documents", [docRow]);
    await mount(<><VaultScreen /><Spy /></>);
    expect(seen.s!.areaStatus("documents").status).toBe("ready");
    expect(screen.getByText("Insurance policy")).toBeTruthy();
    expect(localStorage.length).toBe(0);
  });

  it("anonymous / no session: every area is denied, nothing from the device copy or the cloud is shown", async () => {
    h.session = null;
    h.snapshot = snapshot();
    h.rows.set("documents", [docRow]); // what an anon read might return must not be trusted either
    await mount(<><VaultScreen /><Spy /></>);
    for (const area of ["documents", "transactions", "accounts", "settings"] as const) expect(seen.s!.areaStatus(area).status).toBe("denied");
    expect(seen.s!.documents).toEqual([]);
    expect(painted.has("Insurance policy")).toBe(false);
    expect(h.calls.filter((c) => c.startsWith("from:"))).toEqual([]); // no cloud read without a session
    expect(screen.getByText(/You don't have access/)).toBeTruthy();
  });

  it("switching to another owner/workspace: the denied owner's data never shows and the next one loads normally", async () => {
    const OTHER = "22222222-2222-4222-8222-222222222222";
    h.snapshot = snapshot();
    h.fail.set("documents", denied403);
    const view = (uid: string) => <StoreProvider userId={uid}><Probe /><VaultScreen /><Spy /></StoreProvider>;
    setOnline(true);
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(view(USER)); });
    await settleTicks();
    expect(seen.s!.areaStatus("documents").status).toBe("denied");
    painted.clear();
    h.session = OTHER; h.fail.clear(); h.snapshot = undefined;
    h.rows.set("documents", [{ ...docRow, id: "b1", title: "Other workspace lease" }]);
    await act(async () => { r.rerender(view(OTHER)); });
    await settleTicks();
    expect(seen.s!.areaStatus("documents").status).toBe("ready");
    expect(screen.getByText("Other workspace lease")).toBeTruthy();
    expect(painted.has("Insurance policy")).toBe(false);
    expect(seen.s!.deniedAreas).toEqual([]);
  });

  it("a session check that cannot complete offline (refresh failed) is not a denial: the device copy shows as offline", async () => {
    h.sessionError = true;
    h.snapshot = snapshot();
    await mount(<VaultScreen />, false);
    expect(seen.s!.areaStatus("documents")).toEqual({ status: "offline", note: null });
    expect(screen.getByText("Insurance policy")).toBeTruthy();
  });
});

describe("R14: offline with nothing loaded is 'unavailable', never cached, empty or ready data", () => {
  it("pure: every combination of online, settled, errors, denied, empty and hasData follows the documented priority", () => {
    const bools = [false, true];
    let n = 0;
    for (const online of bools) for (const settled of bools) for (const failed of bools) for (const denied of bools) for (const empty of bools) for (const hasData of bools) {
      const got = areaStatus({ online, settled, empty, hasData, errors: failed || denied ? ["documents"] : [], denied: denied ? ["documents"] : [] }, "documents");
      const want: AreaStatus = !online ? (denied || hasData ? "offline" : "unavailable") : denied ? "denied" : failed ? "failed" : !settled ? "loading" : empty ? "empty" : "ready";
      expect(got, JSON.stringify({ online, settled, failed, denied, empty, hasData })).toEqual({ status: want, note: !online && denied ? DENIED_OFFLINE_NOTE : null });
      // other areas' errors / denials never change this area's status
      expect(areaStatus({ online, settled, empty, hasData, errors: ["goals"], denied: ["goals"] }, "documents").status)
        .toBe(!online ? (hasData ? "offline" : "unavailable") : !settled ? "loading" : empty ? "empty" : "ready");
      n++;
    }
    expect(n).toBe(64);
    // only states whose values may be shown say so; unavailable and denied-offline never do
    expect(areaShowsValues({ status: "unavailable", note: null })).toBe(false);
    expect(areaShowsValues({ status: "offline", note: DENIED_OFFLINE_NOTE })).toBe(false);
    expect(areaShowsValues({ status: "offline", note: null })).toBe(true);
    for (const st of ["loading", "denied", "failed"] as const) expect(areaShowsValues({ status: st, note: null })).toBe(false);
    for (const st of ["empty", "ready"] as const) expect(areaShowsValues({ status: st, note: null })).toBe(true);
  });

  it("store: a first start offline with no device copy gives 'unavailable' for every area, and the screen shows no records or empty state", async () => {
    await mount(<VaultScreen />, false);
    expect(seen.s!.syncState).toBe("offline");
    for (const area of ALL_LOAD_AREAS) expect(seen.s!.areaStatus(area), area).toEqual({ status: "unavailable", note: null });
    expect(screen.getByText(/No copy of your documents is saved on this device/)).toBeTruthy();
    expect(screen.queryByText("No documents yet")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    expect(h.calls.filter((c) => c.startsWith("from:"))).toEqual([]);
  });

  it("store: offline with a device copy is still 'offline' for every area, with the cached values", async () => {
    h.snapshot = snapshot();
    await mount(<VaultScreen />, false);
    for (const area of ALL_LOAD_AREAS) expect(seen.s!.areaStatus(area), area).toEqual({ status: "offline", note: null });
    expect(seen.s!.documents.map((d) => d.title)).toEqual(["Insurance policy"]);
    expect(screen.getByText("Insurance policy")).toBeTruthy();
  });

  it("store: a device copy with a remembered denial keeps the denied-offline note for that area and 'offline' for the rest", async () => {
    h.snapshot = snapshot();
    localStorage.setItem(`ledgerline.deniedAreas.${USER}`, JSON.stringify(["documents"]));
    await mount(<VaultScreen />, false);
    expect(seen.s!.areaStatus("documents")).toEqual({ status: "offline", note: DENIED_OFFLINE_NOTE });
    expect(seen.s!.areaStatus("accounts")).toEqual({ status: "offline", note: null });
    expect(screen.queryByText("Insurance policy")).toBeNull();
  });

  it("store: going offline after only some reads arrived: arrived areas are 'offline', the rest 'unavailable'", async () => {
    let release = () => {};
    h.hold.set("documents", new Promise<void>((r) => { release = r; }));
    await mount(<VaultScreen />);
    expect(seen.s!.areaStatus("documents").status).toBe("loading");
    setOnline(false);
    await act(async () => { window.dispatchEvent(new Event("offline")); });
    expect(seen.s!.areaStatus("documents")).toEqual({ status: "unavailable", note: null });
    expect(seen.s!.areaStatus("accounts")).toEqual({ status: "offline", note: null });
    expect(screen.queryByText("No documents yet")).toBeNull();
    await act(async () => { release(); });
    await settleTicks();
    expect(seen.s!.areaStatus("documents")).toEqual({ status: "offline", note: null }); // the read did arrive
  });

  it("store: a failed read adds no data: offline afterwards is 'unavailable', not cached empties", async () => {
    h.fail.set("documents", { error: { code: "PGRST000", message: "Could not connect to the database" }, status: 503 });
    await mount(<VaultScreen />);
    expect(seen.s!.areaStatus("documents").status).toBe("failed");
    setOnline(false);
    await act(async () => { window.dispatchEvent(new Event("offline")); });
    expect(seen.s!.areaStatus("documents")).toEqual({ status: "unavailable", note: null });
    expect(seen.s!.areaStatus("goals")).toEqual({ status: "offline", note: null });
  });

  it("screen: balance and budget figures offline with nothing saved show no ₹ figure, no 'Not linked' and no empty state", async () => {
    await mount(<MoneyScreen />, false);
    expect(document.body.textContent).not.toMatch(/₹/);
    expect(screen.queryByText("Not linked")).toBeNull();
    expect(screen.queryByText("No budget yet")).toBeNull();
    expect(screen.getAllByText(/No copy of these figures is saved on this device/)).toHaveLength(2);
  });

  it("screen: the same screen offline with a device copy shows the cached figures under 'offline'", async () => {
    h.snapshot = { ...snapshot(), accounts: [{ id: "a1", name: "Savings", kind: "bank", openingBalance: 1500, archived: false, details: {} }], budgets: { Food: 4000 } };
    await mount(<MoneyScreen />, false);
    expect(screen.getByText(money(1500))).toBeTruthy();
    expect(screen.getByText(money(4000))).toBeTruthy();
    expect(screen.queryByText(/No copy of these figures/)).toBeNull();
  });
});

describe("R14b: the device copy is not cloud-confirmed; a whole-read failure is its own signal (readFailure)", () => {
  const outage = { error: { code: "PGRST000", message: "Could not connect to the database" }, status: 503 };
  const emptySnapshot = () => ({ ...snapshot(), documents: [] });

  it("pure: every combination including cloudConfirmed and readFailed follows the documented priority", () => {
    const bools = [false, true];
    let n = 0;
    for (const online of bools) for (const settled of bools) for (const failed of bools) for (const denied of bools) for (const empty of bools) for (const hasData of bools)
    for (const cloudConfirmed of bools) for (const readFailed of bools) {
      const input = { online, settled, empty, hasData, cloudConfirmed, readFailed };
      const got = areaStatus({ ...input, errors: failed || denied ? ["documents"] : [], denied: denied ? ["documents"] : [] }, "documents");
      const want: AreaStatus = !online ? (denied || hasData ? "offline" : "unavailable")
        : denied ? "denied" : failed ? "failed" : !cloudConfirmed ? (readFailed ? "failed" : "loading") : !settled ? "loading" : empty ? "empty" : "ready";
      const cached = online && !denied && !cloudConfirmed && hasData;
      expect(got, JSON.stringify({ ...input, failed, denied })).toEqual(cached ? { status: want, note: null, cached: true } : { status: want, note: !online && denied ? DENIED_OFFLINE_NOTE : null });
      // other areas' errors / denials never change this area's status
      expect(areaStatus({ ...input, errors: ["goals"], denied: ["goals"] }, "documents").status)
        .toBe(!online ? (hasData ? "offline" : "unavailable") : !cloudConfirmed ? (readFailed ? "failed" : "loading") : !settled ? "loading" : empty ? "empty" : "ready");
      // absence is claimed only from a confirmed empty read; an unconfirmed device copy never claims it
      if (online && !cloudConfirmed) expect(areaConfirmedEmpty(got)).toBe(false);
      n++;
    }
    expect(n).toBe(256);
    expect(areaMayPaintValues({ status: "loading", note: null, cached: true })).toBe(true);
    expect(areaMayPaintValues({ status: "failed", note: null, cached: true })).toBe(true);
    expect(areaMayPaintValues({ status: "loading", note: null })).toBe(false);
    expect(areaShowsValues({ status: "loading", note: null, cached: true })).toBe(false);
  });

  it("online, device copy painted, cloud pending: unconfirmed areas are 'loading' (cached), never 'ready'/'empty'", async () => {
    let release = () => {};
    h.snapshot = emptySnapshot();
    h.hold.set("accounts", new Promise<void>((r) => { release = r; })); // first batch pending
    h.hold.set("documents", new Promise<void>(() => {}));
    await mount(<VaultScreen />);
    for (const area of ALL_LOAD_AREAS) expect(seen.s!.areaStatus(area), area).toEqual({ status: "loading", note: null, cached: true });
    expect(seen.s!.confirmedAreas).toEqual([]);
    expect(seen.s!.readFailure).toBeNull();
    expect(screen.queryByText("No documents yet")).toBeNull(); // the empty device copy makes no absence claim
    expect(seen.s!.name).toBe("KK"); // the device copy is still painted (startup speed)
    await act(async () => { release(); });
    await settleTicks();
    expect(seen.s!.areaStatus("accounts").status).toBe("empty"); // confirmed by its cloud read
    expect(seen.s!.areaStatus("documents")).toEqual({ status: "loading", note: null, cached: true }); // still pending
  });

  it("online, device copy painted, whole read throws: unconfirmed areas read 'failed' with Retry and readFailure is set", async () => {
    h.snapshot = snapshot();
    h.throwOn.add("accounts");
    await mount(<VaultScreen />);
    const s = seen.s!;
    expect(s.readFailure).toMatchObject({ kind: "failed", message: "Failed to fetch" });
    expect(typeof s.readFailure!.at).toBe("string");
    expect(s.loadErrors).toEqual([]); // nothing per-area failed; the status still says failed
    for (const area of ALL_LOAD_AREAS) expect(s.areaStatus(area), area).toEqual({ status: "failed", note: null, cached: true });
    expect(s.documents.map((d) => d.title)).toEqual(["Insurance policy"]); // cached values stay in memory behind `cached`
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
    expect(screen.queryByText("No documents yet")).toBeNull();
    // the next successful read clears it and confirms every area
    h.throwOn.clear(); h.rows.set("documents", [docRow]);
    await act(async () => { await seen.s!.refresh(); });
    await settleTicks();
    expect(seen.s!.readFailure).toBeNull();
    expect(seen.s!.areaStatus("documents").status).toBe("ready");
  });

  it("whole read throws after the essential batch: confirmed areas keep their status, the rest read 'failed'", async () => {
    h.snapshot = snapshot();
    h.throwOn.add("goals");
    await mount(<VaultScreen />);
    expect(seen.s!.readFailure).not.toBeNull();
    expect(seen.s!.areaStatus("accounts").status).toBe("empty");
    for (const area of ["goals", "valuations", "documents", "family"] as const) expect(seen.s!.areaStatus(area).status, area).toBe("failed");
  });

  it("cold start (no device copy), whole read throws: 'failed', never a 'loading' that never ends or an empty state", async () => {
    h.throwOn.add("accounts");
    await mount(<VaultScreen />);
    for (const area of ALL_LOAD_AREAS) expect(seen.s!.areaStatus(area), area).toEqual({ status: "failed", note: null });
    expect(seen.s!.syncState).toBe("error");
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
    expect(screen.queryByText("No documents yet")).toBeNull();
  });

  it("online, only goals fails: goals is 'failed', readFailure is null and every other area is ready/empty", async () => {
    h.snapshot = snapshot();
    h.rows.set("documents", [docRow]);
    h.fail.set("goals", outage);
    await mount(<VaultScreen />);
    const s = seen.s!;
    expect(s.syncState).toBe("error"); // overloaded: some area failed — not a whole-read failure
    expect(s.readFailure).toBeNull();
    expect(s.loadErrors).toEqual(["goals"]);
    expect(s.areaStatus("goals").status).toBe("failed");
    expect(s.areaStatus("documents")).toEqual({ status: "ready", note: null });
    for (const area of ALL_LOAD_AREAS.filter((a) => a !== "goals" && a !== "documents")) expect(["ready", "empty"], area).toContain(s.areaStatus(area).status);
    expect(screen.getByText("Insurance policy")).toBeTruthy();
  });

  it("online, cloud read succeeds: every area is cloud-confirmed and ready/empty", async () => {
    h.snapshot = snapshot();
    h.rows.set("documents", [docRow]);
    await mount(<VaultScreen />);
    const s = seen.s!;
    expect([...s.confirmedAreas].sort()).toEqual([...ALL_LOAD_AREAS].sort());
    expect(s.readFailure).toBeNull();
    expect(s.syncState).toBe("synced");
    for (const area of ALL_LOAD_AREAS) expect(["ready", "empty"], area).toContain(s.areaStatus(area).status);
    expect(s.areaStatus("documents")).toEqual({ status: "ready", note: null });
  });

  it("offline is unchanged: 'offline' with a device copy, 'unavailable' without; nothing is cloud-confirmed", async () => {
    h.snapshot = snapshot();
    await mount(<VaultScreen />, false);
    for (const area of ALL_LOAD_AREAS) expect(seen.s!.areaStatus(area), area).toEqual({ status: "offline", note: null });
    expect(seen.s!.confirmedAreas).toEqual([]);
    expect(seen.s!.readFailure).toBeNull();
    cleanup(); h.snapshot = undefined;
    await mount(<VaultScreen />, false);
    for (const area of ALL_LOAD_AREAS) expect(seen.s!.areaStatus(area), area).toEqual({ status: "unavailable", note: null });
    expect(seen.s!.confirmedAreas).toEqual([]);
  });
});
