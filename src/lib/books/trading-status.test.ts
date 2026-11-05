import { describe, it, expect } from "vitest";
import { valueHolding } from "./market";
const h = { id: "1", kind: "etf" as const, name: "X", isin: "INE000000001", exchange: "NSE" as const, quantity: 10, sharePct: 100, source: "s" };
const q = (tradingStatus?: "suspended" | "delisted") => ({ key: "", price: 100, at: "2026-11-04T10:00:00Z", provider: "NSE", freshness: "eod" as const, refreshedAt: "2026-11-04T12:00:00Z", tradingStatus });
const a = { staleNavDays: 3 } as never;
const now = new Date("2026-11-04T13:00:00Z");
const run = (s?: "suspended" | "delisted") => { const v0 = valueHolding(h as never, [], undefined, now, a); return valueHolding(h as never, [{ ...q(s), key: v0.key! }], undefined, now, a); };
describe("trading status", () => {
  it("active values normally", () => { expect(run().value).toBe(1000); });
  it("suspended keeps last price but marks stale", () => { const v = run("suspended"); expect(v.value).toBe(1000); expect(v.stale).toBe(true); expect(v.note).toMatch(/suspended/); });
  it("delisted is not valued", () => { expect(run("delisted").value).toBeNull(); });
});
describe("broker cash", () => {
  it("counts the rupee amount without a price", () => {
    const v = valueHolding({ id: "c", kind: "broker_cash", name: "ICICI Direct ledger", quantity: 25000, sharePct: 100, source: "statement" } as never, [], undefined, now, a);
    expect(v.value).toBe(25000);
  });
});
