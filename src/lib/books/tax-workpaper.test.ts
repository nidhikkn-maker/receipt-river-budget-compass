import { describe, expect, it } from "vitest";
import { assumptions, computationHeads, sourceGroups, workpaperCsv } from "./tax-workpaper";
import { copyTaxYear, profileFor, removeTaxYear, upsertTaxYear } from "./entity-tax-profile";
import type { TaxComputation } from "./taxcomp";

const c: TaxComputation = { salary: 100, houseProperty: { rent: 0, standardDeduction: 0, homeLoanInterest: 0, net: 0 }, business: { receipts: 1000, expenses: 300, depreciation: 50, net: 650 }, capitalGains: { short: 0, long: 0 }, otherSources: 20, gross: 770, lossesSetOff: 0, total: 770, notes: [] };

describe("tax workpaper", () => {
  it("heads reproduce total income", () => {
    const h = Object.fromEntries(computationHeads(c));
    expect(h["Total income"]).toBe(770);
    expect(h["Business receipts"]! + h["Business expenses"]! + h["Depreciation"]!).toBe(h["Business / profession (net)"]);
  });
  it("every non-transfer entry traces to exactly one group; transfers excluded", () => {
    const g = sourceGroups([
      { id: "a", date: "2025-05-01", txnType: "income", title: "Fee", category: "x", amount: 1000 },
      { id: "b", date: "2025-04-01", txnType: "expense", title: "Rent", category: "x", amount: 300 },
      { id: "c", date: "2025-04-02", txnType: "transfer", title: "Move", category: "x", amount: 9 },
    ], () => "Bank");
    expect(g.flatMap((s) => s.entries.map((e) => e.id)).sort()).toEqual(["a", "b"]);
    expect(g.find((s) => s.group === "Income received")!.total).toBe(1000);
  });
  it("states unknown company facts instead of assuming them", () => {
    const a = assumptions({ fy: "2025-26", regime: null, ruleCount: 0, kind: "company", notes: [], liability: null, flags: [] });
    expect(a.some((x) => x.includes("No tax profile entered"))).toBe(true);
    expect(a.some((x) => x.includes("not chosen"))).toBe(true);
  });
  it("uses entered partner capital", () => {
    const a = assumptions({ fy: "2025-26", regime: "firm", ruleCount: 1, kind: "partnership", notes: [], liability: null, flags: [], profile: { id: "p", entityId: "e", fy: "2025-26", capital: 500000, ownershipPct: 50 } });
    expect(a.some((x) => x.includes("₹5,00,000"))).toBe(true);
    expect(a.some((x) => x.includes("50%"))).toBe(true);
  });
  it("csv carries one row per source entry", () => {
    const csv = workpaperCsv([{ key: "p", name: "You", kind: "personal", heads: [["Total income", 1]], tax: [["Tax", 0]], fromCompanies: [], sources: [{ group: "Expenses", total: 5, entries: [{ id: "x", date: "2025-04-01", title: "t", account: "A", amount: 5 }] }], assumptions: ["a"] }]);
    expect(csv.sources.length).toBe(2);
    expect(csv.computation.length).toBe(3);
  });
});

describe("company tax profile per year", () => {
  it("survives the saved-preferences clean-up on reload", async () => {
    const { cleanBooks } = await import("./types");
    const b = cleanBooks({ entityTaxProfiles: [{ id: "1", entityId: "e", fy: "2025-26", ownershipPct: 75 }, { id: "bad", entityId: "e", fy: "x" }] });
    expect(b.entityTaxProfiles?.map((x) => x.id)).toEqual(["1"]);
  });
  it("one entry per company and year; upsert replaces", () => {
    let l = upsertTaxYear([], { id: "1", entityId: "e", fy: "2025-26", ownershipPct: 60 });
    l = upsertTaxYear(l, { id: "2", entityId: "e", fy: "2025-26", ownershipPct: 70 });
    expect(l.length).toBe(1);
    expect(profileFor(l, "e", "2025-26")!.ownershipPct).toBe(70);
  });
  it("rejects share outside 0–100 as unknown", () => {
    expect(upsertTaxYear([], { id: "1", entityId: "e", fy: "2025-26", ownershipPct: 140 })[0]!.ownershipPct).toBeNull();
  });
  it("copies to another year and deletes", () => {
    let l = upsertTaxYear([], { id: "1", entityId: "e", fy: "2025-26", capital: 10 });
    l = copyTaxYear(l, "1", "2026-27", "2");
    expect(profileFor(l, "e", "2026-27")!.capital).toBe(10);
    expect(removeTaxYear(l, "1").length).toBe(1);
  });
});
