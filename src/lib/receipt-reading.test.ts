import { describe, expect, it } from "vitest";
import { ExtractedReceiptSchema, ReceiptDetailsSchema, receiptConfidence, receiptRoundOff, receiptRoundOffFor, receiptBreakdownError, receiptItemConfidence, receiptItemReviewReasons, receiptItemsToReview, receiptItemTotalError, receiptReviewCheck, receiptReviewSignature, type ReceiptAmounts } from "./receipt-reading";
import { validateExpense, type ExpenseInput } from "./expenses";

const read = { title: "Cafe", merchant: "Cafe", date: "2026-11-02", amount: 432.10, subtotal: 360, tax: 32.10, tip: 40, round_off: null, charges: [], tax_parts: [], confidence: { merchant: "high", date: "low", total: "medium" }, items: [], text: "Cafe", currency: "INR", payment_method: null, description: null, category: "Food and beverages", scope: "personal" };
describe("receipt reading", () => {
  it("preserves separate item name and amount confidence in extracted and saved metadata", () => {
    const item = { name: "Dinner", quantity: 2, amount: 360, section: null, confidence: { name: "high", amount: "low" } };
    expect(ExtractedReceiptSchema.parse({ ...read, items: [item] }).items[0]?.confidence).toEqual({ name: "high", amount: "low" });
    expect(ReceiptDetailsSchema.parse({ items: [item] }).items?.[0]?.confidence).toEqual({ name: "high", amount: "low" });
  });
  it("keeps older item certainty unknown instead of manufacturing high confidence", () => {
    expect(receiptItemConfidence({ name: "Dinner", amount: 360 })).toEqual({ name: "unknown", amount: "unknown" });
  });
  it("never labels blank item names or invalid amounts as high confidence", () => {
    expect(receiptItemConfidence({ name: " ", amount: NaN, confidence: { name: "high", amount: "high" } })).toEqual({ name: "unknown", amount: "unknown" });
  });
  it("preserves tax, tip and field certainty through the real server metadata validator", () => {
    const details = { tax: 32.10, tip: 40, confidence: { merchant: "high", date: "low", total: "medium" } };
    expect(ReceiptDetailsSchema.parse(details)).toEqual(details);
  });
  it("accepts old receipts that have no tip or certainty metadata", () => {
    expect(ReceiptDetailsSchema.parse({ tax: null, items: [] })).toEqual({ tax: null, items: [] });
  });
  it("extracts explicit tax and tip without changing the total", () => {
    const parsed = ExtractedReceiptSchema.parse(read);
    expect(parsed.tax).toBe(32.10);
    expect(parsed.tip).toBe(40);
    expect(parsed.amount).toBe(432.10);
  });
  it("keeps absent tax and tip unknown rather than inventing zero", () => {
    const parsed = ExtractedReceiptSchema.parse({ ...read, tax: null, tip: null });
    expect(parsed.tax).toBeNull(); expect(parsed.tip).toBeNull();
  });
  it("shows independent certainty for merchant, date and total", () => {
    expect(receiptConfidence(ExtractedReceiptSchema.parse(read))).toEqual({ merchant: "high", date: "low", total: "medium" });
  });
  it("never labels missing extracted values as high confidence", () => {
    expect(receiptConfidence({ merchant: null, date: null, amount: null, confidence: { merchant: "high", date: "high", total: "high" } })).toEqual({ merchant: "unknown", date: "unknown", total: "unknown" });
  });
  it("does not manufacture certainty for older reader results", () => {
    expect(receiptConfidence({ merchant: "Cafe", date: "2026-11-02", amount: 432.10 })).toEqual({ merchant: "unknown", date: "unknown", total: "unknown" });
  });
  it("rejects a tax and tip breakdown exceeding the paid total", () => {
    expect(receiptBreakdownError(100, { tax: 70, tip: 40 })).not.toBeNull();
    expect(receiptBreakdownError(432.10, { tax: 32.10, tip: 40 })).toBeNull();
  });
  it("rejects negative and non-finite breakdowns", () => {
    expect(receiptBreakdownError(100, { tip: -1 })).not.toBeNull();
    expect(receiptBreakdownError(100, { tax: NaN })).not.toBeNull();
  });
  it("save validation preserves total and checks breakdown without summing it again", () => {
    const input: ExpenseInput = { title: "Cafe", amount: 432.10, currency: "INR", date: "2026-11-02", category: "Food and beverages", scope: "personal", merchant: "Cafe", paymentMethod: "cash", description: "", memberId: null, splits: [], receiptDetails: { tax: 32.10, tip: 40 } };
    expect(() => validateExpense(input)).not.toThrow();
    expect(input.amount).toBe(432.10);
    expect(() => validateExpense({ ...input, receiptDetails: { tax: 400, tip: 40 } })).toThrow();
  });
  it("compares subtotal plus tax and tip exactly at currency-cent precision", () => {
    expect(receiptBreakdownError(432.10, { subtotal: 360, tax: 32.10, tip: 40 })).toBeNull();
    expect(receiptBreakdownError(432.11, { subtotal: 360, tax: 32.10, tip: 40 })).not.toBeNull();
    expect(receiptBreakdownError(0.3, { subtotal: 0.1, tax: 0.2 })).toBeNull();
  });
  it("does not invent a subtotal for older or unreadable receipts", () => {
    expect(receiptBreakdownError(432.10, { subtotal: null, tax: 32.10, tip: 40 })).toBeNull();
  });
  it("rejects a mismatch through expense save validation", () => {
    const input: ExpenseInput = { title: "Cafe", amount: 432.10, currency: "INR", date: "2026-11-02", category: "Food and beverages", scope: "personal", merchant: "Cafe", paymentMethod: "cash", description: "", memberId: null, splits: [], receiptDetails: { subtotal: 350, tax: 32.10, tip: 40 } };
    expect(() => validateExpense(input)).toThrow(/mismatch/);
  });
  it("retains reviewed item extended amounts without multiplying quantity or changing spending", () => {
    const details = { subtotal: 360, items: [{ name: "Dinner", quantity: 2, amount: 360 }] };
    expect(ReceiptDetailsSchema.parse(details)).toEqual(details);
    expect(ReceiptDetailsSchema.safeParse({ items: [{ name: "Dinner", quantity: 1, amount: -1 }] }).success).toBe(false);
  });
  it("flags only items whose name or amount was read with low confidence", () => {
    const items: NonNullable<ReceiptAmounts["items"]> = [
      { name: "Dinner", quantity: 2, amount: 360, confidence: { name: "high", amount: "low" } },
      { name: "Coffee", quantity: 1, amount: 0, confidence: { name: "low", amount: "high" } },
      { name: "Water", quantity: 1, amount: 12, confidence: { name: "high", amount: "high" } },
      { name: "Sweets", quantity: 1, amount: 40 },
    ];
    expect(receiptItemsToReview(items)).toEqual([0, 1]);
    expect(receiptItemReviewReasons(items[0]!)).toEqual(["amount"]);
    expect(receiptItemReviewReasons({ name: "Cake", amount: 40, confidence: { name: "low", amount: "low" } })).toEqual(["name", "amount"]);
    expect(receiptItemReviewReasons(items[3]!)).toEqual([]);
  });
  it("compares extracted item amounts against the read subtotal", () => {
    const items = [{ name: "Dinner", quantity: 2, amount: 360 }];
    expect(receiptItemTotalError(432.10, { subtotal: 360, tax: 32.10, tip: 40, items })).toBeNull();
    expect(receiptItemTotalError(432.10, { subtotal: 350, tax: 32.10, tip: 40, items })).toMatch(/add up to 360\.00, but the subtotal is 350\.00/);
    expect(receiptItemTotalError(432.10, { subtotal: 360, tax: 32.10, tip: 40, items: [{ name: "Dinner", quantity: 2, amount: 360 }, { name: "Water", quantity: 1, amount: 12 }] })).toMatch(/add up to 372\.00/);
  });
  it("falls back to total minus tax and tip when no subtotal was read", () => {
    expect(receiptItemTotalError(432.10, { tax: 32.10, tip: 40, items: [{ name: "Dinner", quantity: 2, amount: 360 }] })).toBeNull();
    expect(receiptItemTotalError(432.10, { tax: 32.10, tip: 40, items: [{ name: "Dinner", quantity: 2, amount: 350 }] })).toMatch(/total minus tax and tip/);
  });
  it("leaves receipts with no extracted items unjudged", () => {
    expect(receiptItemTotalError(432.10, { subtotal: 360, tax: 32.10, tip: 40, items: [] })).toBeNull();
    expect(receiptItemTotalError(432.10, { subtotal: 360, tax: 32.10, tip: 40 })).toBeNull();
    expect(receiptItemsToReview([])).toEqual([]);
  });
  it("requires a fresh review acknowledgement whenever an item or amount is edited", () => {
    const items: NonNullable<ReceiptAmounts["items"]> = [{ name: "Dinner", quantity: 2, amount: 360, confidence: { name: "high", amount: "low" } }];
    const details = { subtotal: 360, tax: 32.10, tip: 40, items };
    expect(receiptReviewCheck(432.10, details)).toEqual({ items: [0], itemTotalError: null, needed: true });
    const before = receiptReviewSignature(432.10, details);
    expect(receiptReviewSignature(432.10, details)).toBe(before);
    expect(receiptReviewSignature(432.10, { ...details, items: [{ ...items[0]!, amount: 300 }] })).not.toBe(before);
    expect(receiptReviewSignature(432.10, { ...details, tip: 50 })).not.toBe(before);
    expect(receiptReviewSignature(432.11, details)).not.toBe(before);
    expect(receiptReviewCheck(432.10, { subtotal: 360, tax: 32.10, tip: 40, items: [{ name: "Dinner", quantity: 2, amount: 300 }] }).needed).toBe(true);
  });
  it("asks for a human check on item totals without making the expense unsavable", () => {
    const input: ExpenseInput = { title: "Cafe", amount: 432.10, currency: "INR", date: "2026-11-02", category: "Food and beverages", scope: "personal", merchant: "Cafe", paymentMethod: "cash", description: "", memberId: null, splits: [], receiptDetails: { subtotal: 360, tax: 32.10, tip: 40, items: [{ name: "Dinner", quantity: 1, amount: 300 }] } };
    expect(() => validateExpense(input)).not.toThrow();
  });
});
import { lowConfidenceFields, unconfirmedFields } from "./receipt-reading";
describe("low-confidence main fields", () => {
  it("flags only low merchant/date/total", () => {
    expect(lowConfidenceFields({ merchant: "low", date: "medium", total: "low" })).toEqual(["merchant", "total"]);
    expect(lowConfidenceFields({ merchant: "unknown", date: "high", total: "medium" })).toEqual([]);
  });
  it("requires confirmation at the current value", () => {
    const values = { merchant: "Cafe", date: "2026-11-01", total: "432.10" };
    expect(unconfirmedFields({ total: "low" }, values, {})).toEqual(["total"]);
    expect(unconfirmedFields({ total: "low" }, values, { total: "432.10" })).toEqual([]);
    expect(unconfirmedFields({ total: "low" }, { ...values, total: "430" }, { total: "432.10" })).toEqual(["total"]);
  });
});

