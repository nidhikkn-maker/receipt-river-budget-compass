// RB-LED-01 pure rules: the withdrawal state machine and the single reader path (ledgerView) leaving withdrawn entries out of
// balances, cash flow, net worth, categories, card dues and loan principal. Hand-calculated figures.
import { describe, expect, it } from "vitest";
import { accountBalance, cashflow, ledgerView, netWorth, txnFromRow, type Account, type Txn } from "./ledger";
import { categoryTotals, type Expense } from "./expenses";
import { parseWithdrawal, restoreEntry, withdrawEntry, withdrawnAtOfRow, withWithdrawal } from "./withdrawal";

const bank: Account = { id: "bank", name: "Bank", kind: "savings", openingBalance: 10000, archived: false };
const card: Account = { id: "card", name: "Card", kind: "credit_card", openingBalance: 0, archived: false };
const loan: Account = { id: "loan", name: "Loan", kind: "loan", openingBalance: 100000, archived: false };
const who = (reason: string, at = "2026-11-10T10:00:00.000Z") => ({ by: "u1", at, reason });

describe("withdrawal state machine", () => {
  it("withdraw → restore → withdraw appends history; repeats and short reasons are refused; other details kept", () => {
    const w1 = withdrawEntry(null, who("Entered twice"));
    expect(w1).toMatchObject({ state: "withdrawn", reason: "Entered twice", history: [{ action: "withdrawn" }] });
    expect(() => withdrawEntry(w1, who("Again please"))).toThrow("already withdrawn");
    expect(() => restoreEntry(null, who("Nothing to restore"))).toThrow("not withdrawn");
    expect(() => withdrawEntry(null, who("abc"))).toThrow(/at least 5/);
    const w2 = restoreEntry(w1, who("Withdrawn by mistake", "2026-11-10T11:00:00.000Z"));
    const w3 = withdrawEntry(w2, who("Duplicate after all", "2026-11-10T12:00:00.000Z"));
    expect(w3.history.map((e) => e.action)).toEqual(["withdrawn", "restored", "withdrawn"]);
    expect(withWithdrawal({ tax: 18, items: [] }, w3)).toEqual({ tax: 18, items: [], withdrawal: w3 });
    expect(parseWithdrawal({})?.state).toBe("withdrawn"); // unreadable status fails closed (stays excluded)
    expect(withdrawnAtOfRow({ withdrawal: null })).toBeNull();
    expect(withdrawnAtOfRow({ receipt_details: { withdrawal: w2 } })).toBeNull();
    expect(withdrawnAtOfRow({ receipt_details: { withdrawal: w3 } })).toBe("2026-11-10T12:00:00.000Z");
  });
});

describe("ledgerView leaves withdrawn entries out of every figure", () => {
  const w = withdrawEntry(null, who("Entered twice"));
  const row = (o: Record<string, unknown>) => txnFromRow({ id: "x", expense_date: "2026-11-05", txn_type: "expense", amount: 0, account_id: "bank", ...o } as never);
  // Bank 10,000: groceries 2,000 (kept), duplicate groceries 2,000 (withdrawn), salary 50,000 (kept), card purchase 3,000 (kept),
  // card purchase 1,500 (withdrawn), card payment 3,000 bank→card (kept), EMI 5,000 bank→loan with 4,000 principal (withdrawn).
  const rows: Txn[] = [
    row({ id: "g1", amount: 2000 }),
    row({ id: "g2", amount: 2000, receipt_details: { withdrawal: w } }),
    row({ id: "s1", amount: 50000, txn_type: "income" }),
    row({ id: "c1", amount: 3000, account_id: "card" }),
    row({ id: "c2", amount: 1500, account_id: "card", withdrawal: w }),
    row({ id: "p1", amount: 3000, txn_type: "card_payment", to_account_id: "card" }),
    row({ id: "l1", amount: 5000, txn_type: "loan_repayment", to_account_id: "loan", principal: 4000, interest: 1000, original_amount: 5000, withdrawal: w }),
  ];
  const view = ledgerView(rows);
  it("balances, card due, loan outstanding, cash flow and net worth (hand-calculated)", () => {
    expect(view.map((t) => t.id)).toEqual(["g1", "s1", "c1", "p1"]);
    expect(accountBalance(bank, view)).toBe(10000 - 2000 + 50000 - 3000); // 55,000
    expect(accountBalance(card, view)).toBe(0); // 3,000 spent, 3,000 paid; the withdrawn 1,500 is not owed
    expect(accountBalance(loan, view)).toBe(100000); // the withdrawn EMI does not reduce principal
    expect(cashflow(view, "2026-11-01", "2026-11-30")).toEqual({ income: 50000, spent: 5000, net: 45000 });
    expect(netWorth([bank, card, loan], view).net).toBe(55000 - 0 - 100000);
    expect(categoryTotals(view.filter((t) => t.txnType === "expense").map((t) => ({ ...t, category: "Groceries" }) as unknown as Expense))).toEqual({ Groceries: 5000 });
  });
});
