import { describe, expect, it } from "vitest";
import { dayShortcut, recentFirst, relevantSections } from "./entry-form";

describe("entry form presentation rules", () => {
  it("lists recently used categories first without dropping any category", () => {
    const r = recentFirst(["Groceries", "Dining", "Fuel", "Rent"], [
      { date: "2026-10-01", category: "Fuel" }, { date: "2026-10-20", category: "Dining" }, { date: "2026-09-01", category: "Deleted" },
    ], (p) => p.category);
    expect(r.recent).toEqual(["Dining", "Fuel"]);
    expect([...r.recent, ...r.rest].sort()).toEqual(["Dining", "Fuel", "Groceries", "Rent"]);
  });
  it("hides business and travel groups for a personal grocery expense", () => {
    const s = relevantSections({ txnType: "expense", scope: "personal", split: false, currency: "INR", baseCurrency: "INR", onTrip: false });
    expect(s.business).toBe(false); expect(s.travel).toBe(false); expect(s.fx).toBe(false);
  });
  it("shows business fields for business expenses and exchange details for foreign currency", () => {
    const s = relevantSections({ txnType: "expense", scope: "business", split: false, currency: "USD", baseCurrency: "INR", onTrip: true });
    expect(s.business).toBe(true); expect(s.fx).toBe(true); expect(s.travel).toBe(true);
  });
  it("gives yesterday as the previous calendar day", () => {
    expect(dayShortcut(1, new Date(2026, 10, 1, 0, 10))).toBe("2026-10-31");
  });
});