describe("receipt round-off", () => {
  it("accepts an unprinted round-off to the nearest rupee", () => {
    expect(receiptBreakdownError(2265, { subtotal: 2157, tax: 107.86 }, "INR")).toBeNull();
    expect(receiptRoundOff(2265, { subtotal: 2157, tax: 107.86 }, "INR").implied).toBeCloseTo(0.14);
  });
  it("still flags a gap of a rupee or more", () => {
    expect(receiptBreakdownError(2266, { subtotal: 2157, tax: 107.86 }, "INR")).not.toBeNull();
  });
  it("counts a printed negative round-off", () => {
    expect(receiptBreakdownError(2264, { subtotal: 2157, tax: 107.4, roundOff: -0.4 }, "INR")).toBeNull();
  });
  it("keeps decimal currencies strict", () => {
    expect(receiptBreakdownError(11, { subtotal: 10, tax: 0.86 }, "USD")).not.toBeNull();
  });
  it("ignores paise-level item differences on rounded INR bills", () => {
    expect(receiptItemTotalError(2265, { subtotal: 2157.4, tax: 107.86, items: [{ name: "A", quantity: 1, amount: 2157 }] }, "INR")).toBeNull();
  });
});

describe("receiptRoundOffFor", () => {
  it("uses the saved round-off first", () => {
    expect(receiptRoundOffFor({ originalAmount: 2264, currency: "INR", receiptDetails: { subtotal: 2157, tax: 107.4, roundOff: -0.4 } })).toEqual({ amount: -0.4, source: "saved" });
  });
  it("works out round-off for older INR records", () => {
    const r = receiptRoundOffFor({ originalAmount: 2265, currency: "INR", receiptDetails: { subtotal: 2157, tax: 107.86 } });
    expect(r.source).toBe("implied"); expect(r.amount).toBeCloseTo(0.14);
  });
  it("gives none for decimal currencies", () => {
    expect(receiptRoundOffFor({ originalAmount: 11, currency: "USD", receiptDetails: { subtotal: 10, tax: 0.86 } }).amount).toBe(0);
  });
});

