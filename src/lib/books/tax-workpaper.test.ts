import { describe, expect, it } from "vitest";
import { assumptions, computationHeads, sourceGroups, workpaperCsv } from "./tax-workpaper";
import { copyTaxYear, dropEntityYears, mergeEntityYears, profileFor, removeTaxYear, upsertTaxYear } from "./entity-tax-profile";
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
    const csv = workpaperCsv([{ key: "p", name: "You", kind: "personal", heads: [["Total income", 1]], tax: [["Tax", 0]], taxTotal: 0, fromCompanies: [], sources: [{ group: "Expenses", total: 5, entries: [{ id: "x", date: "2025-04-01", title: "t", account: "A", amount: 5 }] }], assumptions: ["a"] }]);
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
  it("merge moves years to the target without overwriting its own; delete drops them", () => {
    const l = [{ id: "a", entityId: "x", fy: "2024-25", capital: 1 }, { id: "b", entityId: "x", fy: "2025-26", capital: 2 }, { id: "c", entityId: "y", fy: "2025-26", capital: 3 }];
    const m = mergeEntityYears(l, "x", "y");
    expect(m.filter((v) => v.entityId === "y").map((v) => [v.fy, v.capital]).sort()).toEqual([["2024-25", 1], ["2025-26", 3]]);
    expect(dropEntityYears(l, "x").map((v) => v.id)).toEqual(["c"]);
  });
});

describe("field provenance sheet", () => {
  const docs = [
    { id: "d1", title: "PAN card", fields: [
      { label: "PAN", value: "ABCDE1234F", page: 1, status: "confirmed" },
      { label: "Legal name", value: "Acme Private Limited", originalValue: "Acme Pvt Ltd", page: 1, status: "corrected" },
    ] },
    { id: "d2", title: "Empty scan", fields: [] },
  ];
  const links = [
    { docId: "d1", kind: "entity", targetId: "e1" },
    { docId: "d2", kind: "entity", targetId: "e1" },
    { docId: "d1", kind: "entity", targetId: "e2" },
  ];
  it("lists each linked document's fields with printed originals for corrections", async () => {
    const { provenanceCsv } = await import("./tax-workpaper");
    const rows = provenanceCsv([{ key: "e1", name: "Acme" }], links, docs);
    expect(rows[0]).toEqual(["Taxpayer", "Document", "Field", "Saved value", "Printed original", "Where", "Status"]);
    expect(rows).toContainEqual(["Acme", "PAN card", "PAN", "ABCDE1234F", "", "page 1", "confirmed"]);
    expect(rows).toContainEqual(["Acme", "PAN card", "Legal name", "Acme Private Limited", "Acme Pvt Ltd", "page 1", "corrected"]);
    expect(rows).toContainEqual(["Acme", "Empty scan", "(no fields read)", "", "", "", ""]);
  });
  it("scopes rows to the taxpayer and skips the personal section", async () => {
    const { provenanceCsv } = await import("./tax-workpaper");
    const rows = provenanceCsv([{ key: "personal", name: "You" }, { key: "e2", name: "Beta" }], links, docs);
    expect(rows.filter((r) => r[0] === "You")).toEqual([]);
    expect(rows.filter((r) => r[0] === "Beta").every((r) => r[1] === "PAN card")).toBe(true);
    expect(rows.some((r) => r[1] === "Empty scan")).toBe(false);
  });
});

describe("record provenance", () => {
  it("returns linked documents with corrected fields keeping the printed value", async () => {
    const { recordProvenance } = await import("./docrepo");
    const docs = [
      { id: "d1", title: "Lease", docType: "lease_agreement", fields: [{ label: "Monthly rent", value: "25000", originalValue: "23000", page: 2, status: "corrected", confidence: "high" }] },
      { id: "d9", title: "Unrelated", docType: "other", fields: [] },
    ];
    const out = recordProvenance("l1", [{ docId: "d1", kind: "lease", targetId: "l1", label: "t" }], docs as never);
    expect(out).toHaveLength(1);
    expect(out[0]?.fields[0]).toEqual(expect.objectContaining({ label: "Monthly rent", value: "25000", printed: "23000", where: "page 2", status: "corrected" }));
  });
});
