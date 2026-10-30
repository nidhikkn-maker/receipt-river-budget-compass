import { describe, expect, it } from "vitest";
import { accountBalance, cashflow, netWorth, validateTransfer, type Account, type Txn } from "./ledger";

const bank: Account = { id: "bank", name: "HDFC", kind: "savings", openingBalance: 100000, archived: false };
const card: Account = { id: "amex", name: "AMEX", kind: "credit_card", openingBalance: 0, archived: false };
const t = (o: Partial<Txn>): Txn => ({ id: Math.random().toString(), amount: 0, date: "2026-10-10", ...o });

describe("ledger", () => {
  it("adding an expense lowers the account balance and counts as spending", () => {
    const txns = [t({ txnType: "expense", amount: 2500, accountId: "bank" })];
    expect(accountBalance(bank, txns)).toBe(97500);
    expect(cashflow(txns).spent).toBe(2500);
  });
  it("a transfer between own accounts is not income or spending", () => {
    const cash: Account = { id: "cash", name: "Cash", kind: "cash", openingBalance: 0, archived: false };
    const txns = [t({ txnType: "transfer", amount: 5000, accountId: "bank", toAccountId: "cash" })];
    expect(cashflow(txns)).toEqual({ income: 0, spent: 0, net: 0 });
    expect(accountBalance(bank, txns)).toBe(95000);
    expect(accountBalance(cash, txns)).toBe(5000);
  });
  it("paying a card bill settles the card without counting the purchase twice", () => {
    const txns = [
      t({ txnType: "expense", amount: 3000, accountId: "amex" }),
      t({ txnType: "transfer", amount: 3000, accountId: "bank", toAccountId: "amex" }),
    ];
    expect(cashflow(txns).spent).toBe(3000);
    expect(accountBalance(card, txns)).toBe(0);
    expect(accountBalance(bank, txns)).toBe(97000);
  });
  it("refunds reduce spending and restore the account", () => {
    const txns = [t({ txnType: "expense", amount: 1000, accountId: "bank" }), t({ txnType: "refund", amount: 400, accountId: "bank" })];
    expect(cashflow(txns).spent).toBe(600);
    expect(accountBalance(bank, txns)).toBe(99400);
  });
  it("net worth is assets minus card dues", () => {
    expect(netWorth([bank, card], [t({ txnType: "expense", amount: 2000, accountId: "amex" })])).toEqual({ assets: 100000, liabilities: 2000, net: 98000 });
  });
  it("a transfer needs two different accounts", () => {
    expect(() => validateTransfer({ accountId: "bank", toAccountId: "bank" })).toThrow();
  });
});
