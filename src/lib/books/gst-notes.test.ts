import { describe, expect, it } from "vitest";
import { invoiceRegister, effectiveInvoices, gstPayable, gstr1, gstr1Json, gstr3b, noteProblems } from "./gst";
import type { GstInvoice } from "./types";

const G = "33AAAAA0000A1Z5", P = "33BBBBB1111B1Z6";
const inv = (x: Partial<GstInvoice>): GstInvoice => ({ id: "i1", gstin: G, kind: "sales", number: "S1", date: "2026-10-05", party: "Acme", partyGstin: P, taxable: 1000, igst: 0, cgst: 90, sgst: 90, cess: 0, ...x });

describe("GST credit/debit notes and amendments", () => {
  it('register omits replaced invoices and keeps printed credit amounts for editing',()=>{
    const list=[inv({}),inv({id:'amend',amendsId:'i1',taxable:1100}),inv({id:'credit',note:'credit',taxable:200}),inv({id:'other',gstin:'OTHER'})];
    expect(invoiceRegister(list,G,'2026-10').map(i=>[i.id,i.taxable])).toEqual([['amend',1100],['credit',200]]);
  });
  it("a sales credit note reduces output tax in 3B and set-off", () => {
    const list = [inv({}), inv({ id: "c1", number: "CN1", note: "credit", originalNumber: "S1", taxable: 200, cgst: 18, sgst: 18 })];
    expect(gstr3b(list, G, "2026-10").outputTax).toBe(144);
    expect(gstPayable(list, G, "2026-10").cashTotal).toBe(144);
  });
  it("GSTR-1 keeps notes out of B2B and lists them in CDNR", () => {
    const list = [inv({}), inv({ id: "c1", number: "CN1", note: "credit", originalNumber: "S1", taxable: 200, cgst: 18, sgst: 18 })];
    expect(gstr1(list, G, "2026-10").b2b.taxable).toBe(1000);
    expect(gstr1(list, G, "2026-10").notes.taxable).toBe(-200);
    const j = gstr1Json(list, G, "2026-10");
    expect(j.cdnr[0]!.nt[0]).toMatchObject({ ntty: "C", nt_num: "CN1", val: 236 });
    expect(j.b2b[0]!.inv).toHaveLength(1);
  });
  it("an amendment replaces the original invoice everywhere", () => {
    const list = [inv({}), inv({ id: "a1", amendsId: "i1", taxable: 1100, cgst: 99, sgst: 99 })];
    expect(effectiveInvoices(list).map((i) => i.id)).toEqual(["a1"]);
    expect(gstr3b(list, G, "2026-10").outwardTaxable).toBe(1100);
  });
  it("a purchase credit note reduces ITC even when 2B matching is applied", () => {
    const list = [inv({ kind: "purchase" }), inv({ id: "c1", kind: "purchase", number: "CN1", note: "credit", originalNumber: "S1", taxable: 100, cgst: 9, sgst: 9 })];
    expect(gstr3b(list, G, "2026-10", new Set([`${P}|S1`])).itcClaimed).toBe(162);
  });
  it("notes must name the original invoice", () => {
    expect(noteProblems(inv({ note: "debit" }), [])).toContain("credit/debit note must name the original invoice number");
  });
});

describe("closed periods", () => {
  it("refuses amending an invoice inside a closed period", () => {
    const G = "33AAAAA0000A1Z5";
    const orig = { id: "i1", gstin: G, kind: "sales" as const, number: "S1", date: "2026-05-05", party: "A", partyGstin: "", taxable: 1, igst: 0, cgst: 0, sgst: 0, cess: 0 };
    expect(noteProblems({ ...orig, id: "a1", amendsId: "i1", date: "2026-10-01" }, [orig], [{ from: "2026-04-01", to: "2026-06-30" }])[0]).toMatch(/closed period/);
  });
});
