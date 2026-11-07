import { describe, it, expect } from "vitest";
import { searchVault, linkedLabels, type VaultItem } from "./documents";
const item = (key: string, o: Partial<VaultItem>): VaultItem => ({ key, source: "document", docId: key, title: "Scan", docType: "other", path: `u/${key}`, fileName: `${key}.pdf`, mimeType: "application/pdf", date: "2026-05-01", amount: null, currency: "INR", merchant: null, text: "", transactionId: null, accountId: null, loanId: null, expiresOn: null, ...o } as VaultItem);
const items = [item("d1", { accountId: "a1" }), item("d2", { transactionId: "t1" }), item("d3", {}), item("d4", {})];
const labels = linkedLabels(items, {
  accounts: [{ id: "a1", name: "IDFC Krupa Savings" }],
  transactions: [{ id: "t1", title: "Office chairs", merchant: "Godrej Interio" }],
  links: [{ docId: "d3", kind: "lease", label: "Tenant: Ravi Kumar" }, { docId: "d4", kind: "asset", label: "Asset: Dell XPS laptop" }, { docId: "d4", kind: "supplier", label: "Supplier: Croma" }],
});
const q = (s: string) => searchVault(items, { q: s }, labels).map(x => x.key);
describe("DocuRepo search by linked record", () => {
  it("finds by account name", () => expect(q("idfc krupa")).toEqual(["d1"]));
  it("finds by transaction merchant", () => expect(q("godrej")).toEqual(["d2"]));
  it("finds by tenant", () => expect(q("ravi")).toEqual(["d3"]));
  it("finds by asset and supplier together", () => expect(q("dell croma")).toEqual(["d4"]));
  it("no match for unlinked names", () => expect(q("hdfc")).toEqual([]));
  it("labels of records the user cannot see are never added", () => {
    const l = linkedLabels([item("x", { accountId: "other-owner" })], { accounts: [], transactions: [], links: [] });
    expect(l.size).toBe(0);
  });
});
