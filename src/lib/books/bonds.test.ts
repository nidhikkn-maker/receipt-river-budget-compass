import { expect, it } from "vitest";
import { bondPrice, type BondTerms } from "./bonds";
import type { Holding, Quote } from "./types";
const terms: BondTerms = { faceValue: 1000, couponPct: 8, lastCoupon: "2026-01-01", nextCoupon: "2026-07-01", maturity: "2027-01-01", couponsPerYear: 2, dayCount: "ACT/365", priceBasis: "percent", priceIncludesInterest: false, currency: "INR", docId: "original", sourceQuote: "Printed coupon 8%, face 1000, Jan/Jul" };
const holding: Holding = { id: "bond", name: "Bond", kind: "bond", quantity: 10, sharePct: 100, source: "Original", bond: terms };
const quote: Quote = { key: "bond", price: 102, at: "2026-04-01", provider: "Printed price", freshness: "statement", refreshedAt: "2026-04-01" };
it.each([["ACT/365", 80*90/365], ["ACT/360",20], ["ACT/ACT",40*90/181], ["30E/360",20]] as const)("%s adds independently calculated coupon accrual to a face-percent clean quote", (dayCount, expected) => {
 const result = bondPrice({ ...holding, bond: { ...terms, dayCount } }, quote, "2026-04-01");
 expect(result.accrued).toBeCloseTo(expected, 8); expect(result.unitPrice).toBeCloseTo(1020+expected, 8);
});
it("dirty quote does not add accrued interest twice", () => {
 expect(bondPrice({ ...holding, bond: { ...terms, priceIncludesInterest: true } }, quote, "2026-04-01").unitPrice).toBe(1020);
});
it("outdated coupon periods and maturity never reuse stale prices as cash", () => {
 expect(bondPrice(holding, quote, "2026-07-01").unitPrice).toBeNull();
 expect(bondPrice(holding, quote, "2027-01-01").note).toContain("Matured");
});