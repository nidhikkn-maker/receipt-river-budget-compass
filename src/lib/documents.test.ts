import { describe, expect, it } from "vitest";
import { expiringDocuments, searchVault, validateDocument, vaultItems, type VaultDoc } from "./documents";

const doc = (x: Partial<VaultDoc>): VaultDoc => ({ id: "d1", title: "TV warranty", docType: "warranty", filePath: "u/docs/w.pdf", fileName: "w.pdf", mimeType: "application/pdf", size: 1000, docDate: "2026-05-01", amount: 52000, currency: "INR", merchant: "Croma", notes: "", text: "Sony Bravia 55 inch", transactionId: null, accountId: null, loanId: "l1", expiresOn: "2026-11-15", createdAt: "2026-05-01", ...x });
const txn = { id: "t1", title: "Dinner", merchant: "Toit", date: "2026-10-12", originalAmount: 2500, currency: "INR", accountId: "a1", description: "", receipts: [{ name: "bill.jpg", type: "image/jpeg", path: "u/bill.jpg" }], receiptDetails: { text: "Masala dosa" } };

describe("document vault search", () => {
  const items = vaultItems([doc({}), doc({ id: "d2", title: "HDFC statement", docType: "bank_statement", merchant: null, amount: null, loanId: null, accountId: "a1", text: "", docDate: "2026-09-30", expiresOn: null })], [txn]);
  it("combines uploaded documents and entry receipts", () => {
    expect(items.map((x) => x.key)).toEqual(["r:u/bill.jpg", "d:d2", "d:d1"]);
  });
  it("finds documents by merchant, text or amount", () => {
    expect(searchVault(items, { q: "croma" }).map((x) => x.key)).toEqual(["d:d1"]);
    expect(searchVault(items, { q: "dosa" }).map((x) => x.key)).toEqual(["r:u/bill.jpg"]);
    expect(searchVault(items, { q: "2500" }).map((x) => x.key)).toEqual(["r:u/bill.jpg"]);
  });
  it("filters by type, date range, amount and link", () => {
    expect(searchVault(items, { type: "bank_statement" }).map((x) => x.key)).toEqual(["d:d2"]);
    expect(searchVault(items, { from: "2026-09-01", to: "2026-09-30" }).map((x) => x.key)).toEqual(["d:d2"]);
    expect(searchVault(items, { min: 10000 }).map((x) => x.key)).toEqual(["d:d1"]);
    expect(searchVault(items, { linked: "loan" }).map((x) => x.key)).toEqual(["d:d1"]);
    expect(searchVault(items, { linked: "account" }).map((x) => x.key)).toEqual(["r:u/bill.jpg", "d:d2"]);
  });
});

describe("document rules", () => {
  it("lists warranties and policies expiring soon", () => {
    expect(expiringDocuments([doc({})], "2026-10-31", 30).map((d) => d.id)).toEqual(["d1"]);
    expect(expiringDocuments([doc({})], "2026-09-01", 30)).toEqual([]);
  });
  it("rejects files over 10 MB and untitled documents", () => {
    expect(() => validateDocument({ title: "x", size: 11 * 1024 * 1024, docType: "bill" })).toThrow("10 MB");
    expect(() => validateDocument({ title: " ", size: 10, docType: "bill" })).toThrow("title");
  });
});

import { currentVersions, earlierVersions, duplicateDocuments } from "./documents";
describe("DocuRepo versions and duplicates", () => {
  const base = { title: "Deed", docType: "property_deed" as const, filePath: "p", fileName: "deed.pdf", mimeType: "application/pdf", size: 100, docDate: "2024-01-01", amount: 5000000, currency: "INR", merchant: "Sub-registrar", notes: "", text: "", transactionId: null, accountId: null, loanId: null, expiresOn: null, createdAt: "2024-01-01" };
  const v1 = { ...base, id: "a" }, v2 = { ...base, id: "b", replacesId: "a", fileName: "deed-v2.pdf" };
  it("hides replaced originals but keeps them as earlier versions", () => {
    expect(currentVersions([v1, v2]).map(d => d.id)).toEqual(["b"]);
    expect(earlierVersions([v1, v2], "b").map(d => d.id)).toEqual(["a"]);
  });
  it("flags same file or same type/date/amount/issuer as a possible duplicate", () => {
    expect(duplicateDocuments([v1], { fileName: "deed.pdf", size: 100, docType: "other", docDate: null, amount: null, merchant: null })).toHaveLength(1);
    expect(duplicateDocuments([v1], { fileName: "x.pdf", size: 1, docType: "property_deed", docDate: "2024-01-01", amount: 5000000, merchant: "sub-registrar " })).toHaveLength(1);
    expect(duplicateDocuments([v1], { fileName: "x.pdf", size: 1, docType: "property_deed", docDate: "2024-01-02", amount: 5000000, merchant: "Sub-registrar" })).toHaveLength(0);
  });
  it("finds documents by a key detail such as GSTIN", () => {
    const g = { ...base, id: "g", fields: [{ label: "GSTIN", value: "33ABCDE1234F1Z5", page: 1, quote: "GSTIN 33ABCDE1234F1Z5", confidence: "high" as const, status: "read" as const }] };
    expect(searchVault(vaultItems([g], []), { q: "33abcde" })).toHaveLength(1);
  });
});
