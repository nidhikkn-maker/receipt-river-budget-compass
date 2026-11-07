import { describe, it, expect } from "vitest";
import { proposeFundHoldings } from "./fund-statement";
const read = { amc: "Bank of India MF", folioLast4: "6875", asOf: "2026-09-20", holdings: [{ scheme: "Bank of India Multicap Fund - Regular Plan - Growth", isin: "INF761K01FU4", schemeCode: "MLRGG", units: 50502.525, nav: 19.8, navDate: "2026-09-18", cost: 1000000, value: 999950 }] };
describe("fund statement", () => {
  it("proposes holding with statement units and NAV", () => {
    const [l] = proposeFundHoldings(read, [], () => "new", "BOI SOA");
    expect(l!.holding!.quantity).toBe(50502.525); expect(l!.quote!.price).toBe(19.8); expect(l!.quote!.freshness).toBe("statement"); expect(l!.valueCheck).toBeNull();
  });
  it("same ISIN updates the existing holding, not a duplicate", () => {
    const [l] = proposeFundHoldings(read, [{ id: "h1", kind: "mutual_fund", name: "BOI Multicap", isin: "INF761K01FU4", quantity: 100, sharePct: 50, source: "x" }], () => "new", "BOI SOA");
    expect(l!.holding!.id).toBe("h1"); expect(l!.previousUnits).toBe(100); expect(l!.holding!.sharePct).toBe(50);
  });
  it("missing units proposes nothing", () => {
    const [l] = proposeFundHoldings({ ...read, holdings: [{ ...read.holdings[0]!, units: null }] }, [], () => "n", "t");
    expect(l!.holding).toBeNull(); expect(l!.missing).toContain("units");
  });
  it("flags printed value that disagrees with units × NAV", () => {
    const [l] = proposeFundHoldings({ ...read, holdings: [{ ...read.holdings[0]!, value: 900000 }] }, [], () => "n", "t");
    expect(l!.valueCheck).not.toBeNull();
  });
});
