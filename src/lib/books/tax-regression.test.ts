// Fixed worked examples for personal and company tax; any change in these figures must be deliberate.
import { describe, expect, it } from "vitest";
import { entityLiability, individualLiability } from "./tax-full";
import { fromEntities, remunerationCap, withEntityIncome, type EntityFacts } from "./from-entities";
import { profileIssues } from "./entity-tax-profile";
import type { TaxComputation } from "./taxcomp";
import type { EntityProfile } from "../entities";

const comp = (p: Partial<TaxComputation>): TaxComputation => {
  const c: TaxComputation = { salary: 0, houseProperty: { rent: 0, standardDeduction: 0, homeLoanInterest: 0, net: 0 }, business: { receipts: 0, expenses: 0, depreciation: 0, net: 0 }, capitalGains: { short: 0, long: 0 }, otherSources: 0, gross: 0, lossesSetOff: 0, total: 0, notes: [], ...p };
  const total = c.salary + c.business.net + c.otherSources + c.houseProperty.net + c.capitalGains.short + c.capitalGains.long;
  return { ...c, gross: total, total };
};
const ent = (kind: EntityProfile["kind"], id = kind): EntityProfile => ({ id, name: `${kind} co`, kind, pan: "", gstins: [], booksFrom: "2024-25" } as EntityProfile);
const paid = (p: Partial<EntityFacts["paid"]> = {}): EntityFacts["paid"] => ({ salary: 0, remuneration: 0, capitalInterest: 0, dividend: 0, loans: 0, rent: 0, interest: 0, ...p });

describe("personal tax, FY 2025-26", () => {
  it("new regime: ₹12,75,000 salary pays nil after standard deduction and s.87A rebate", () => {
    const l = individualLiability(comp({ salary: 1275000 }), "2025-26", "new", [], 0);
    expect(l.standardDeduction).toBe(75000);
    expect(l.slabTax).toBe(60000);
    expect(l.rebate).toBe(60000);
    expect(l.total).toBe(0);
  });
  it("new regime: s.87A marginal relief just above ₹12 lakh", () => {
    const l = individualLiability(comp({ otherSources: 1210000 }), "2025-26", "new", [], 0);
    expect(l.slabTax).toBe(61500);
    expect(l.rebate).toBe(51500);
    expect(l.total).toBe(10400);
  });
  it("new regime: ₹18,75,000 salary → ₹1,66,400 with 4% cess", () => {
    const l = individualLiability(comp({ salary: 1875000 }), "2025-26", "new", [], 0);
    expect(l.slabTax).toBe(160000);
    expect(l.cess).toBe(6400);
    expect(l.total).toBe(166400);
  });
  it("old regime: 80C is capped at ₹1,50,000", () => {
    const l = individualLiability(comp({ salary: 1050000 }), "2025-26", "old", [{ id: "d", section: "80C", amount: 200000, evidence: "LIC receipt" } as never], 0);
    expect(l.deductions).toBe(150000);
    expect(l.normalIncome).toBe(850000);
    expect(l.total).toBe(85800);
  });
  it("new regime ignores Chapter VI-A deductions", () => {
    const l = individualLiability(comp({ salary: 1050000 }), "2025-26", "new", [{ id: "d", section: "80C", amount: 150000, evidence: "x" } as never], 0);
    expect(l.deductions).toBe(0);
  });
  it("10% surcharge above ₹50 lakh", () => {
    const l = individualLiability(comp({ otherSources: 6000000 }), "2025-26", "new", [], 0);
    expect(l.slabTax).toBe(1380000);
    expect(l.surcharge).toBe(138000);
    expect(l.total).toBe(1578720);
  });
});

