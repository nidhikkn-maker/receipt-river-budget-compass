import { describe, it, expect } from "vitest";
import { allocationChange } from "./market";
const snap = (date: string, allocation: Record<string, number>) => ({ date, netWorth: 0, portfolio: 0, liquid: 0, liabilities: 0, allocation });
describe("asset allocation change between snapshots", () => {
  const m = allocationChange(snap("2026-04-01", { Equity: 600000, "Mutual funds": 400000 }), snap("2026-10-01", { Equity: 600000, "Mutual funds": 600000, Gold: 300000 }));
  it("computes share points of each snapshot's own total", () => {
    const by = Object.fromEntries(m.map(x => [x.kind, x]));
    expect(by["Equity"]).toMatchObject({ change: 0, shareFrom: 60, shareTo: 40, shareChange: -20 });
    expect(by["Mutual funds"]).toMatchObject({ change: 200000, shareFrom: 40, shareTo: 40, shareChange: 0 });
    expect(by["Gold"]).toMatchObject({ from: 0, to: 300000, shareTo: 20, shareChange: 20 });
  });
  it("largest share move first", () => expect(m[0]!.kind).toBe("Equity"));
  it("empty snapshot gives zero shares, never NaN", () => {
    expect(allocationChange(snap("a", {}), snap("b", { Gold: 5 }))[0]).toMatchObject({ shareFrom: 0, shareTo: 100 });
  });
});
