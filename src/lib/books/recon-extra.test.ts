import { describe, it, expect } from "vitest";
import { customerRecon, investmentRecon, applyCorporateActions } from "./recon";
import { proposeAsset } from "./intake";
import type { GstInvoice } from "./types";

const inv = (o: Partial<GstInvoice>): GstInvoice => ({ id: "i", gstin: "", kind: "sales", number: "1", date: "2026-05-01", party: "Acme Traders", partyGstin: "33AAAAA0000A1Z5", taxable: 1000, igst: 180, cgst: 0, sgst: 0, cess: 0, ...o });

describe("customer reconciliation", () => {
  it("shows the unpaid balance of a customer and uses each receipt once", () => {
    const rows = customerRecon([inv({})], [{ id: "r1", amount: 500, text: "NEFT ACME TRADERS", date: "2026-05-10" }], "2026-04-01", "2027-03-31");
    expect(rows).toEqual([expect.objectContaining({ party: "Acme Traders", invoiced: 1180, received: 500, outstanding: 680 })]);
  });
  it("is silent when fully received", () => {
    expect(customerRecon([inv({})], [{ id: "r1", amount: 1180, text: "acme traders", date: "2026-05-10" }], "2026-04-01", "2027-03-31")).toEqual([]);
  });
});

describe("corporate actions in holding reconciliation", () => {
  it("adds bonus shares so a 1:1 bonus does not look like a difference", () => {
    const h = [{ isin: "INE1", name: "X", quantity: 20, lots: [{ side: "buy" as const, quantity: 10 }] }];
    expect(investmentRecon(h)).toHaveLength(1);
    expect(investmentRecon(h, [{ date: "2026-06-01", isin: "INE1", kind: "bonus", quantity: 10 }])).toEqual([]);
  });
  it("never guesses an action without a printed quantity", () => {
    expect(applyCorporateActions(10, [{ date: "2026-06-01", isin: "INE1", kind: "split", quantity: null }]).unresolved).toHaveLength(1);
  });
  it("counts opening quantity before the first trade", () => {
    expect(investmentRecon([{ isin: "INE1", name: "X", quantity: 15, openingQty: 5, lots: [{ side: "buy", quantity: 10 }] }])).toEqual([]);
  });
});

describe("printed opening WDV on asset documents", () => {
  const base = { name: "Lathe", kind: "machinery" as const, owner: null, cost: 100000, purchaseDate: "2022-04-10", supplier: null, warrantyUntil: null, insurance: null, serial: null };
  it("keeps the printed tax WDV and asks for the book value", () => {
    const r = proposeAsset({ ...base, openingTaxWdv: 60000, wdvFy: "2026-27" }, [], "a1", null);
    expect(r.asset?.openingWdv).toEqual({ fy: "2026-27", book: -1, tax: 60000 });
    expect(r.missing).toContain("opening book value (tax WDV was printed)");
  });
});
