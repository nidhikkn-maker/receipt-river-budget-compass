import { describe, expect, it } from "vitest";
import { derivedEvidence } from "./derived-evidence";
import { emptyBooks, type GstInvoice } from "./types";
import type { Asset } from "../assets";

const inv = (over: Partial<GstInvoice>): GstInvoice => ({
  id: "i1", gstin: "G", kind: "sales", number: "S1", date: "2026-06-10", party: "Customer", partyGstin: "",
  taxable: 1000, igst: 180, cgst: 0, sgst: 0, cess: 0, ...over,
});
const asset = (over: Partial<Asset>): Asset => ({ id: "a1", name: "Machine", cost: 120000, inUse: "2025-04-01", kind: "machinery", bookMethod: "slm", usefulLifeYears: 10, ...over } as Asset);

describe("derivedEvidence", () => {
  it("chains GST payable to its invoices with their sources", () => {
    const books = { ...emptyBooks(), gstInvoices: [inv({}), inv({ id: "i2", kind: "purchase", number: "P1", taxable: 500, igst: 0, cgst: 45, sgst: 45, docId: "d2" })] };
    const rows = derivedEvidence({ assets: [], books, docs: [{ id: "d2", title: "Purchase bill" }] });
    const gst = rows.find((r) => r.id === "gst:G|2026-06");
    expect(gst?.amount).toBe(180); // missing supplier identity holds credit, same as Tax Centre
    expect(gst?.inputs.map((i) => i.amount)).toEqual([180, 0]);
    expect(gst?.inputs[0]?.source).toBeNull();
    expect(gst?.inputs[1]?.source).toMatchObject({ kind: "document", id: "d2" });
    expect(gst?.unsourced).toBe(1);
  });
  it("includes service advances and their reviewed adjustments in the month they hit", () => {
    const books = { ...emptyBooks(), gstInvoices: [inv({})], gstAdvances: [{ id: "ad1", gstin: "G", number: "A1", date: "2026-05-01", party: "Customer", partyGstin: "", supply: "services" as const, taxable: 1000, igst: 180, cgst: 0, sgst: 0, cess: 0, adjustments: [{ invoiceId: "i1", date: "2026-06-01", taxable: 500, igst: 90, cgst: 0, sgst: 0, cess: 0 }] }] };
    const rows = derivedEvidence({ assets: [], books, docs: [] });
    expect(rows.find((r) => r.id === "gst:G|2026-05")?.amount).toBe(180);
    const june = rows.find((r) => r.id === "gst:G|2026-06");
    expect(june?.inputs.map((i) => i.amount)).toEqual([180, -90]);
    expect(june?.amount).toBe(90);
  });
  it("chains posted depreciation to the asset cost evidence and skips prepared journals", () => {
    const books = { ...emptyBooks(), journals: [
      { id: "j1", assetId: "a1", period: "2026-06", amount: 1000, kind: "book" as const, status: "posted" as const, postedOn: "2026-06-30" },
      { id: "j2", assetId: "a1", period: "2026-07", amount: 1000, kind: "book" as const, status: "prepared" as const },
    ] };
    const rows = derivedEvidence({ assets: [asset({ docId: "d1" })], books, docs: [{ id: "d1", title: "Machine invoice" }] });
    const dep = rows.filter((r) => r.id.startsWith("dep:"));
    expect(dep).toHaveLength(1);
    expect(dep[0]?.inputs[0]).toMatchObject({ amount: 120000, source: { kind: "document", id: "d1" } });
  });
  it("marks every input without a document or entry as unsourced", () => {
    const books = { ...emptyBooks(), gstInvoices: [inv({})] };
    const gst = derivedEvidence({ assets: [], books, docs: [] }).find((r) => r.id === "gst:G|2026-06");
    expect(gst?.unsourced).toBe(1);
  });
});
