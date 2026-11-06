import { describe, expect, it } from "vitest";
import { allocatePayments } from "./recon";
import type { GstInvoice } from "./types";

const inv = (x: Partial<GstInvoice>): GstInvoice => ({ id: x.number ?? "i", gstin: "G", kind: "sales", number: "S1", date: "2026-07-01", party: "Acme", partyGstin: "", taxable: 1000, igst: 0, cgst: 0, sgst: 0, cess: 0, ...x });

describe("invoice-level allocation", () => {
  it("a payment naming an invoice settles that invoice first, then oldest-first", () => {
    const r = allocatePayments([inv({ number: "S1" }), inv({ number: "S2", date: "2026-08-01" })], [{ id: "p1", amount: 1500, text: "NEFT Acme S2", date: "2026-08-10" }], "2026-09-01");
    expect(r.lines.find((l) => l.number === "S2")).toMatchObject({ status: "paid", allocated: 1000 });
    expect(r.lines.find((l) => l.number === "S1")).toMatchObject({ status: "part", outstanding: 500, ageDays: 62 });
  });
  it("credit notes reduce their original invoice; overpayments stay unallocated", () => {
    const r = allocatePayments([inv({ number: "S1" }), inv({ number: "CN1", note: "credit", originalNumber: "S1", taxable: 200 })], [{ id: "p1", amount: 900, text: "Acme", date: "2026-07-10" }], "2026-07-10");
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ amount: 800, status: "paid" });
    expect(r.unallocated).toBe(100);
  });
  it("S1 in text does not match S10", () => {
    const r = allocatePayments([inv({ number: "S1" }), inv({ number: "S10", date: "2026-08-01" })], [{ id: "p", amount: 1000, text: "for S10", date: "2026-08-02" }], "2026-08-02");
    expect(r.lines.find((l) => l.number === "S10")!.status).toBe("paid");
    expect(r.lines.find((l) => l.number === "S1")!.status).toBe("open");
  });
});
