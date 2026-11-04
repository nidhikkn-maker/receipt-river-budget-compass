import { describe, it, expect } from "vitest";
import { bookSchedule, taxSchedule, shareValue, rentCheck, type Asset } from "./assets";

const car: Asset = { id: "a", name: "GLS", kind: "vehicle", cost: 100000, inUse: "2025-04-01", sharePct: 100, bookMethod: "slm", bookRatePct: 10 };

describe("assets", () => {
  it("book SLM charges the same each full year", () => {
    const s = bookSchedule(car, "2026-27");
    expect(s.map((y) => y.depreciation)).toEqual([10000, 10000]);
    expect(s[1]!.closing).toBe(80000);
  });
  it("tax WDV halves the first year when used under 180 days", () => {
    const late = { ...car, inUse: "2025-12-01" };
    expect(taxSchedule(late, "2025-26")[0]!.depreciation).toBe(7500);
    expect(taxSchedule(car, "2026-27").map((y) => y.depreciation)).toEqual([15000, 12750]);
  });
  it("land is never depreciated and share applies", () => {
    const land: Asset = { ...car, kind: "property", cost: 5000000, sharePct: 50 };
    expect(taxSchedule(land, "2026-27")).toEqual([]);
    expect(shareValue(land, "2026-27")).toBe(2500000);
  });
  it("rent check sums income naming the property", () => {
    const flat: Asset = { ...car, name: "Anna Nagar flat", kind: "property", monthlyRent: 30000 };
    const r = rentCheck(flat, [{ date: "2026-05-03", amount: 30000, text: "Rent Anna Nagar flat" }], ["2026-05", "2026-06"]);
    expect(r.map((m) => m.received)).toEqual([30000, 0]);
  });
});
