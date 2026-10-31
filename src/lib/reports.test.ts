import { describe, expect, it } from "vitest";
import { buildReport, toCsv } from "./reports";
import type { Expense } from "./expenses";

const e = (patch: Partial<Expense>): Expense => ({ id: "expense", title: "Lunch", merchant: "Cafe", category: "Meals", scope: "business", memberId: null, splits: [], amount: 100, originalAmount: 100, currency: "INR", fxRate: 1, paymentMethod: "upi", date: "2026-10-31", reconciledAt: null, statementRef: null, receipts: [], description: "", department: "Sales", ...patch });
const name = () => "Me";
describe("requested exports", () => {
  it("expenses exclude transfers and reimbursement payments", () => {
    const r = buildReport("expenses", [e({}), e({ txnType: "transfer" }), e({ txnType: "reimbursement" })], name, {});
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.[10]).toBe("100.00");
  });
  it("payment export contains received money rather than pending claim amounts", () => {
    const claim = e({ reimbursementStatus: "pending", reimbursement: { payer: "Employer", reimbursable: 80, receipts: [{ id: "receipt", txnId: "payment", date: "2026-10-31", amount: 40 }] } });
    const payment = e({ id: "payment", txnType: "reimbursement", amount: 40, originalAmount: 40, merchant: null, accountId: "bank" });
    const r = buildReport("reimbursement-payments", [claim, payment], name, {}, { accountName: () => "Bank" });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toEqual(["2026-10-31", "Lunch", "Employer", "Lunch", "Sales", "Bank", "INR", "40.00", "40.00", "payment"]);
  });
  it("department totals count split expenses once and compare a selected month", () => {
    const rows = [e({ allocations: [{ category: "Meals", amount: 60 }, { category: "Travel", amount: 40 }] }), e({ id: "old", date: "2026-09-01", amount: 50 }), e({ txnType: "reimbursement", amount: 40 })];
    const r = buildReport("departments", rows, name, {}, { departmentBudgets: { Sales: 200, Finance: 300 }, budgetMonth: "2026-10" });
    expect(r.rows).toContainEqual(["Sales", 2, "150.00", "2026-10", "200.00", "100.00", "100.00", "50.00"]);
    expect(r.rows).toContainEqual(["Finance", 0, "0.00", "2026-10", "300.00", "0.00", "300.00", "0.00"]);
  });
  it("missing departments or budgets are explicit rather than invented", () => {
    expect(buildReport("departments", [e({ department: null })], name, {}, { budgetMonth: "2026-10" }).rows[0]).toEqual(["Unassigned", 1, "100.00", "2026-10", "", "100.00", "", ""]);
  });
  it("CSV escapes quotes, commas and spreadsheet formulas", () => {
    expect(toCsv({ title: "Test", headers: ["Value"], rows: [['=SUM(1,2)'], ['a,"b"']] })).toBe('Value\n"\'=SUM(1,2)"\n"a,""b"""');
  });
});