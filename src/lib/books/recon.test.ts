import { describe, expect, it } from "vitest";
import { intercompanyRecon, investmentRecon, loanRecon, supplierRecon } from "./recon";
import type { GstInvoice } from "./types";

describe("§24 reconciliations compare figures", () => {
  it("loan: lender outstanding vs ledger balance on the statement date", () => {
    const r = loanRecon([{ id: "l", name: "GLS", accountId: "acc" }], [{ loanId: "l", date: "2026-10-05", outstanding: 10374241 }], () => -10374254);
    expect(r[0]!.difference).toBe(13);
  });
  it("supplier: invoices incl. tax vs payments naming the supplier", () => {
    const inv = [{ id: "i", gstin: "33X", kind: "purchase", number: "1", date: "2026-05-01", party: "Acme Traders Pvt Ltd", partyGstin: "29ABCDE1234F1Z5", taxable: 1000, igst: 180, cgst: 0, sgst: 0, cess: 0 }] as GstInvoice[];
    const r = supplierRecon(inv, [{ id: "p", amount: 1000, date: "2026-05-10", text: "NEFT ACME TRADERS" }], "2026-04-01", "2027-03-31");
    expect(r[0]).toMatchObject({ invoiced: 1180, paid: 1000, difference: 180 });
  });
  it("investment: statement quantity vs buys minus sells", () => {
    expect(investmentRecon([{ isin: "INE1", name: "X", quantity: 10, lots: [{ side: "buy", quantity: 12 }, { side: "sell", quantity: 4 }] }])[0]!.difference).toBe(2);
  });
  it("intercompany: transfers between two companies' accounts, netted by pair", () => {
    const r = intercompanyRecon([
      { id: "1", amount: 500, txnType: "transfer", accountId: "a1", toAccountId: "b1" },
      { id: "2", amount: 200, txnType: "transfer", accountId: "b1", toAccountId: "a1", reconciledAt: "x" },
      { id: "3", amount: 50, txnType: "transfer", accountId: "a1", toAccountId: "a2" },
    ], { A: ["a1", "a2"], B: ["b1"] });
    expect(r).toEqual([{ a: "A", b: "B", aToB: 500, bToA: 200, net: 300, unconfirmed: 1 }]);
  });
});
