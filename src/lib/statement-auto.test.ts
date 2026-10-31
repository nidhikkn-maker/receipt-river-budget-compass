import { describe, expect, it } from "vitest";
import { CATEGORIES, type Expense, type StatementLine } from "./expenses";
import type { Account } from "./ledger";
import type { CategorySetting } from "./preferences";
import { classifyStatementLine, cleanMerchant, draftToInput, planStatementRegistration, type StatementContext } from "./statement-auto";

const categories: CategorySetting[] = CATEGORIES.map((name) => ({ name, archived: false }));
const savings: Account = { id: "acc1", name: "HDFC Savings", kind: "savings", openingBalance: 0, archived: false };
const card: Account = { id: "acc2", name: "ICICI Card", kind: "credit_card", openingBalance: 0, archived: false };

const expense = (o: Partial<Expense> & { id: string }): Expense => ({
  title: "", merchant: null, category: "Miscellaneous", scope: "personal", memberId: null, splits: [],
  amount: 0, currency: "INR", originalAmount: 0, fxRate: 1, paymentMethod: "other", reconciledAt: null,
  statementRef: null, date: "2026-10-01", description: "", receipts: [], ...o,
});

const ctx = (over: Partial<StatementContext> = {}): StatementContext => ({
  transactions: [], accounts: [savings, card], categories, accountId: "acc1", currency: "INR", ...over,
});

const line = (o: Partial<StatementLine> & { description: string; amount: number }): StatementLine => ({
  ref: "L1", date: "2026-10-05", direction: "debit", ...o,
});

describe("statement auto-registration", () => {
  it("registers an UPI food purchase as an expense in Food and beverages", () => {
    const draft = classifyStatementLine(line({ description: "UPI-SWIGGY ORDER-4512", amount: 450 }), ctx());
    expect(draft.txnType).toBe("expense");
    expect(draft.category).toBe("Food and beverages");
    expect(draft.paymentMethod).toBe("upi");
    expect(draft.scope).toBe("personal");
    expect(draft.title).toBe("Upi swiggy order");
  });

  it("sorts shopping, bills and bank charges into their own categories", () => {
    const c = ctx();
    expect(classifyStatementLine(line({ description: "AMAZON INDIA 9911", amount: 1200 }), c).category).toBe("Shopping");
    expect(classifyStatementLine(line({ description: "AIRTEL POSTPAID BILL", amount: 799 }), c).category).toBe("Utility bills");
    expect(classifyStatementLine(line({ description: "MINIMUM BALANCE CHARGES", amount: 450 }), c).category).toBe("Financial charges");
    expect(classifyStatementLine(line({ description: "SOMEUNKNOWN VENDOR 77", amount: 300 }), c).category).toBe("Miscellaneous");
  });

  it("sends transfers, cash withdrawals and card payments to review instead of guessing", () => {
    const c = ctx();
    const atm = classifyStatementLine(line({ description: "ATM CASH WDL 5000", amount: 5000 }), c);
    expect(atm.txnType).toBe("transfer");
    const cardPayment = classifyStatementLine(line({ description: "ICICI CREDIT CARD PAYMENT 12345", amount: 8000 }), c);
    expect(cardPayment.txnType).toBe("transfer");
    const plan = planStatementRegistration([atm.line, cardPayment.line], [], c);
    expect(plan.review).toHaveLength(2);
    expect(plan.register).toHaveLength(0);
  });

  it("reads credits as refunds or income and registers them", () => {
    const c = ctx();
    const refund = classifyStatementLine(line({ description: "AMAZON REFUND 4512", amount: 900, direction: "credit" }), c);
    const salary = classifyStatementLine(line({ description: "SALARY CREDIT SEP", amount: 95000, direction: "credit" }), c);
    expect(refund.txnType).toBe("refund");
    expect(salary.txnType).toBe("income");
    const plan = planStatementRegistration([refund.line, salary.line], [], c);
    expect(plan.register.map((d) => d.txnType)).toEqual(["refund", "income"]);
  });

  it("asks before saving an unclear credit", () => {
    const draft = classifyStatementLine(line({ description: "SOMEONE 4512", amount: 2000, direction: "credit" }), ctx());
    expect(draft.reason).toMatch(/confirm it is income/i);
    expect(planStatementRegistration([draft.line], [], ctx()).review).toHaveLength(1);
  });

  it("skips lines already matched or already in the ledger", () => {
    const matched = line({ ref: "M1", description: "SWIGGY ORDER 4512", amount: 450 });
    const dupe = line({ ref: "D1", description: "ZOMATO ORDER 8899", amount: 620, date: "2026-10-06" });
    const transactions = [
      expense({ id: "e1", title: "Swiggy", merchant: "Swiggy", category: "Food and beverages", amount: 450, originalAmount: 450, date: "2026-10-05" }),
      expense({ id: "e2", title: "Zomato", merchant: "Zomato", category: "Food and beverages", amount: 620, originalAmount: 620, date: "2026-10-06" }),
    ];
    const plan = planStatementRegistration([matched, dupe], [{ line: matched, expense: transactions[0]!, score: 1 }], ctx({ transactions }));
    expect(plan.skipped.map((s) => s.line.ref)).toEqual(["M1", "D1"]);
    expect(plan.skipped[0]!.reason).toMatch(/Already matched/);
    expect(plan.skipped[1]!.reason).toBe("Already in your ledger");
    expect(plan.register).toHaveLength(0);
  });

  it("reuses what was saved for the same merchant before", () => {
    const transactions = [expense({
      id: "e1", title: "Swiggy", merchant: "Swiggy", category: "Food and beverages", scope: "business",
      paymentMethod: "credit_card", amount: 450, originalAmount: 450, date: "2026-09-01", accountId: "acc2",
    })];
    const draft = classifyStatementLine(line({ description: "SWIGGY 987654", amount: 1200 }), ctx({ transactions }));
    expect(draft.category).toBe("Food and beverages");
    expect(draft.scope).toBe("business");
    expect(draft.paymentMethod).toBe("credit_card");
  });

  it("uses the credit card account's own payment method for card swipes", () => {
    const draft = classifyStatementLine(line({ description: "POS VISA PURCHASE CAFE 4512", amount: 350 }), ctx({ accountId: "acc2" }));
    expect(draft.paymentMethod).toBe("credit_card");
    expect(draft.category).toBe("Food and beverages");
  });

  it("cleans narration into a readable merchant name", () => {
    expect(cleanMerchant("swiggy order 4512")).toBe("Swiggy order");
    expect(cleanMerchant("POS PURCHASE SWIGGY 123456789012")).toBe("POS PURCHASE SWIGGY");
    expect(cleanMerchant("")).toBe("Statement entry");
  });

  it("builds a saveable entry from a draft", () => {
    const draft = classifyStatementLine(line({ description: "DMART GROCERIES 4512", amount: 2340.55 }), ctx({ currency: "INR" }));
    const input = draftToInput(draft);
    expect(input).toMatchObject({
      title: "Dmart groceries", category: "Groceries", scope: "personal", amount: 2340.55,
      currency: "INR", paymentMethod: "other", date: "2026-10-05", txnType: "expense",
      accountId: "acc1", description: "Statement import",
    });
  });
});
