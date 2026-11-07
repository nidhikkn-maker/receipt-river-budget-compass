import { describe, expect, it } from "vitest";
import { applyOverrides, clearOverride, setOverride, validateOverride } from "./price-overrides";
import type { Quote } from "./types";

const base = { key: "isin:INE002A01018", name: "Reliance", price: 2900, priceDate: "2026-11-05", source: "NSE website" };
const feed: Quote = { key: "isin:INE002A01018", price: 2800, at: "2026-11-06", provider: "NSE official closing price", freshness: "eod", refreshedAt: "" };

describe("manual price overrides", () => {
  it("requires price above zero, a non-future date and a source", () => {
    expect(validateOverride({ ...base, price: 0 }, "2026-11-06")).toMatch(/above zero/);
    expect(validateOverride({ ...base, priceDate: "2026-11-07" }, "2026-11-06")).toMatch(/future/);
    expect(validateOverride({ ...base, source: " " }, "2026-11-06")).toMatch(/came from/);
    expect(validateOverride(base, "2026-11-06")).toBeNull();
  });
  it("an active override wins over a newer feed price", () => {
    const list = setOverride([], base, "2026-11-06T10:00:00Z");
    const q = applyOverrides([feed], list);
    expect(q).toHaveLength(1);
    expect(q[0]!.price).toBe(2900);
    expect(q[0]!.freshness).toBe("manual");
  });
  it("records set, changed and cleared in order, and clearing restores the feed", () => {
    let list = setOverride([], base, "2026-11-06T10:00:00Z");
    list = setOverride(list, { ...base, price: 2950 }, "2026-11-06T11:00:00Z");
    list = clearOverride(list, base.key, "2026-11-06T12:00:00Z");
    expect(list[0]!.history.map((h) => h.action)).toEqual(["set", "changed", "cleared"]);
    expect(list[0]!.history[0]!.price).toBe(2900);
    expect(applyOverrides([feed], list)[0]!.price).toBe(2800);
  });
});