import { z as zz } from "zod";
describe("receipt request format", () => {
  it("lists every field as required so strict AI reading is accepted", () => {
    const s = zz.toJSONSchema(ExtractedReceiptSchema) as { properties: Record<string, unknown>; required: string[] };
    expect(Object.keys(s.properties).filter((k) => !s.required.includes(k))).toEqual([]);
  });
});

import { receiptBreakdownError as rbe, receiptItemTotalError as rite } from "./receipt-reading";
describe("service charges and discounts", () => {
  it("service charge makes the total reconcile", () => {
    expect(rbe(2265, { subtotal: 2000, charges: [{ amount: 100 }], tax: 165 }, "INR")).toBeNull();
    expect(rbe(2265, { subtotal: 2000, tax: 165 }, "INR")).not.toBeNull();
  });
  it("discount reduces the total", () => { expect(rbe(1890, { subtotal: 2000, charges: [{ amount: -200 }], tax: 90 }, "INR")).toBeNull(); });
  it("tax parts must add up to tax", () => {
    expect(rbe(1100, { subtotal: 1000, tax: 100, taxParts: [{ amount: 50 }, { amount: 50 }] }, "INR")).toBeNull();
    expect(rbe(1100, { subtotal: 1000, tax: 100, taxParts: [{ amount: 50 }, { amount: 40 }] }, "INR")).not.toBeNull();
  });
  it("items reconcile against total minus charges when no subtotal is printed", () => {
    expect(rite(1150, { tax: 50, charges: [{ amount: 100 }], items: [{ name: "Dosa", quantity: 1, amount: 1000 }] }, "INR")).toBeNull();
  });
  it("a gap that does not add up is still an error", () => { expect(rbe(2500, { subtotal: 2000, charges: [{ amount: 100 }], tax: 165 }, "INR")).not.toBeNull(); });
});
