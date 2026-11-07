import { describe, expect, it } from "vitest";
import { handoffGaps } from "./itr-handoff";
import type { TaxComputation } from "./taxcomp";

const c = (x: Partial<TaxComputation> = {}): TaxComputation => ({ salary: 0, houseProperty: { rent: 0, standardDeduction: 0, homeLoanInterest: 0, net: 0 }, business: { receipts: 0, expenses: 0, depreciation: 0, net: 0 }, capitalGains: { short: 0, long: 0 }, otherSources: 0, gross: 0, lossesSetOff: 0, total: 0, notes: [], ...x });
const base = { fy: "2025-26", personal: true, regime: "new" as const, profileConfirmed: true, salaryEvidence: false, credits: [], unrecordedTaxDebits: 0, docs: [], records: [], gainsMissingCost: 0, rules: [], entityName: "You", companyKind: false };
const doc = (docType: string, title: string, docDate = "2026-06-01") => ({ id: title, title, docType, filePath: "", fileName: title, mimeType: "", size: 1, docDate, amount: null, currency: "INR", merchant: null, notes: "", text: "", transactionId: null, accountId: null, loanId: null, expiresOn: null, createdAt: "2026-06-01T00:00:00Z" }) as never;
const keys = (g: { key: string }[]) => g.map((x) => x.key);

describe("accountant handoff checklist", () => {
  it("salary estimated from bank asks for Form 16; uploaded Form 16 clears it", () => {
    expect(keys(handoffGaps({ ...base, c: c({ salary: 900000 }) }))).toContain("form16");
    expect(keys(handoffGaps({ ...base, c: c({ salary: 900000 }), docs: [doc("tax_statement", "Form 16 employer")] }))).not.toContain("form16");
  });
  it("always asks for 26AS/AIS until one is in DocuRepo for the year", () => {
    expect(keys(handoffGaps({ ...base, c: c() }))).toContain("26as");
    expect(keys(handoffGaps({ ...base, c: c(), docs: [doc("tax_statement", "Form 26AS FY25-26")] }))).not.toContain("26as");
  });
  it("home-loan interest asks for the lender certificate", () => {
    expect(keys(handoffGaps({ ...base, c: c({ houseProperty: { rent: 0, standardDeduction: 0, homeLoanInterest: 150000, net: -150000 } }) }))).toContain("hl-cert");
  });
  it("sales without purchase cost are listed as missing figures, and old regime asks for deduction proofs", () => {
    const g = handoffGaps({ ...base, regime: "old", c: c(), gainsMissingCost: 2 });
    expect(keys(g)).toEqual(expect.arrayContaining(["cg", "cg-cost", "ded"]));
    expect(g.find((x) => x.key === "cg-cost")?.need).toMatch(/2 sales/);
  });
  it("carried-forward losses need last year's filed return", () => {
    expect(keys(handoffGaps({ ...base, c: c({ lossesSetOff: 50000 }) }))).toContain("prev-itr");
    expect(keys(handoffGaps({ ...base, c: c({ lossesSetOff: 50000 }), records: [{ fy: "2024-25", filedReturns: [{ form: "ITR-3", ack: "123456789", filedOn: "2025-07-30" }], lossesCarriedForward: [] }] as never }))).not.toContain("prev-itr");
  });
});
