import { describe, expect, it } from "vitest";
import { effectiveInvoices, gstPayable, gstr1, gstr1Json, gstr3b, noteProblems } from "./gst";
import type { GstInvoice } from "./types";

const G = "33AAAAA0000A1Z5", P = "33BBBBB1111B1Z6";
const inv = (x: Partial<GstInvoice>): GstInvoice => ({ id: "i1", gstin: G, kind: "sales", number: "S1", date: "2026-10-05", party: "Acme", partyGstin: P, taxable: 1000, igst: 0, cgst: 90, sgst: 90, cess: 0, ...x });

describe("GST credit/debit notes and amendments", () => {
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
