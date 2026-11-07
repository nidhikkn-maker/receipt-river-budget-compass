// Phase 1 acceptance pack: income tax, GST set-off, return files, opening balance sheet and frozen years.
import { describe, expect, it } from "vitest";
import { entityLiability, individualLiability, itrComputationJson, suggestItrForm, chapterVIA } from "./tax-full";
import { gstSetOff, gstPayable } from "./gst";
import { openingBalanceSheet } from "./fy";
import { closableYears, closeYear, periodBlocker, reopenPeriod } from "./periods";
import type { TaxComputation } from "./taxcomp";
import type { FyRecord, GstInvoice } from "./types";

const comp = (p: Partial<TaxComputation> & { short?: number; long?: number }): TaxComputation => {
  const salary = p.salary ?? 0, short = p.short ?? 0, long = p.long ?? 0, biz = p.business?.net ?? 0;
  const gross = salary + short + long + biz;
  return { salary, houseProperty: { rent: 0, standardDeduction: 0, homeLoanInterest: 0, net: 0 }, business: p.business ?? { receipts: 0, expenses: 0, depreciation: 0, net: 0 }, capitalGains: { short, long }, otherSources: 0, gross, lossesSetOff: 0, total: gross, notes: [] };
};

describe("income tax — individuals", () => {
  it("new regime FY 2025-26: ₹12,75,000 salary is fully rebated", () => {
    expect(individualLiability(comp({ salary: 1275000 }), "2025-26", "new", [], 0).total).toBe(0);
  });
  it("new regime FY 2025-26: ₹13,00,000 salary gets marginal relief → ₹26,000", () => {
    expect(individualLiability(comp({ salary: 1300000 }), "2025-26", "new", [], 0).total).toBe(26000);
  });
  it("old regime: 80C capped at ₹1,50,000, ₹10,00,000 salary → ₹75,400", () => {
    const l = individualLiability(comp({ salary: 1000000 }), "2025-26", "old", [{ id: "1", entityId: "personal", fy: "2025-26", section: "80C", amount: 200000, evidence: "LIC" }], 0);
    expect(l.deductions).toBe(150000);
    expect(l.total).toBe(75400);
  });
  it("new regime ignores deductions", () => {
    const l = individualLiability(comp({ salary: 1000000 }), "2025-26", "new", [{ id: "1", entityId: "p", fy: "2025-26", section: "80C", amount: 150000, evidence: "PPF" }], 0);
    expect(l.deductions).toBe(0);
  });
  it("long-term listed gains: ₹1,25,000 exempt, rest at 12.5%", () => {
    expect(individualLiability(comp({ salary: 2075000, long: 225000 }), "2025-26", "new", [], 0).total).toBe(221000);
  });
  it("taxes already paid give the balance or refund", () => {
    const l = individualLiability(comp({ salary: 1300000 }), "2025-26", "new", [], 30000);
    expect(l.balance).toBe(-4000);
  });
  it("deduction caps per section", () => {
    expect(chapterVIA([{ id: "a", entityId: "p", fy: "x", section: "80TTA", amount: 25000, evidence: "bank" }]).total).toBe(10000);
  });
});

describe("income tax — companies and firms", () => {
  it("section 115BAA on ₹1 crore → ₹25,16,800", () => {
    expect(entityLiability(comp({ business: { receipts: 1e7, expenses: 0, depreciation: 0, net: 1e7 } }), "company", "115BAA", 0)!.total).toBe(2516800);
  });
  it("no company option chosen → no figure", () => {
    expect(entityLiability(comp({}), "company", undefined, 0)).toBeNull();
  });
  it("suggests the ITR form from income heads", () => {
    expect(suggestItrForm("individual", comp({ salary: 500000 }))).toBe("ITR-1");
    expect(suggestItrForm("individual", comp({ salary: 500000, short: 1000 }))).toBe("ITR-2");
    expect(suggestItrForm("company", comp({}))).toBe("ITR-6");
  });
  it("ITR computation file carries the totals in return part names", () => {
    const c = comp({ salary: 1300000 });
    const j = itrComputationJson({ fy: "2025-26", pan: "ABCPK1234D", name: "K", form: "ITR-1", c, l: individualLiability(c, "2025-26", "new", [], 0) });
    expect(j.AssessmentYear).toBe("2026-27");
    expect(j["PartB-TTI"].GrossTaxLiability).toBe(26000);
  });
});

describe("GST set-off", () => {
  it("uses IGST credit first, never CGST against SGST", () => {
    const r = gstSetOff({ igst: 1000, cgst: 500, sgst: 500, cess: 0 }, { igst: 1200, cgst: 100, sgst: 0, cess: 0 });
    expect(r.cash).toEqual({ igst: 0, cgst: 200, sgst: 500, cess: 0 });
    expect(r.cashTotal).toBe(700);
  });
  it("month working from invoices", () => {
    const inv = (kind: "sales" | "purchase", igst: number): GstInvoice => ({ id: kind + igst, gstin: "G", kind, number: "1", date: "2025-05-10", party: "x", partyGstin: "P", taxable: igst * 5, igst, cgst: 0, sgst: 0, cess: 0 });
    expect(gstPayable([inv("sales", 900), inv("purchase", 400)], "G", "2025-05").cashTotal).toBe(500);
  });
});

describe("opening balance sheet", () => {
  const rec = { id: "r", entityId: "e", fy: "2024-25", audited: { bank: 100, fixedAssets: 1000, accumulatedDepreciation: 200, capitalReserves: 600, loans: 300 }, schedules: [], qualifications: [], filedReturns: [], lossesCarriedForward: [], docIds: [] } as unknown as FyRecord;
  it("balances when assets equal capital and liabilities", () => {
    const bs = openingBalanceSheet(rec);
    expect([bs.totalAssets, bs.totalLiabilities, bs.balanced]).toEqual([900, 900, true]);
  });
  it("shows the gap when it doesn't", () => {
    expect(openingBalanceSheet({ ...rec, audited: { ...rec.audited, loans: 250 } }).difference).toBe(50);
  });
});

describe("frozen years", () => {
  it("a year that hasn't ended can't be frozen", () => {
    expect(() => closeYear([], [], "2026-27", "", "2026-11-05", "x")).toThrow(/not ended/);
  });
  it("freezing blocks entries inside the year, reopening needs a reason", () => {
    const r = closeYear([], [], "2025-26", "", "2026-11-05", "p1");
    expect(periodBlocker(r.periods, "2026-03-31")).toMatch(/closed period/);
    expect(periodBlocker(r.periods, "2026-04-01")).toBeNull();
    expect(() => reopenPeriod(r.periods, r.log, "p1", "no", "2026-11-05")).toThrow();
    expect(closableYears(r.periods, "2026-11-05", 2)).toEqual(["2024-25"]);
  });
});
