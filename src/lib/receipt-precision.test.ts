// KK decision (11 Nov 2026): a read bill keeps the exact source amount, currency and every visible decimal as
// evidence; amounts finer than the currency's minor unit are flagged for review and are never posted as a
// silently rounded figure. Display may format, but stored evidence is never changed.
import { describe, expect, it } from "vitest";
import { ExtractedReceiptSchema, ReceiptDetailsSchema, currencyMinorUnits, postingPrecisionError, receiptItemTotalError, receiptPrecisionFlags, receiptReviewCheck } from "./receipt-reading";
import { buildReceiptAudit, receiptCorrectionLines } from "./receipt-audit";

const reading = (amount: number, currency: string, extra: Record<string, unknown> = {}) => JSON.stringify({
  title: "Bill", merchant: "Shop", date: "2026-11-11", amount, subtotal: null, tax: null, tip: null, round_off: null, charges: [], tax_parts: [],
  confidence: { merchant: "high", date: "high", total: "high" }, items: [], text: `TOTAL ${currency} ${amount}`, currency, payment_method: null,
  card_network: null, card_last_four: null, description: null, category: null, scope: null, ...extra,
});

describe("₹1234.567 seen on a source", () => {
  const read = ExtractedReceiptSchema.parse(JSON.parse(reading(1234.567, "INR")));
  it("keeps 1234.567 as the read evidence, never 1234.57", () => {
    expect(read.amount).toBe(1234.567);
    expect(String(read.amount)).toBe("1234.567");
    expect(ReceiptDetailsSchema.parse({ audit: { read: { merchant: "Shop", date: "2026-11-11", amount: read.amount!, currency: "INR" }, corrected: {}, confirmedAt: "t" } }).audit?.read.amount).toBe(1234.567);
  });
  it("flags it for review with the digits as read", () => {
    const check = receiptReviewCheck(read.amount!, {}, "INR");
    expect(check.needed).toBe(true);
    expect(check.precision).toEqual([expect.objectContaining({ field: "total", read: "1234.567", places: 3, allowed: 2 })]);
    expect(check.precision[0]!.message).toMatch(/1234\.567/);
  });
  it("refuses to post it until the owner enters a paise amount", () => {
    expect(postingPrecisionError(1234.567, "INR")).toMatch(/1234\.567.*review/i);
    expect(postingPrecisionError(1234.57, "INR")).toBeNull();
  });
  it("fails on 000ac2d2: the owner's change from 1234.567 to 1234.57 is recorded as a correction", () => {
    const audit = buildReceiptAudit({ merchant: "Shop", date: "2026-11-11", amount: 1234.567, currency: "INR" }, { merchant: "Shop", date: "2026-11-11", amount: 1234.57, currency: "INR" }, "t");
    expect(audit.read.amount).toBe(1234.567);
    expect(audit.corrected).toEqual({ amount: 1234.57 });
    expect(receiptCorrectionLines(audit)).toEqual(["amount: 1234.567 → 1234.57"]);
  });
});

describe("exact paise stays exact", () => {
  it("₹1234.56 and ₹1234.50 need no precision review and post as read", () => {
    for (const amount of [1234.56, 1234.5]) {
      expect(receiptPrecisionFlags(amount, { subtotal: amount, items: [{ name: "Item", quantity: 1, amount }] }, "INR")).toEqual([]);
      expect(postingPrecisionError(amount, "INR")).toBeNull();
      expect(receiptReviewCheck(amount, {}, "INR").needed).toBe(false);
    }
    expect(ExtractedReceiptSchema.parse(JSON.parse(reading(1234.5, "INR"))).amount).toBe(1234.5);
  });
  it("binary noise from on-screen arithmetic is not mistaken for a source decimal", () => {
    expect(postingPrecisionError(0.1 + 0.2, "INR")).toBeNull();
    expect(receiptPrecisionFlags(0.1 + 0.2, {}, "INR")).toEqual([]);
  });
});

describe("₹0.005", () => {
  it("is flagged wherever it appears and cannot post", () => {
    const flags = receiptPrecisionFlags(10.005, { subtotal: 10, tax: 0.005, charges: [{ amount: 0.005 }], taxParts: [{ amount: 0.005 }], roundOff: -0.005, items: [{ name: "Mint", quantity: 1, amount: 0.005 }] }, "INR");
    expect(flags.map((f) => [f.field, f.read])).toEqual([["total", "10.005"], ["tax", "0.005"], ["roundOff", "-0.005"], ["charges.0", "0.005"], ["taxParts.0", "0.005"], ["items.0", "0.005"]]);
    expect(postingPrecisionError(0.005, "INR")).not.toBeNull();
  });
});

describe("multi-currency", () => {
  it("keeps source currency and every decimal for each currency's own minor unit", () => {
    expect([currencyMinorUnits("INR"), currencyMinorUnits("usd"), currencyMinorUnits("JPY"), currencyMinorUnits("KWD"), currencyMinorUnits(undefined)]).toEqual([2, 2, 0, 3, 2]);
    const usd = ExtractedReceiptSchema.parse(JSON.parse(reading(12.345, "USD")));
    expect([usd.amount, usd.currency]).toEqual([12.345, "USD"]);
    expect(receiptPrecisionFlags(12.345, {}, "USD")).toHaveLength(1);
    expect(receiptPrecisionFlags(1234.5, {}, "JPY")).toEqual([expect.objectContaining({ read: "1234.5", allowed: 0 })]);
    expect(receiptPrecisionFlags(1.234, {}, "KWD")).toEqual([]);
  });
  it("a three-decimal currency amount is kept as evidence but cannot post into two-decimal storage", () => {
    expect(postingPrecisionError(1.234, "KWD")).toMatch(/KWD/);
    expect(postingPrecisionError(1.23, "KWD")).toBeNull();
  });
  it("a JPY amount with a stray fraction is flagged for review but stays postable (stored records are unchanged)", () => {
    expect(postingPrecisionError(1234.5, "JPY")).toBeNull();
  });
});

describe("line-item sum vs invoice total", () => {
  it("surfaces the discrepancy and leaves every read figure untouched", () => {
    const details = { subtotal: 1234.5, tax: 0, items: [{ name: "A", quantity: 1, amount: 1000 }, { name: "B", quantity: 1, amount: 234.56 }] };
    const before = JSON.stringify(details);
    expect(receiptItemTotalError(1234.5, details, "USD")).toBe("Receipt items add up to 1234.56, but the subtotal is 1234.50. Check for a missing or misread line before saving.");
    expect(receiptReviewCheck(1234.5, details, "USD").needed).toBe(true);
    expect(JSON.stringify(details)).toBe(before);
  });
  it("sub-paise item lines that would round onto the subtotal are still flagged", () => {
    const details = { subtotal: 1234.57, items: [{ name: "A", quantity: 1, amount: 1234.567 }] };
    expect(receiptItemTotalError(1234.57, details, "USD")).toBeNull();
    expect(receiptReviewCheck(1234.57, details, "USD")).toMatchObject({ needed: true, precision: [expect.objectContaining({ field: "items.0", read: "1234.567" })] });
  });
});
