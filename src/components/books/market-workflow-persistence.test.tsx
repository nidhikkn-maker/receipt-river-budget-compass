// @vitest-environment node
// Initialise DOM before React's event feature detection; retain Node Blob for PGlite.
vi.hoisted(async () => {
 const { JSDOM } = await import("jsdom");
 const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
 Object.defineProperty(dom.window.File.prototype, "arrayBuffer", { value: function(this: File) { return new Promise<ArrayBuffer>((resolve, reject) => { const r = new dom.window.FileReader(); r.onload = () => resolve(r.result as ArrayBuffer); r.onerror = reject; r.readAsArrayBuffer(this); }); } });
 for (const key of ["window", "document", "HTMLElement", "File", "FileReader"] as const) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "window" ? dom.window : key === "document" ? dom.window.document : dom.window[key] });
});
import { useSyncExternalStore } from "react";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { emptyBooks } from "@/lib/books/types";
import type { Quote, AlertSettings } from "@/lib/books/types";
import type { DematWithHoldings } from "@/lib/investments/holdings-store";
const state = vi.hoisted(() => ({ store: {} as Record<string, unknown>, version: 0, listeners: new Set<() => void>(), nav: vi.fn(), demat: [] as DematWithHoldings[] }));
vi.mock("@/lib/store", () => ({ useStore: () => { useSyncExternalStore(listener => { state.listeners.add(listener); return () => state.listeners.delete(listener); }, () => state.version); return state.store; } }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => state.nav }));
vi.mock("@/lib/mutual-funds.functions", () => ({ getFundNav: vi.fn() }));
vi.mock("@/lib/investments/holdings-store", () => ({ loadDemat: async () => state.demat }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => { const q: Record<string, unknown> = { then: (done: (x: unknown) => unknown) => Promise.resolve(done({ data: [], error: null })) }; for (const name of ["select", "in", "order", "limit", "eq", "maybeSingle"]) q[name] = () => q; return q; } } }));
vi.mock("@tanstack/react-router", () => ({ useRouterState: () => "", Link: ({ to, hash, children, ...props }: { to: string; hash?: string; children: React.ReactNode }) => <a href={to + (hash ? "#" + hash : "")} {...props}>{children}</a> }));
import { MarketPanel } from "./MarketPanel";
import { NetWorthCard } from "./NetWorthCard";
const owner = "00000000-0000-0000-0000-000000000001", other = "00000000-0000-0000-0000-000000000002";
afterEach(() => { cleanup(); state.listeners.clear(); state.demat = []; vi.clearAllMocks(); });
async function setup(options: { quotes?: Quote[]; lastPortfolio?: number; alerts?: Partial<AlertSettings>; quantity?: number } = {}) {
 const books = { ...emptyBooks(), holdings: [{ id: "fund", name: "Controlled Fund", kind: "mutual_fund" as const, schemeCode: "12345", quantity: 10, sharePct: 100, costBasis: 800, source: "retained source", exchange: "NSE" as const }], quotes: [{ key: "amfi:12345", price: 100, at: "2026-11-06", provider: "Controlled NAV source", freshness: "nav" as const, refreshedAt: "2026-11-06T12:00:00Z", failedAt: undefined as string | undefined }] };
 const preferences = { books, assets: [{ id: "land", name: "Factory land", kind: "property", cost: 2000, inUse: "2026-04-01", sharePct: 100, bookMethod: "slm", bookRatePct: 0 }], entities: [] };
 if (options.quotes) {
  preferences.books.quotes = options.quotes as typeof books.quotes;
  if (options.quotes.some(q => ["live", "delayed", "eod"].includes(q.freshness))) preferences.books.holdings = [{ ...books.holdings[0], kind: "etf", schemeCode: "12345" }] as unknown as typeof books.holdings;
 }
 if (options.lastPortfolio !== undefined) preferences.books.snapshots = [{ date: "2026-11-01", netWorth: 4300, portfolio: options.lastPortfolio, liquid: 1000, liabilities: 300, allocation: {} }];
 if (options.alerts) preferences.books.alerts = { ...books.alerts, ...options.alerts };
 if (options.quantity !== undefined) preferences.books.holdings = [{ ...books.holdings[0], quantity: options.quantity, isin: "INE009A01021" }] as typeof books.holdings;
 const accounts = [{ id: "bank", name: "Bank", kind: "savings", openingBalance: 1000, archived: false }, { id: "invest", name: "Deposit", kind: "fixed_deposit", openingBalance: 200, archived: false }, { id: "other", name: "Other asset", kind: "other_asset", openingBalance: 500, archived: false }, { id: "debt", name: "Card", kind: "credit_card", openingBalance: 300, archived: false }];
 const db = new PGlite();
 await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 CREATE TABLE finance_preferences(owner_id uuid PRIMARY KEY,data jsonb NOT NULL,revision bigint NOT NULL DEFAULT 0,updated_at timestamptz);
 CREATE FUNCTION bump() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.revision:=OLD.revision+1; RETURN NEW; END $$;
 CREATE TRIGGER bump BEFORE UPDATE ON finance_preferences FOR EACH ROW EXECUTE FUNCTION bump();
 CREATE TABLE controlled_source_records(owner_id uuid PRIMARY KEY,data jsonb);`);
 const prefPolicy = readFileSync("drizzle/migrations/0007_preferences_and_receipt_details.sql", "utf8").split("\n").find(x => x.startsWith('CREATE POLICY "Own finance preferences"'));
 if (!prefPolicy) throw new Error("Production owner policy absent");
 await db.exec(`GRANT SELECT ON finance_preferences TO authenticated; ALTER TABLE finance_preferences ENABLE ROW LEVEL SECURITY; ${prefPolicy}`);
 await db.exec(readFileSync("drizzle/migrations/0080_reviewed_preference_saves.sql", "utf8"));
 await db.exec(readFileSync("drizzle/migrations/0082_advance_review_sections.sql", "utf8"));
 await db.query("INSERT INTO finance_preferences(owner_id,data) VALUES($1,$2::jsonb)", [owner, JSON.stringify(preferences)]);
 await db.query("INSERT INTO controlled_source_records VALUES($1,$2::jsonb)", [owner, JSON.stringify({ accounts, transactions: [], demat: [] })]);
 await db.query("SELECT set_config('test.uid',$1,false)", [owner]); await db.exec("SET ROLE authenticated");
 const reload = async () => {
  const current = (await db.query<{ data: typeof preferences; revision: number }>("SELECT data,revision::int FROM finance_preferences")).rows[0];
  if (!current) throw new Error("Missing owner preferences");
  state.store = { userId: owner, preferences: current.data, accounts, transactions: [], valuations: [], loans: [], documents: [], savePreferences: async (next: typeof preferences) => {
   await db.query("SELECT save_reviewed_preferences($1,$2::jsonb,$3,true)", [crypto.randomUUID(), JSON.stringify(next), current.revision]); await reload();
  } };
  state.version++; act(() => { state.listeners.forEach(f => f()); }); return current;
 };
 await reload();
 await db.exec("RESET ROLE");
 const sourceBefore = (await db.query<{ data: unknown }>("SELECT data FROM controlled_source_records")).rows;
 await db.exec("SET ROLE authenticated");
 return { db, reload, sourceBefore, preferences, accounts };
}
it("actual price refresh → installed reviewed-save RPC → net-worth/Home → reload preserves costs and creates no ledger records", async () => {
 const h = await setup();
 try {
  state.nav.mockResolvedValue({ ok: true, quote: { nav: 120, date: "2026-11-07" } });
  const view = render(<><NetWorthCard /><MarketPanel /></>);
  fireEvent.click(view.getByText("Investments & net worth"));
  await waitFor(() => expect(view.getByRole("button", { name: "Refresh NAVs" })).toBeVisible());
  expect(view.getByRole("link", { name: "Open investments" })).toHaveAttribute("href", "/wealth#investments");
  expect(view.getByRole("link", { name: "Open financial position" })).toHaveAttribute("href", "/wealth");
  fireEvent.click(view.getByRole("button", { name: "Refresh NAVs" }));
  await waitFor(() => expect(view.container.textContent).toContain("120"));
  const row = await h.reload();
  expect(row.data.books.quotes).toHaveLength(1);
  expect(row.data.books.quotes[0]).toMatchObject({ price: 120, at: "2026-11-07", freshness: "nav", provider: "AMFI via mfapi.in" });
  expect(row.data.books.holdings).toEqual(h.preferences.books.holdings);
  expect(row.data.assets).toEqual(h.preferences.assets);
  expect(view.container.textContent).toContain("NSE");
  expect(view.container.textContent).toContain("AMFI via mfapi.in");
  expect(view.container.textContent).toContain("2026-11-07");
  // Both actual consumers read the same owner snapshot; repeat refresh replaces, not appends.
  fireEvent.click(view.getByRole("button", { name: "Refresh NAVs" }));
  await waitFor(() => expect(state.nav).toHaveBeenCalledTimes(2));
  await waitFor(async () => expect((await h.reload()).data.books.quotes).toHaveLength(1));
  view.unmount();
  const reopened = render(<NetWorthCard />);
  expect(reopened.container.textContent).toContain("4,600");
  expect(reopened.container.textContent).toContain("1,400");
  expect(reopened.container.textContent).toContain("1,000");
  expect(reopened.container.textContent).toContain("300");
  await h.db.exec("RESET ROLE");
  expect((await h.db.query("SELECT data FROM controlled_source_records")).rows).toEqual(h.sourceBefore);
  await h.db.exec("SET ROLE authenticated"); await h.db.query("SELECT set_config('test.uid',$1,false)", [other]);
  expect((await h.db.query("SELECT * FROM finance_preferences")).rows).toEqual([]);
  expect((await h.db.query("SELECT * FROM preference_approvals")).rows).toEqual([]);
  await h.db.exec("RESET ROLE; SET ROLE anon");
  await expect(h.db.query("SELECT * FROM finance_preferences")).rejects.toThrow(/permission denied/);
 } finally { await h.db.close(); }
}, 30000);
it.each([true, false])("missing-price setting=%s survives owner save/reload and controls the actual rendered exception", async (enabled) => {
 const h = await setup({ quotes: [], alerts: { missingPrices: enabled } });
 try {
  const view = render(<MarketPanel />); fireEvent.click(view.getByText("Investments & net worth"));
  await waitFor(() => expect(view.container.querySelectorAll("ul li").length).toBe(enabled ? 1 : 0));
  fireEvent.click(view.getByText("Alert settings"));
  fireEvent.click(view.getByLabelText("Missing prices"));
  await waitFor(async () => expect((await h.reload()).data.books.alerts.missingPrices).toBe(!enabled));
  await waitFor(() => expect(view.container.querySelectorAll("ul li").length).toBe(enabled ? 0 : 1));
  view.unmount(); const reopened = render(<MarketPanel />); fireEvent.click(reopened.getByText("Investments & net worth"));
  await waitFor(() => expect(reopened.container.querySelectorAll("ul li").length).toBe(enabled ? 0 : 1));
 } finally { await h.db.close(); }
}, 30000);
it.each([7, 9])("saved NAV staleness threshold %s days drives the actual exception without changing price", async (threshold) => {
 const date = new Date(Date.now() - 8 * 864e5).toISOString();
 const h = await setup({ quotes: [{ key: "amfi:12345", price: 100, at: date, provider: "Retained NAV", freshness: "nav", refreshedAt: date }], alerts: { staleNavDays: threshold } });
 try {
  const view = render(<MarketPanel />); fireEvent.click(view.getByText("Investments & net worth"));
  await waitFor(() => expect(view.container.querySelectorAll("ul li").length).toBe(threshold === 7 ? 1 : 0));
  expect((await h.reload()).data.books.quotes[0]?.price).toBe(100);
 } finally { await h.db.close(); }
}, 30000);
it.each([12, 13])("quantity %s compares against pooled same-ISIN Demat totals and configured alert persists", async (quantity) => {
 const h = await setup({ quantity, alerts: { quantityMismatch: true, missingPrices: false } });
 state.demat = [5, 7].map((q, i) => ({ id: `demat-${i}`, broker: "Controlled", dpId: "D", clientId: `C${i}`, holder: "Owner", holdings: [{ id: `holding-${i}`, isin: "INE009A01021", name: "Controlled security", quantity: q, asOf: "2026-11-01", statementValue: null, lots: [], gains: [], sources: [] }] }));
 try {
  const view = render(<MarketPanel />); fireEvent.click(view.getByText("Investments & net worth"));
  await waitFor(() => expect(view.container.textContent).toContain("Demat holdings (2)"));
  expect(view.container.textContent?.includes("held vs 12 on the latest statement")).toBe(quantity === 13);
  fireEvent.click(view.getByText("Alert settings")); fireEvent.click(view.getByLabelText("Quantity differences"));
  await waitFor(async () => expect((await h.reload()).data.books.alerts.quantityMismatch).toBe(false));
  expect(view.container.textContent).not.toContain("held vs 12 on the latest statement");
 } finally { await h.db.close(); }
}, 30000);
it.each([true, false])("unusual-value threshold enabled=%s compares owned cost, not full acquisition cost", async (enabled) => {
 const h = await setup({ alerts: { unusualValuationPct: enabled ? 20 : 0 } });
 try {
  const view = render(<MarketPanel />); fireEvent.click(view.getByText("Investments & net worth"));
  await waitFor(() => expect(view.container.textContent?.includes("value is 25% from cost")).toBe(enabled));
  expect((await h.reload()).data.books.holdings[0]?.costBasis).toBe(800);
 } finally { await h.db.close(); }
}, 30000);
it.each(["live", "delayed", "eod", "nav", "manual", "statement"] as const)("persisted %s quote displays its exact provenance and last-success facts without rewriting acquisition costs", async (freshness) => {
 const h = await setup({ quotes: [{ key: "amfi:12345", price: 110, at: "2026-11-06T10:00:00Z", provider: "Controlled verified source", freshness, refreshedAt: "2026-11-06T11:00:00Z" }] });
 try {
  const view = render(<MarketPanel />); fireEvent.click(view.getByText("Investments & net worth"));
  await waitFor(() => expect(view.container.textContent).toContain("Controlled verified source"));
  expect(view.container.textContent).toContain("110");
  expect(view.container.textContent).toContain("2026-11-06");
  const row = await h.reload();
  expect(row.data.books.quotes[0]?.refreshedAt).toBe("2026-11-06T11:00:00Z");
  expect(row.data.books.holdings[0]?.costBasis).toBe(800);
 } finally { await h.db.close(); }
}, 30000);
it("persisted Home snapshot shows contribution-adjusted movement and missing-price quality from the actual shared hook", async () => {
 const h = await setup({ lastPortfolio: 900 });
 try {
  const view = render(<NetWorthCard />);
  await waitFor(() => expect(view.container.textContent).toContain("+₹300.00 since 2026-11-01"));
  expect(view.container.textContent).toContain("Updated from records");
  const row = await h.reload();
  await h.db.query("SELECT save_reviewed_preferences($1,$2::jsonb,$3,true)", [crypto.randomUUID(), JSON.stringify({ ...row.data, books: { ...row.data.books, quotes: [] } }), row.revision]);
  await h.reload();
  await waitFor(() => expect(view.container.textContent).toContain("without a price (left out, not zero)"));
  expect(view.container.textContent).toContain("₹200.00");
 } finally { await h.db.close(); }
}, 30000);
it("failed NAV refresh preserves last successful price/refresh and displays stale valuation after owner reload", async () => {
 const h = await setup();
 try {
  state.nav.mockRejectedValue(new Error("Controlled provider outage"));
  const view = render(<MarketPanel />); fireEvent.click(view.getByText("Investments & net worth"));
  fireEvent.click(view.getByRole("button", { name: "Refresh NAVs" }));
  await waitFor(async () => expect((await h.reload()).data.books.quotes[0]?.failedAt).toBeTruthy());
  const row = await h.reload();
  expect(row.data.books.quotes[0]).toMatchObject({ price: 100, refreshedAt: "2026-11-06T12:00:00Z" });
  expect(row.data.books.holdings[0]?.costBasis).toBe(800);
  await waitFor(() => expect(view.container.textContent).toContain("Stale"));
  expect(view.container.textContent).toContain("Controlled NAV source");
 } finally { await h.db.close(); }
}, 30000);
