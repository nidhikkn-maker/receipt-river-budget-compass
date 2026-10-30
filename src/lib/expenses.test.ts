import { describe, expect, it } from "vitest";
import { canReimburse, canReview, departmentSpend, validateBudget, validateSubmission, type Expense, type User } from "./expenses";

const emp: User = { id: "e1", name: "E", role: "employee", department: "Engineering" };
const engMgr: User = { id: "m1", name: "M", role: "manager", department: "Engineering" };
const salesMgr: User = { id: "m2", name: "S", role: "manager", department: "Sales" };
const fin: User = { id: "f1", name: "F", role: "finance", department: "Operations" };
const exp = (status: Expense["status"], amount = 50): Expense => ({
  id: "x", employeeId: emp.id, department: "Engineering", title: "t", merchant: null, category: "Meals",
  amount, currency: "USD", originalAmount: amount, fxRate: 1, paymentMethod: "cash", reconciledAt: null, statementRef: null, date: "2026-10-01", description: "", receipts: [], status, history: [],
});

describe("approval workflow", () => {
  it("department manager reviews first", () => expect(canReview(engMgr, exp("pending_manager"))).toBe(true));
  it("manager of another department cannot review", () => expect(canReview(salesMgr, exp("pending_manager"))).toBe(false));
  it("finance cannot skip manager review", () => expect(canReview(fin, exp("pending_manager"))).toBe(false));
  it("finance signs off after the manager", () => expect(canReview(fin, exp("pending_finance"))).toBe(true));
  it("nobody reviews their own expense", () => expect(canReview({ ...engMgr, id: emp.id }, exp("pending_manager"))).toBe(false));
  it("only finance pays approved expenses", () => {
    expect(canReimburse(fin, exp("approved"))).toBe(true);
    expect(canReimburse(fin, exp("pending_finance"))).toBe(false);
    expect(canReimburse(engMgr, exp("approved"))).toBe(false);
  });
  it("a receipt is required", () =>
    expect(() => validateSubmission({ title: "a", category: "Meals", amount: 5, date: "2026-01-01", description: "", merchant: null, currency: "USD", paymentMethod: "cash", receiptCount: 0 })).toThrow());
  it("budgets cannot be negative", () => expect(() => validateBudget(-1)).toThrow());
  it("rejected expenses don't count against budget", () => {
    const s = departmentSpend([exp("rejected", 100), exp("approved", 40), exp("pending_manager", 10)], "Engineering", { Engineering: 1000, Sales: 0, Marketing: 0, Operations: 0 });
    expect(s).toMatchObject({ committed: 40, pending: 10, budget: 1000 });
  });
});

import { autoMatch, convert, parseStatementCsv } from "./expenses";
describe("currency & reconciliation", () => {
  const inr: Expense = { ...exp("approved", 10.51), currency: "INR", originalAmount: 1000, fxRate: 0.010509, merchant: "Uber", paymentMethod: "upi", reconciledAt: null, statementRef: null } as Expense;
  it("converts with the day's rate, to cents", () => expect(convert(1000, 0.010509)).toBe(10.51));
  it("parses DD/MM/YYYY bank CSVs with a debit column", () => {
    const l = parseStatementCsv("Date,Narration,Debit,Credit\n01/10/2026,UPI-UBER INDIA,1000.00,\n02/10/2026,SALARY,,50000");
    expect(l).toEqual([{ ref: "L1", date: "2026-10-01", description: "UPI-UBER INDIA", amount: 1000 }]);
  });
  it("matches a statement line in the bill's own currency", () => {
    const [m] = autoMatch([{ ref: "L1", date: "2026-10-02", description: "UBER", amount: 1000 }], [inr], "INR");
    expect(m!.expense?.id).toBe("x");
  });
  it("does not match when the amount is off by more than 3%", () => {
    const [m] = autoMatch([{ ref: "L1", date: "2026-10-01", description: "UBER", amount: 1100 }], [inr], "INR");
    expect(m!.expense).toBeNull();
  });
});
