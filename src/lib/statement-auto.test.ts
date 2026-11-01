import { describe, expect, it } from "vitest";
import { CATEGORIES, type Expense, type StatementLine } from "./expenses";
import { accountBalance, cashflow, type Account } from "./ledger";
import type { CategorySetting } from "./preferences";
import { classifyStatementLine, cleanMerchant, draftToInput, planStatementRegistration, type StatementContext } from "./statement-auto";

const categories: CategorySetting[] = CATEGORIES.map((name) => ({ name, archived: false }));
const savings: Account = { id: "acc1", name: "HDFC Savings", kind: "savings", openingBalance: 0, archived: false };
const card: Account = { id: "acc2", name: "ICICI Card", kind: "credit_card", openingBalance: 0, archived: false };

const expense = (o: Partial<Expense> & { id: string }): Expense => ({
  title: "", merchant: null, category: "Miscellaneous", scope: "personal", memberId: null, splits: [],
  amount: 0, currency: "INR", originalAmount: 0, fxRate: 1, paymentMethod: "other", reconciledAt: null,
  statementRef: null, date: "2026-10-01", description: "", receipts: [], accountId: "acc1", ...o,
});

const ctx = (over: Partial<StatementContext> = {}): StatementContext => ({
  transactions: [], accounts: [savings, card], categories, accountId: "acc1", currency: "INR", ...over,
});

const line = (o: Partial<StatementLine> & { description: string; amount: number }): StatementLine => ({
  ref: "L1", date: "2026-10-05", direction: "debit", ...o,
});

describe("statement auto-registration", () => {
  it("classifies credit-card repayments as payments, never income, and requires an unknown source", () => {
    const credit = line({ description: "PAYMENT RECEIVED THANK YOU", amount: 50000, direction: "credit" });
    const draft = classifyStatementLine(credit, ctx({ accountId: card.id }));
    expect(draft.txnType).toBe("card_payment"); expect(draft.accountId).toBeNull(); expect(draft.toAccountId).toBe(card.id);
    expect(planStatementRegistration([credit], [], ctx({ accountId: card.id })).register).toHaveLength(0);
    expect(planStatementRegistration([credit], [], ctx({ accountId: card.id })).review).toHaveLength(1);
  });
  it("reuses a uniquely identified existing payment and reduces dues once without income", () => {
    const payment = expense({ id: "payment", title: "Card payment received", txnType: "card_payment", accountId: savings.id, toAccountId: card.id, amount: 50000, originalAmount: 50000, date: "2026-10-05", reconciledAt: "2026-10-05" });
    const credit = line({ description: "Card payment received", amount: 50000, direction: "credit" });
    const context = ctx({ accountId: card.id, transactions: [payment] });
    expect(classifyStatementLine(credit, context).existingPaymentId).toBe("payment");
    const plan = planStatementRegistration([credit], [], context);
    expect(plan.skipped).toHaveLength(1); expect(plan.register).toHaveLength(0);
    expect(accountBalance({ ...card, openingBalance: 75000 }, [payment])).toBe(25000);
    expect(accountBalance({ ...savings, openingBalance: 100000 }, [payment])).toBe(50000);
    expect(cashflow([payment], "2026-10-01", "2026-10-31")).toMatchObject({ income: 0, spent: 0 });
  });
  it("does not infer the source from amount alone or ambiguous payments", () => {
    const credit = line({ description: "PAYMENT RECEIVED", amount: 50000, direction: "credit" });
    const payment = expense({ id: "one", title: "Unrelated", txnType: "card_payment", accountId: savings.id, toAccountId: card.id, amount: 50000, originalAmount: 50000, date: "2026-10-05" });
    expect(classifyStatementLine(credit, ctx({ accountId: card.id, transactions: [payment] })).existingPaymentId).toBeUndefined();
    expect(classifyStatementLine(credit, ctx({ accountId: card.id, transactions: [{ ...payment, title: "Payment received" }, { ...payment, id: "two", title: "Payment received" }] })).existingPaymentId).toBeUndefined();
  });
  it("registers an UPI food purchase as an expense in Food and beverages", () => {
    const draft = classifyStatementLine(line({ description: "UPI-SWIGGY ORDER-4512", amount: 450 }), ctx());
    expect(draft.txnType).toBe("expense");
    expect(draft.category).toBe("Food and beverages");
    expect(draft.paymentMethod).toBe("upi");
    expect(draft.scope).toBe("personal");
    expect(draft.title).toBe("Upi Swiggy Order");
  });

  it("sorts shopping, bills and bank charges into their own categories", () => {
    const c = ctx();
    expect(classifyStatementLine(line({ description: "AMAZON INDIA 9911", amount: 1200 }), c).category).toBe("Shopping");
    expect(classifyStatementLine(line({ description: "AIRTEL POSTPAID BILL", amount: 799 }), c).category).toBe("Utility bills");
    expect(classifyStatementLine(line({ description: "AIRTEL POSTPAID BILL PAYMENT", amount: 799 }), c).txnType).toBe("expense");
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
    expect(cleanMerchant("swiggy order 4512")).toBe("Swiggy Order");
    expect(cleanMerchant("POS PURCHASE SWIGGY 123456789012")).toBe("Pos Purchase Swiggy");
    expect(cleanMerchant("")).toBe("Statement entry");
  });

  it("builds a saveable entry from a draft", () => {
    const draft = classifyStatementLine(line({ description: "DMART GROCERIES 4512", amount: 2340.55 }), ctx({ currency: "INR" }));
    const input = draftToInput(draft);
    expect(input).toMatchObject({
      title: "Dmart Groceries", category: "Groceries", scope: "personal", amount: 2340.55,
      currency: "INR", paymentMethod: "other", date: "2026-10-05", txnType: "expense",
      accountId: "acc1", description: "Statement import",
    });
  });
});
