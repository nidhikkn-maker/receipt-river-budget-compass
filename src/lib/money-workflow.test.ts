import { describe, expect, it } from "vitest";
import { addMoney, roundMoney, proportionMoney } from "./money";
import { accountBalance, cashflow, netWorth, type Account, type Txn } from "./ledger";
import { allocateByPercent, categoryTotals, convert, validateAllocations } from "./expenses";
import { loanHistory, loanHistoryRows } from "./loan-history";
import { balanceAddsUp, fromStatementLines, projectBalance } from "./statement-pipeline/line";
import { allocatePayments } from "./books/recon";
import type { GstInvoice } from "./books/types";

describe("decimal money boundaries", () => {
  it("uses symmetric half-up rounding and rejects nonfinite/unsafe amounts", () => {
    expect([roundMoney(1.005), roundMoney(-1.005), roundMoney(2.675)]).toEqual([1.01, -1.01, 2.68]);
    expect(addMoney(0.1, 0.2)).toBe(0.3);
    expect(proportionMoney(1.005, 1, 1)).toBe(1.01);
    expect(() => roundMoney(Infinity)).toThrow();
    expect(() => roundMoney("9007199254740991")).toThrow();
  });
});

describe("connected ledger, statement, repayment and export figures (isolated records)", () => {
  const accounts: Account[] = [
    { id: "bank", name: "Test bank", kind: "savings", openingBalance: 1000, archived: false },
    { id: "loan", name: "Test loan", kind: "loan", openingBalance: 500, archived: false },
    { id: "card", name: "Test card", kind: "credit_card", openingBalance: 0, archived: false },
  ];
  const repayment = { id: "repay", date: "2026-10-05", txnType: "loan_repayment" as const, accountId: "bank", toAccountId: "loan", amount: 83, originalAmount: 1, principal: 0.9, interest: 0.1 };
  const txns: Txn[] = [repayment,
    { id: "purchase", date: "2026-10-02", txnType: "expense", accountId: "card", amount: 0.3 },
    { id: "settle", date: "2026-10-03", txnType: "card_payment", accountId: "bank", toAccountId: "card", amount: 0.3 },
    { id: "counterpart", date: "2026-10-03", txnType: "income", accountId: "bank", amount: 0.3, transferCounterpartOf: "settle" },
  ];
  it("preserves principal/interest in stored INR all the way to the CSV", () => {
    const bank = accounts[0], loan = accounts[1], card = accounts[2];
    if (!bank || !loan || !card) throw Error("Missing test accounts");
    expect(accountBalance(bank, txns)).toBe(916.7);
    expect(accountBalance(card, txns)).toBe(0);
    const outstanding = accountBalance(loan, txns);
    expect(outstanding).toBe(425.3);
    expect(cashflow(txns)).toEqual({ income: 0, spent: 8.6, net: -8.6 });
    expect(netWorth(accounts, txns)).toEqual({ assets: 916.7, liabilities: 425.3, net: 491.4 });
    const hist = loanHistory("loan", outstanding, [repayment, { ...repayment, id: "evidence", transferCounterpartOf: repayment.id }]);
    expect(hist.rows).toHaveLength(1);
    expect(hist.rows[0]).toMatchObject({ amount: 83, principal: 74.7, interest: 8.3, balanceBefore: 500, balanceAfter: 425.3 });
    expect(loanHistoryRows(hist, outstanding)[1]).toEqual(["2026-10-05", "83", "74.7", "8.3", "425.3"]);
  });
  it("reconciles fractional statement totals with ledger projections without changing the source", () => {
    const bank = accounts[0];
    if (!bank) throw Error("Missing bank");
    const lines = fromStatementLines("test.csv", [{ ref: "a", date: "2026-10-03", description: "Card settlement", amount: 0.3 }, { ref: "b", date: "2026-10-05", description: "Repayment", amount: 83 }]);
    expect(balanceAddsUp(1000, 916.7, lines)).toBe(0);
    expect(projectBalance(1000, lines, accountBalance(bank, txns))).toMatchObject({ after: 916.7, difference: 0, ok: true });
    expect(txns[0]).toMatchObject({ originalAmount: 1, principal: 0.9, interest: 0.1 });
  });
  it("reconciles rounded allocations and category figures after exact FX conversion", () => {
    const amount = convert(1.005, 1);
    expect(amount).toBe(1.01);
    const allocations = allocateByPercent(amount, [{ category: "A", pct: 50 }, { category: "B", pct: 50 }]);
    expect(allocations).toEqual([{ category: "A", amount: 0.51 }, { category: "B", amount: 0.5 }]);
    expect(() => validateAllocations(allocations, amount)).not.toThrow();
    expect(categoryTotals([{ category: "Unused", amount, allocations }])).toEqual({ A: 0.51, B: 0.5 });
  });
  it("allocates decimal receipts once and retains the exact invoice remainder", () => {
    const invoice = { id: "i", number: "INV-01", date: "2026-10-01", taxable: 2.3, igst: 0, cgst: 0, sgst: 0, cess: 0 } as GstInvoice;
    const result = allocatePayments([invoice], [0.1, 0.2].map((amount, i) => ({ id: `p${i}`, amount, date: "2026-10-02", text: "INV-01" })), "2026-10-03");
    expect(result.lines[0]).toMatchObject({ allocated: 0.3, outstanding: 2, status: "part", payments: ["p0", "p1"] });
    expect(result.unallocated).toBe(0);
  });
});