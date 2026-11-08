import { describe, it, expect } from "vitest";
import { missingInvoices, supplierSummary } from "./gst-recon";
import type { Expense } from "./expenses";
import type { VaultDoc } from "./documents";

const e = (id: string, o: Partial<Expense> = {}) => ({ id, title: "x", merchant: "Acme", scope: "business", amount: 1000, fxRate: 1, receipts: [], date: "2026-05-01", ...o }) as Expense;
const doc = (txn: string, text: string) => ({ id: "d" + txn, transactionId: txn, text, fields: [] }) as unknown as VaultDoc;

describe("gst-recon", () => {
  it('a personal-ledger entry with a business share still requires a retained invoice',()=>{
    const mixed=e('split',{scope:'personal',originalAmount:1000,workspaceAllocations:[{workspace:'personal',amount:600},{workspace:'business',amount:400}]});
    expect(missingInvoices([mixed],[]).map(x=>x.id)).toEqual(['split']);expect(missingInvoices([mixed],[doc('split','')])).toEqual([]);
  });
  it("flags business spends with no bill or linked document only", () => {
    const list = [e("a"), e("b", { receipts: [{ name: "r", type: "image/jpeg", path: "p" }] }), e("c"), e("d", { scope: "personal" }), e("t", { txnType: "transfer" })];
    expect(missingInvoices(list, [doc("c", "")]).map((x) => x.id)).toEqual(["a"]);
    expect(missingInvoices(list, [], 2000)).toEqual([]);
  });
  it("groups suppliers, counts bills, sums GST and reads GSTIN", () => {
    const rows = supplierSummary([e("a", { receiptDetails: { tax: 180 } }), e("b", { merchant: " acme " })], [doc("b", "GSTIN 33ABCPE1234F1Z5")]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ count: 2, total: 2000, tax: 180, withBill: 1, gstin: "33ABCPE1234F1Z5" });
  });
});
