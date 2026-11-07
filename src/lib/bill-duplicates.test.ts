import { describe, expect, it } from "vitest";
import { duplicateBills } from "./bill-duplicates";
import type { Expense } from "./expenses";
const entry = { id: "saved", merchant: "Shop & Co.", date: "2026-10-31", originalAmount: 10, amount: 840, currency: "USD", txnType: "expense" } as Expense;
const bill = { merchant: "shop co", date: "2026-10-31", amount: 10, currency: "USD" };
describe("bulk bill duplicates", () => {
  it("matches merchant, bill date and original currency amount", () => expect(duplicateBills(bill, [entry])).toEqual([entry]));
  it("does not confuse converted INR with the original bill", () => expect(duplicateBills({ ...bill, amount: 840 }, [entry])).toEqual([]));
  it("does not match a different currency", () => expect(duplicateBills({ ...bill, currency: "INR" }, [entry])).toEqual([]));
  it("does not match a different date", () => expect(duplicateBills({ ...bill, date: "2026-10-30" }, [entry])).toEqual([]));
  it("excludes the entry being edited and non-expense movements", () => { expect(duplicateBills(bill, [entry], "saved")).toEqual([]); expect(duplicateBills(bill, [{ ...entry, txnType: "transfer" }])).toEqual([]); });
  it("rejects missing merchants and invalid amounts", () => { expect(duplicateBills({ ...bill, merchant: "" }, [entry])).toEqual([]); expect(duplicateBills({ ...bill, amount: NaN }, [entry])).toEqual([]); });
});