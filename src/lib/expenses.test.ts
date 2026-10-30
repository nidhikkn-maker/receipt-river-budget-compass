import { describe, expect, it } from "vitest";
import { approve, canReview, createExpense, reimburse, reject, USERS } from "./expenses";

const u = (id: string) => USERS.find((x) => x.id === id)!;
const emp = u("u-emp-1"); // Engineering
const engMgr = u("u-mgr-1");
const salesMgr = u("u-mgr-2");
const fin = u("u-fin-1");
const receipt = { name: "r.png", type: "image/png", dataUrl: "data:," };
const fresh = () => createExpense(emp, { title: "x", category: "Meals", amount: 50, date: "2026-10-01", description: "", receipts: [receipt] });

describe("approval workflow", () => {
  it("new expense waits for the department manager", () => expect(fresh().status).toBe("pending_manager"));
  it("requires a receipt", () => expect(() => createExpense(emp, { title: "x", category: "Meals", amount: 5, date: "", description: "", receipts: [] })).toThrow());
  it("manager of another department cannot review", () => expect(canReview(salesMgr, fresh())).toBe(false));
  it("finance cannot skip manager review", () => expect(() => approve(fresh(), fin)).toThrow());
  it("manager approval forwards to finance, then finance approves", () => {
    const a = approve(fresh(), engMgr);
    expect(a.status).toBe("pending_finance");
    expect(approve(a, fin).status).toBe("approved");
  });
  it("only approved expenses can be reimbursed", () => {
    expect(() => reimburse(fresh(), fin)).toThrow();
    expect(reimburse(approve(approve(fresh(), engMgr), fin), fin).status).toBe("reimbursed");
  });
  it("rejection needs a reason", () => expect(() => reject(fresh(), engMgr, " ")).toThrow());
});
