import { describe, it, expect } from "vitest";
import { estimateTax, rulesFor } from "./tax-rules";
import { receivableStatus } from "./receivables";
import type { Expense } from "./expenses";

describe("tax rules by year", () => {
  it("no tax up to ₹12 lakh in FY 2025-26 (rebate)", () => expect(estimateTax(1200000, rulesFor("2025-26").rules)).toBe(0));
  it("₹16 lakh in FY 2025-26 = ₹1,20,000 + 4% cess", () => expect(estimateTax(1600000, rulesFor("2025-26").rules)).toBe(124800));
  it("₹10 lakh in FY 2024-25 = ₹50,000 + cess", () => expect(estimateTax(1000000, rulesFor("2024-25").rules)).toBe(52000));
  it("later year reuses latest rules and flags it", () => expect(rulesFor("2026-27")).toMatchObject({ carriedForward: true, rules: { fy: "2025-26" } }));
});

describe("receivables", () => {
  it("one income entry pays only one matching invoice", () => {
    const inc = { id: "i1", txnType: "income", amount: 5000, date: "2026-05-10", merchant: "Acme Pvt Ltd" } as unknown as Expense;
    const s = receivableStatus([
      { id: "a", customer: "Acme", date: "2026-05-01", amount: 5000 },
      { id: "b", customer: "Acme", date: "2026-05-02", dueDate: "2026-05-20", amount: 5000 },
    ], [inc], "2026-05-30");
    expect(s[0]!.paidBy?.id).toBe("i1");
    expect(s[1]!.paidBy).toBeUndefined();
    expect(s[1]!.overdueDays).toBe(10);
  });
});

import { gstMonths } from "./receivables";
describe("GST by month", () => {
  it("output GST less bill GST for the month", () => {
    const bill = { id: "b", date: "2026-05-03", amount: 1180, scope: "business", receiptDetails: { tax: 180 }, fxRate: 1 } as unknown as Expense;
    const [m] = gstMonths([{ id: "a", customer: "Acme", date: "2026-05-01", amount: 11800, gst: 1800 }], [bill], ["2026-05"]);
    expect(m).toMatchObject({ outputGst: 1800, inputGst: 180, net: 1620, invoices: 1 });
  });
});
