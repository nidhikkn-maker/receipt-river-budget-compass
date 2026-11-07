import { describe, expect, it } from "vitest";
import { differingFields, duplicatePairsFromItems, markSeparate } from "./duplicate-compare";
import type { Expense } from "./expenses";
import type { InboxItem } from "./inbox";

const e = (id: string, over: Partial<Expense> = {}) => ({ id, title: "Swiggy", merchant: "Swiggy", date: "2026-10-01", amount: 450, originalAmount: 450, currency: "INR", accountId: "acc", category: "Food", txnType: "expense", description: "", receipts: [], statementRef: null, ...over }) as unknown as Expense;
const item = (key: string) => ({ key, type: "duplicate" }) as InboxItem;

describe("duplicate comparison", () => {
  it("skips pairs marked as separate", () => {
    const txns = [e("a"), e("b")];
    expect(duplicatePairsFromItems([item("dup:a:b")], txns, [])).toHaveLength(1);
    expect(duplicatePairsFromItems([item("dup:a:b")], txns, ["dup:a:b"])).toHaveLength(0);
  });
  it("highlights only fields that differ", () => {
    expect(differingFields(e("a"), e("b", { description: "UPI ref 1" }))).toEqual(["description"]);
  });
  it("remembers a separate pair once", () => {
    expect(markSeparate(markSeparate([], "dup:a:b"), "dup:a:b")).toEqual(["dup:a:b"]);
  });
});
