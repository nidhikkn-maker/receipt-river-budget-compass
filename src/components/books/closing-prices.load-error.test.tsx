// P0-004 sweep (useClosingPrices): a failed read of saved closing prices must show "Couldn't load … Nothing has been
// deleted" with Retry, never "not fetched yet" as if no prices existed; saving a valuation waits until prices load.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { defaultPreferences } from "@/lib/preferences";
import { emptyBooks } from "@/lib/books/types";
import { reset } from "../records-archive/harness";

const net = vi.hoisted(() => ({ fail: true, calls: 0 }));
vi.mock("@/lib/store", async () => ({ useStore: (await import("../records-archive/harness")).useStoreMock }));
vi.mock("@tanstack/react-router", async () => (await import("../records-archive/harness")).routerMock);
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@/lib/mutual-funds.functions", () => ({ getFundNav: vi.fn() }));
vi.mock("@/lib/investments/holdings-store", () => ({ loadDemat: async () => [] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const q: Record<string, unknown> = { then: (done: (x: unknown) => unknown) => { if (table === "market_quotes") net.calls++; return Promise.resolve(done(net.fail ? { data: null, error: { message: "network" } } : table === "job_state" ? { data: { status: "ok", last_success: "2026-11-09T12:30:00Z", reason: null }, error: null } : { data: [], error: null })); } };
  for (const n of ["select", "in", "order", "limit", "eq", "maybeSingle"]) q[n] = () => q; return q; } } }));
import { MarketPanel } from "./MarketPanel";

const holding = { id: "infy", name: "Infosys", kind: "equity", isin: "INE009A01021", exchange: "NSE", quantity: 10, sharePct: 100, costBasis: 1000, source: "entered by you" };
beforeEach(() => { net.fail = true; net.calls = 0; reset({ ...(defaultPreferences() as unknown as Record<string, unknown>), books: { ...emptyBooks(), holdings: [holding] } }); });
afterEach(cleanup);

describe("P0-004 saved closing prices read", () => {
  it("shows a load error with Retry instead of 'not fetched yet', blocks saving a valuation, and recovers on Retry", async () => {
    render(<MarketPanel />);
    fireEvent.click(screen.getByText("Investments & net worth"));
    expect(await screen.findByText("Couldn't load the saved closing prices.")).toBeInTheDocument();
    expect(screen.queryByText(/not fetched yet/)).toBeNull();
    expect(screen.getByRole("button", { name: "Save today's valuation" })).toBeDisabled();
    net.fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/Closing prices: last saved 2026-11-09 12:30 UTC/)).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load the saved closing prices.")).toBeNull();
    expect(screen.getByRole("button", { name: "Save today's valuation" })).toBeEnabled();
    expect(net.calls).toBe(2);
  });
});
