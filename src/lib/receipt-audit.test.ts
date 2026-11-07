import { describe, expect, it } from "vitest";
import { buildReceiptAudit, receiptCorrectionLines, receiptFingerprint, receiptFingerprintMatches, hasReceiptAudit } from "./receipt-audit";
import type { Expense } from "./expenses";

const entry = (id: string, fingerprint?: string): Expense => ({
  id, title: "t", merchant: "m", category: "Groceries", scope: "personal", memberId: null, splits: [],
  amount: 100, currency: "INR", originalAmount: 100, fxRate: 1, paymentMethod: "upi",
  reconciledAt: null, statementRef: null, date: "2026-10-01", description: "", receipts: [],
  receiptDetails: fingerprint ? { fingerprint } : {},
});

describe("receiptFingerprint", () => {
  it("hashes file bytes to a stable sha256 fingerprint", async () => {
    const bytes = new TextEncoder().encode("receipt-bytes");
    const file = { name: "a.jpg", size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(0) as ArrayBuffer };
    const a = await receiptFingerprint(file);
    const b = await receiptFingerprint(file);
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(a).toBe(b);
  });

  it("differs for different bytes", async () => {
    const mk = (s: string) => { const b = new TextEncoder().encode(s); return { name: "a.jpg", size: b.length, arrayBuffer: async () => b.buffer.slice(0) as ArrayBuffer }; };
    expect(await receiptFingerprint(mk("one"))).not.toBe(await receiptFingerprint(mk("two")));
  });
});

describe("receiptFingerprintMatches", () => {
  it("finds expenses already using the same receipt file", () => {
    const list = [entry("a", "sha256:x"), entry("b", "sha256:y"), entry("c")];
    expect(receiptFingerprintMatches("sha256:x", list).map((e) => e.id)).toEqual(["a"]);
  });
  it("excludes the entry being edited and ignores empty fingerprints", () => {
    const list = [entry("a", "sha256:x")];
    expect(receiptFingerprintMatches("sha256:x", list, "a")).toEqual([]);
    expect(receiptFingerprintMatches(undefined, list)).toEqual([]);
    expect(receiptFingerprintMatches("", list)).toEqual([]);
  });
});

describe("buildReceiptAudit", () => {
  const read = { merchant: "Cafe A", date: "2026-10-01", amount: 450, currency: "INR" };
  it("records only the fields the owner changed", () => {
    const audit = buildReceiptAudit(read, { ...read, amount: 455 }, "2026-10-31T09:00:00Z");
    expect(audit.read).toEqual(read);
    expect(audit.corrected).toEqual({ amount: 455 });
    expect(receiptCorrectionLines(audit)).toEqual(["amount: 450 → 455"]);
  });
  it("is empty when nothing was corrected", () => {
    const audit = buildReceiptAudit(read, read, "2026-10-31T09:00:00Z");
    expect(audit.corrected).toEqual({});
    expect(receiptCorrectionLines(audit)).toEqual([]);
  });
  it("ignores merchant whitespace and currency case, rounds amounts to paise", () => {
    const audit = buildReceiptAudit(read, { merchant: " Cafe A ", date: read.date, amount: 450.001, currency: "inr" }, "t");
    expect(audit.corrected).toEqual({});
  });
  it("records merchant, date and currency corrections", () => {
    const audit = buildReceiptAudit(read, { merchant: "Cafe B", date: "2026-10-02", amount: 450, currency: "USD" }, "t");
    expect(receiptCorrectionLines(audit)).toEqual(["merchant: Cafe A → Cafe B", "date: 2026-10-01 → 2026-10-02", "currency: INR → USD"]);
  });
});

describe("hasReceiptAudit", () => {
  it("detects stored audits", () => {
    expect(hasReceiptAudit(undefined)).toBe(false);
    expect(hasReceiptAudit({})).toBe(false);
    expect(hasReceiptAudit({ audit: buildReceiptAudit(read0, read0, "t") })).toBe(true);
  });
});
const read0 = { merchant: "m", date: "2026-01-01", amount: 1, currency: "INR" };
