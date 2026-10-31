import { describe, expect, it } from "vitest";
import { advanceReconRows, advanceReconciliation, type TravelTrip } from "./travel";
import { loanBalanceChart, loanHistory } from "./loan-history";

const trip: TravelTrip = { id: "t1", name: "Delhi", start: "2026-10-01", end: "2026-10-05", budget: 0, advances: [{ id: "a", date: "2026-09-30", amount: 20000, source: "MOVAC" }] } as TravelTrip;
const base = { tags: ["Trip: Delhi"], originalAmount: null, workspaceAllocations: [] };

describe("advance reconciliation", () => {
  it("₹20,000 advance − ₹12,000 business spend − ₹5,000 returned leaves ₹3,000 outstanding", () => {
    const txns = [
      { ...base, id: "e1", date: "2026-10-02", amount: 12000, scope: "business", txnType: "expense", category: "Hotels" },
      { ...base, id: "e2", date: "2026-10-03", amount: 800, scope: "personal", txnType: "expense", category: "Meals" },
      { ...base, id: "r1", date: "2026-10-06", amount: 5000, scope: "business", txnType: "advance_settlement", tripId: "t1", tags: [] },
    ];
    const r = advanceReconciliation(trip, txns as never);
    expect([r.advances, r.expenses, r.returns, r.outstanding]).toEqual([20000, 12000, 5000, 3000]);
  });
  it("spending above the advance shows money owed to you", () => {
    const r = advanceReconciliation(trip, [{ ...base, id: "e1", date: "2026-10-02", amount: 25000, scope: "business", txnType: "expense", category: "Hotels" }] as never);
    expect(r.outstanding).toBe(-5000);
  });
});

describe("loan repayment history", () => {
  it("totals principal and interest and walks the balance down to today's outstanding", () => {
    const h = loanHistory("L", 90000, [
      { id: "p1", date: "2026-08-05", amount: 10000, txnType: "loan_repayment", toAccountId: "L", principal: 9000, interest: 1000 },
      { id: "p2", date: "2026-09-05", amount: 10000, txnType: "loan_repayment", toAccountId: "L", principal: 9100, interest: 900 },
      { id: "x", date: "2026-09-06", amount: 500, txnType: "loan_repayment", toAccountId: "other", principal: null, interest: null },
    ]);
    expect(h.totalPrincipal).toBe(18100); expect(h.totalInterest).toBe(1900);
    expect(h.rows.map((r) => [r.balanceBefore, r.balanceAfter])).toEqual([[108100, 99100], [99100, 90000]]);
  });
  it("an unsplit repayment counts fully as principal", () => {
    expect(loanHistory("L", 0, [{ id: "p", date: "2026-01-01", amount: 500, txnType: "loan_repayment", toAccountId: "L", principal: null, interest: null }]).totalInterest).toBe(0);
  });
});

describe("trip advance CSV", () => {
  const rows = advanceReconRows(trip, [
    { ...base, id: "e1", date: "2026-10-02", amount: 12000, scope: "business", txnType: "expense", category: "Hotels" },
    { ...base, id: "r1", date: "2026-10-06", amount: 5000, scope: "business", txnType: "advance_settlement", tripId: "t1", tags: [] },
  ] as never);
  it("lists each advance, expense and return with its amount, oldest first", () => {
    expect(rows[0]).toEqual(["Date", "Type", "Item", "Amount"]);
    expect(rows.slice(1, 4)).toEqual([
      ["2026-09-30", "Advance received", "Advance from MOVAC", "20000"],
      ["2026-10-02", "Trip expense (business/official)", "Trip expense", "12000"],
      ["2026-10-06", "Returned to advance", "Advance returned", "5000"],
    ]);
  });
  it("ends with the four totals and the outstanding balance to return", () => {
    expect(rows.slice(4)).toEqual([
      ["", "Total advances received", "", "20000"],
      ["", "Total trip expenses", "", "12000"],
      ["", "Total returned", "", "5000"],
      ["", "Outstanding — to return", "", "3000"],
    ]);
  });
  it("names the outstanding row as owed to you when spending passed the advance", () => {
    const owed = advanceReconRows(trip, [{ ...base, id: "e1", date: "2026-10-02", amount: 25000, scope: "business", txnType: "expense", category: "Hotels" }] as never);
    expect(owed.at(-1)).toEqual(["", "Outstanding — owed to you", "", "-5000"]);
  });
});

describe("loan balance chart", () => {
  const h = loanHistory("L", 90000, [
    { id: "p1", date: "2026-08-05", amount: 10000, txnType: "loan_repayment", toAccountId: "L", principal: 9000, interest: 1000 },
    { id: "p2", date: "2026-09-05", amount: 10000, txnType: "loan_repayment", toAccountId: "L", principal: 9100, interest: 900 },
  ]);
  it("starts at the balance before the first repayment and ends at today's outstanding", () => {
    expect(loanBalanceChart(h.rows)).toEqual([
      { label: "Opening", balance: 108100 },
      { label: "2026-08-05", balance: 99100 },
      { label: "2026-09-05", balance: 90000 },
    ]);
  });
  it("has no points when nothing has been repaid yet", () => {
    expect(loanBalanceChart(loanHistory("L", 90000, []).rows)).toEqual([]);
  });
});
