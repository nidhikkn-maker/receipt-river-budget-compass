import { describe, expect, it } from "vitest";
import { CATEGORIES, type Expense, type StatementLine } from "./expenses";
import type { Account } from "./ledger";
import type { CategorySetting } from "./preferences";
import { planStatementRegistration, type StatementContext } from "./statement-auto";

const categories: CategorySetting[] = CATEGORIES.map((name) => ({ name, archived: false }));
const savings: Account = { id: "acc1", name: "HDFC Savings", kind: "savings", openingBalance: 0, archived: false };

const expense = (o: Partial<Expense> & { id: string }): Expense => ({
  title: "", merchant: null, category: "Miscellaneous", scope: "personal", memberId: null, splits: [],
  amount: 0, currency: "INR", originalAmount: 0, fxRate: 1, paymentMethod: "other", reconciledAt: null,
  statementRef: null, date: "2026-10-01", description: "", receipts: [], ...o,
});

const ctx = (over: Partial<StatementContext> = {}): StatementContext => ({
  transactions: [], accounts: [savings], categories, accountId: "acc1", currency: "INR", ...over,
});

const line = (o: Partial<StatementLine> & { description: string; amount: number }): StatementLine => ({
  ref: crypto.randomUUID(), date: "2026-10-05", direction: "debit", ...o,
});

describe("statement-to-action groups", () => {
  it("holds back a near-match as a possible duplicate instead of registering it", () => {
    // Same amount five days apart with no shared merchant words: score 0.5, below the 0.7 skip bar.
    const existing = expense({ id: "e1", title: "Village market", merchant: "Village market", amount: 1200, originalAmount: 1200, date: "2026-09-30" });
    const plan = planStatementRegistration([line({ description: "UPI-LOCALSTORE-9921", amount: 1200 })], [], ctx({ transactions: [existing] }));
    expect(plan.register).toHaveLength(0);
    expect(plan.possibleDuplicates).toHaveLength(1);
    expect(plan.possibleDuplicates[0]!.existing.id).toBe("e1");
  });

  it("still skips lines that clearly match an existing record (no duplicate offered)", () => {
    const existing = expense({ id: "e1", title: "Swiggy order", merchant: "Swiggy", amount: 450, originalAmount: 450, date: "2026-10-05" });
    const plan = planStatementRegistration([line({ description: "UPI-SWIGGY ORDER-4512", amount: 450 })], [], ctx({ transactions: [existing] }));
    expect(plan.register).toHaveLength(0);
    expect(plan.possibleDuplicates).toHaveLength(0);
    expect(plan.skipped).toHaveLength(1);
  });

  it("registers genuinely new lines and flags unsure categories for a check", () => {
    const plan = planStatementRegistration([line({ description: "XYZZY QQQ 12345", amount: 777 })], [], ctx());
    expect(plan.register).toHaveLength(1);
    expect(plan.register[0]!.uncertain).toBe(true);
    expect(plan.register[0]!.reason).toContain("category unsure");
  });

  it("does not flag keyword-matched categories as uncertain", () => {
    const plan = planStatementRegistration([line({ description: "UPI-SWIGGY ORDER-4512", amount: 450 })], [], ctx());
    expect(plan.register[0]!.uncertain).toBeFalsy();
  });

  it("hints when a merchant being registered already appears 3+ times in history", () => {
    const history = [1, 2, 3].map((n) => expense({ id: `e${n}`, merchant: "Netflix", title: "Netflix", amount: 649, originalAmount: 649, date: `2026-0${n}-15` }));
    const plan = planStatementRegistration([line({ description: "UPI-NETFLIX-9921", amount: 649, date: "2026-10-15" })], [], ctx({ transactions: history }));
    expect(plan.register).toHaveLength(1);
    expect(plan.recurringHints).toHaveLength(1);
    expect(plan.recurringHints[0]).toMatchObject({ merchant: "Netflix", count: 3 });
  });

  it("never duplicates on a repeated import: everything already in the ledger is skipped", () => {
    const history = [
      expense({ id: "e1", merchant: "Swiggy", title: "Swiggy", amount: 450, originalAmount: 450, date: "2026-10-05" }),
      expense({ id: "e2", merchant: "Amazon", title: "Amazon", amount: 1200, originalAmount: 1200, date: "2026-10-06" }),
    ];
    const lines = [line({ description: "UPI-SWIGGY ORDER-4512", amount: 450, date: "2026-10-05" }), line({ description: "AMAZON INDIA 9911", amount: 1200, date: "2026-10-06" })];
    const plan = planStatementRegistration(lines, [], ctx({ transactions: history }));
    expect(plan.register).toHaveLength(0);
    expect(plan.possibleDuplicates).toHaveLength(0);
    expect(plan.skipped).toHaveLength(2);
  });
});
