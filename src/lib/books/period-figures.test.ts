import { describe, expect, it } from "vitest";
import { buildPeriodFigures, figureChecks, parsePeriodFigures, reproduceFromEvidence } from "./period-figures";
import type { GstInvoice, Journal } from "./types";

const inv = (over: Partial<GstInvoice>): GstInvoice => ({
  id: "i1", gstin: "33ABCDE1234F1Z5", kind: "sales", number: "INV-1", date: "2025-06-10", party: "Customer", partyGstin: "",
  taxable: 1000, igst: 180, cgst: 0, sgst: 0, cess: 0, ...over,
});
const journal = (over: Partial<Journal>): Journal => ({ id: "j1", assetId: "a1", period: "2025-06", amount: 500, kind: "book", status: "posted", postedOn: "2025-06-30", ...over });

const fixture = {
  from: "2025-04-01", to: "2026-03-31",
  entries: [
    { date: "2025-05-01", amount: 10000, txnType: "income", reconciled: true },
    { date: "2025-06-15", amount: 2500, txnType: "expense" },
    { date: "2025-07-01", amount: 4000, txnType: "transfer" },
    { date: "2025-08-01", amount: 100, txnType: "adjustment" },
    { date: "2026-04-01", amount: 999, txnType: "income" }, // outside the period
  ],
  accounts: [{ id: "acc-1", balanceAt: () => 12345.67 }],
  invoices: [
    inv({}),
    inv({ id: "i2", kind: "purchase", taxable: 500, igst: 0, cgst: 45, sgst: 45 }),
    inv({ id: "i3", kind: "purchase", taxable: 300, igst: 54, treatment: "reverse_charge", rcmPaidOn: "2025-09-05", rcmPaymentId: "p1" }),
    inv({ id: "i4", date: "2026-04-15" }), // outside the period
  ],
  journals: [journal({}), journal({ id: "j2", status: "prepared", postedOn: undefined }), journal({ id: "j3", postedOn: "2026-04-30" })],
};

describe("buildPeriodFigures", () => {
  it("rounds decimal source totals once and reproduces the same closed evidence", () => {
    const entries = [1.005, 0.1, 0.2].map(amount => ({ date:"2025-06-10", amount, txnType:"expense" }));
    const invoices = [1.005, 0.1, 0.2].map((taxable,i) => inv({id:`fraction-${i}`, taxable, igst:0}));
    const journals = [1.005, 0.1, 0.2].map((amount,i) => journal({id:`fraction-${i}`, amount}));
    const f = buildPeriodFigures({...fixture, entries, invoices, journals, accounts:[{id:"bank",balanceAt:()=>1.005}]});
    expect(f.entries.expenses).toBe(1.31);
    expect(f.gst.outputTaxable).toBe(1.31);
    expect(f.depreciation.posted).toBe(1.31);
    expect(f.balances.bank).toBe(1.01);
    const reproduced = reproduceFromEvidence({from:fixture.from,to:fixture.to,ledger:entries.map(e=>({expense_date:e.date,amount:String(e.amount),txn_type:e.txnType})),registers:{gstInvoices:invoices,journals}});
    expect(reproduced?.entries).toEqual(f.entries);
    expect(reproduced?.gst).toEqual(f.gst);
    expect(reproduced?.depreciation).toEqual(f.depreciation);
  });
  it("totals only in-period entries, invoices and posted journals", () => {
    const f = buildPeriodFigures(fixture);
    expect(f.entries).toEqual({ count: 4, income: 10000, expenses: 2500, moves: 4000, adjustments: 100, reconciled: 1 });
    expect(f.gst).toEqual({ outputTaxable: 1000, outputTax: 180, inputTaxable: 500, inputTax: 90, rcmCash: 54 });
    expect(f.depreciation).toEqual({ posted: 500, journals: 1 });
    expect(f.balances).toEqual({ "acc-1": 12345.67 });
  });
  it("credit notes reduce GST figures and amended originals drop out", () => {
    const f = buildPeriodFigures({ ...fixture, invoices: [inv({}), inv({ id: "n1", note: "credit", originalNumber: "INV-1", taxable: 200, igst: 36 })] });
    expect(f.gst.outputTaxable).toBe(800);
    expect(f.gst.outputTax).toBe(144);
  });
});

describe("figureChecks", () => {
  it("matches an identical recomputation and flags a changed figure", () => {
    const stored = buildPeriodFigures(fixture);
    const same = buildPeriodFigures(fixture);
    expect(figureChecks(stored, same).every((c) => c.match)).toBe(true);
    const drifted = buildPeriodFigures({ ...fixture, entries: [...fixture.entries, { date: "2025-06-20", amount: 750, txnType: "expense" }] });
    const checks = figureChecks(stored, drifted);
    expect(checks.find((c) => c.key === "entries.expenses")).toMatchObject({ stored: 2500, recomputed: 3250, match: false });
    expect(checks.find((c) => c.key === "entries.count")?.match).toBe(false);
    expect(checks.find((c) => c.key === "gst.outputTax")?.match).toBe(true);
  });
  it("reproducible-only mode skips closing balances", () => {
    const f = buildPeriodFigures(fixture);
    expect(figureChecks(f, f, true).some((c) => c.key.startsWith("balances."))).toBe(false);
  });
});

describe("reproduceFromEvidence", () => {
  it("recomputes entry and GST figures from the snapshot's own saved records", () => {
    const evidence = {
      from: "2025-04-01", to: "2026-03-31",
      ledger: [
        { id: "e1", expense_date: "2025-05-01", amount: 10000, txn_type: "income", reconciled_at: "2025-05-02T00:00:00Z" },
        { id: "e2", expense_date: "2025-06-15", amount: 2500, txn_type: "expense", reconciled_at: null },
      ],
      registers: { gstInvoices: [inv({})], journals: [journal({})] },
    };
    const f = reproduceFromEvidence(evidence);
    expect(f?.entries).toMatchObject({ count: 2, income: 10000, expenses: 2500, reconciled: 1 });
    expect(f?.gst.outputTax).toBe(180);
    expect(f?.depreciation.posted).toBe(500);
    expect(f?.balances).toEqual({});
  });
  it("returns null for malformed evidence", () => {
    expect(reproduceFromEvidence(null)).toBeNull();
    expect(reproduceFromEvidence({ ledger: [] })).toBeNull();
  });
});

describe("parsePeriodFigures", () => {
  it("accepts a stored figure set and rejects anything else", () => {
    const f = buildPeriodFigures(fixture);
    expect(parsePeriodFigures(JSON.parse(JSON.stringify(f)))).toEqual(f);
    expect(parsePeriodFigures({ version: 2 })).toBeNull();
    expect(parsePeriodFigures("nope")).toBeNull();
  });
});