describe("company and firm tax", () => {
  it("s.115BAA: 22% + 10% surcharge + 4% cess on ₹1 crore", () => {
    expect(entityLiability(comp({ business: { receipts: 0, expenses: 0, depreciation: 0, net: 10000000 } }), "company", "115BAA", 0)!.total).toBe(2516800);
  });
  it("normal 25% option on ₹50 lakh has no surcharge", () => {
    expect(entityLiability(comp({ business: { receipts: 0, expenses: 0, depreciation: 0, net: 5000000 } }), "company", "normal25", 0)!.total).toBe(1300000);
  });
  it("firm/LLP: 30% + cess on ₹20 lakh", () => {
    expect(entityLiability(comp({ business: { receipts: 0, expenses: 0, depreciation: 0, net: 2000000 } }), "firm", undefined, 0)!.total).toBe(624000);
  });
  it("no chosen company option → no figure, never assumed", () => {
    expect(entityLiability(comp({ business: { receipts: 0, expenses: 0, depreciation: 0, net: 1000000 } }), "company", undefined, 0)).toBeNull();
  });
});

describe("business income in personal tax", () => {
  it("s.40(b) remuneration ceiling", () => {
    expect(remunerationCap(0)).toBe(300000);
    expect(remunerationCap(400000)).toBe(360000);
    expect(remunerationCap(1000000)).toBe(780000);
  });
  it("proprietorship profit counts in full as business income", () => {
    expect(fromEntities([{ entity: ent("proprietorship"), profit: 800000, paid: paid() }])).toEqual([expect.objectContaining({ head: "business", amount: 800000 })]);
  });
  it("partner: remuneration and 12% capital interest capped; profit share exempt", () => {
    const lines = fromEntities([{ entity: ent("partnership"), profit: 1000000, capital: 500000, paid: paid({ remuneration: 900000, capitalInterest: 80000 }) }]);
    const business = lines.filter((l) => l.head === "business").map((l) => l.amount).sort((a, b) => a - b);
    expect(business).toEqual([60000, 780000]);
    expect(lines.find((l) => l.head === "exempt")!.amount).toBe(1000000);
  });
  it("company profit never enters personal income; salary and dividend do", () => {
    const lines = fromEntities([{ entity: ent("company"), profit: 5000000, paid: paid({ salary: 1200000, dividend: 100000 }) }]);
    expect(lines.some((l) => l.head === "business" || l.amount === 5000000)).toBe(false);
    const c = withEntityIncome(comp({}), lines);
    expect(c.salary).toBe(1200000);
    expect(c.otherSources).toBe(100000);
    expect(c.total).toBe(1300000);
  });
  it("deemed dividend for a ≥10% shareholder only up to accumulated profits", () => {
    const at = (holdingPct: number | null, accumulatedProfits: number | null) => fromEntities([{ entity: ent("company"), profit: 0, holdingPct, accumulatedProfits, paid: paid({ loans: 500000 }) }]);
    expect(at(25, 300000)).toEqual([expect.objectContaining({ head: "otherSources", amount: 300000 })]);
    expect(at(5, 300000)).toEqual([]);
    expect(at(null, 300000)[0]!.head).toBe("flag");
    expect(at(25, null)[0]!.head).toBe("flag");
  });
});

describe("tax profile validation", () => {
  it("refuses a share above 100% or below 0%", () => {
    expect(profileIssues({ fy: "2025-26", ownershipPct: 120 }).errors).toContain("Ownership share is between 0 and 100");
    expect(profileIssues({ fy: "2025-26", ownershipPct: -1 }).errors).toHaveLength(1);
  });
  it("refuses a malformed or non-consecutive tax year", () => {
    expect(profileIssues({ fy: "2025", ownershipPct: 50 }).errors).toHaveLength(1);
    expect(profileIssues({ fy: "2025-27", ownershipPct: 50 }).errors).toHaveLength(1);
    expect(profileIssues({ fy: "2099-00", ownershipPct: 50 }).errors).toEqual([]);
  });
  it("blank or negative figures only warn, so saving stays allowed", () => {
    const r = profileIssues({ fy: "2025-26", capital: -5, accumulatedProfits: -1 });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(3);
  });
});
