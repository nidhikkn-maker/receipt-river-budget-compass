import { describe, it, expect } from "vitest";
import { taxDraft } from "./tax-summary";
import type { Expense } from "./expenses";

const e = (o: Partial<Expense>) => ({ id: Math.random().toString(), scope: "business", amount: 1000, fxRate: 1, receipts: [], date: "2026-05-01", ...o }) as Expense;

describe("taxDraft", () => {
  it("adds year income, business spend, GST input and depreciation share", () => {
    const d = taxDraft("2026-27", [
      e({ txnType: "income", amount: 50000 }),
      e({ receiptDetails: { tax: 180 }, receipts: [{ name: "r", type: "x", path: "p" }] }),
      e({ scope: "personal" }),
      e({ date: "2026-03-31" }),
    ], [{ id: "c", name: "PC", kind: "computer", cost: 10000, inUse: "2026-04-01", sharePct: 50, bookMethod: "slm", bookRatePct: 0 }]);
    expect(d).toMatchObject({ income: 50000, businessSpend: 1000, gstInput: 180, depreciation: 2000, workingProfit: 47000, billsMissing: 0 });
  });
});
