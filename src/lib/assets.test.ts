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
  it("rent check never counts a deposit as rent and carries arrears and advance", () => {
    const flat: Asset = { ...car, name: "Anna Nagar flat", kind: "property", monthlyRent: 30000, tenant: "Ravi" };
    const r = rentCheck(flat, [
      { date: "2026-05-02", amount: 100000, text: "Ravi security deposit" },
      { date: "2026-05-05", amount: 20000, text: "Rent from Ravi" },
      { date: "2026-06-05", amount: 50000, text: "Ravi rent" },
    ], ["2026-05", "2026-06", "2026-07"]);
    expect(r[0]).toMatchObject({ received: 20000, deposits: 100000, balance: 10000, status: "partial" });
    expect(r[1]).toMatchObject({ balance: -10000, status: "advance" });
    expect(r[2]).toMatchObject({ received: 0, balance: 20000, status: "unpaid" });
  });
});

import { assetFollowUps as fu } from "./assets";
describe("asset follow-ups", () => {
  const base = { id: "x", name: "Laptop", kind: "computer", cost: 1, inUse: "2025-01-01", sharePct: 100, bookMethod: "slm", bookRatePct: 0 } as never;
  it("flags never checked and lease ending within 60 days", () => {
    expect(fu(base, "2026-11-04")).toEqual(["never physically checked"]);
    expect(fu({ ...(base as object), kind: "property", leaseEnd: "2026-12-04" } as never, "2026-11-04")).toEqual(["lease ends in 30 days"]);
  });
  it("checked within a year is clear; sold assets never flag", () => {
    expect(fu({ ...(base as object), lastVerified: "2026-06-01" } as never, "2026-11-04")).toEqual([]);
    expect(fu({ ...(base as object), soldOn: "2026-01-01", condition: "missing" } as never, "2026-11-04")).toEqual([]);
  });
});
