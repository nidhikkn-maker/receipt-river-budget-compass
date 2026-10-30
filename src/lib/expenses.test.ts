import { describe, expect, it } from "vitest";
import { canReimburse, canReview, departmentSpend, validateBudget, validateSubmission, type Expense, type User } from "./expenses";

const emp: User = { id: "e1", name: "E", role: "employee", department: "Engineering" };
const engMgr: User = { id: "m1", name: "M", role: "manager", department: "Engineering" };
const salesMgr: User = { id: "m2", name: "S", role: "manager", department: "Sales" };
const fin: User = { id: "f1", name: "F", role: "finance", department: "Operations" };
const exp = (status: Expense["status"], amount = 50): Expense => ({
  id: "x", employeeId: emp.id, department: "Engineering", title: "t", merchant: null, category: "Meals",
  amount, date: "2026-10-01", description: "", receipts: [], status, history: [],
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
    expect(() => validateSubmission({ title: "a", category: "Meals", amount: 5, date: "2026-01-01", description: "", merchant: null, receiptCount: 0 })).toThrow());
  it("budgets cannot be negative", () => expect(() => validateBudget(-1)).toThrow());
  it("rejected expenses don't count against budget", () => {
    const s = departmentSpend([exp("rejected", 100), exp("approved", 40), exp("pending_manager", 10)], "Engineering", { Engineering: 1000, Sales: 0, Marketing: 0, Operations: 0 });
    expect(s).toMatchObject({ committed: 40, pending: 10, budget: 1000 });
  });
});
