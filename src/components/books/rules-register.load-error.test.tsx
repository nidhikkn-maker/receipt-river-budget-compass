// P0-004 sweep (TaxCentre regulatory changes): a failed read of detected changes must show "Couldn't load … Nothing has
// been deleted" with Retry, never "not run yet" as if nothing had been found. Before the fix the error was swallowed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { reset } from "../records-archive/harness";

const net = vi.hoisted(() => ({ fail: true, calls: 0 }));
vi.mock("@/lib/store", async () => ({ useStore: (await import("../records-archive/harness")).useStoreMock }));
vi.mock("@tanstack/react-router", async () => (await import("../records-archive/harness")).routerMock);
vi.mock("@/lib/investments/holdings-store", () => ({ loadDemat: async () => [] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const q: Record<string, unknown> = { then: (done: (x: unknown) => unknown) => { net.calls++; return Promise.resolve(done(net.fail ? { data: null, error: { message: "network" } } : table === "job_state" ? { data: { status: "ok", last_success: "2026-11-08T00:00:00Z", reason: null }, error: null } : { data: [], error: null })); } };
  for (const n of ["select", "in", "order", "limit", "eq", "maybeSingle"]) q[n] = () => q; return q; } } }));
import { RulesRegister } from "./TaxCentre";

beforeEach(() => { net.fail = true; net.calls = 0; reset({}); });
afterEach(cleanup);

describe("P0-004 regulatory changes read", () => {
  it("shows a load error with Retry instead of 'not run yet', and recovers on Retry", async () => {
    render(<RulesRegister />);
    expect(await screen.findByText("Couldn't load the latest changes found on official pages.")).toBeInTheDocument();
    expect(screen.queryByText(/not run yet/)).toBeNull();
    net.fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/Checked weekly: last 2026-11-08/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
