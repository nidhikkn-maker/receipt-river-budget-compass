import { describe, expect, it } from "vitest";
import { suggestTransfers, transferImpact, transferPairBlocker } from "./transfer-match";
import { auditRecords } from "./transfer-audit";
import { accountBalance, cashflow, type Account } from "./ledger";
import type { Expense } from "./expenses";

const A: Account = { id: "a", name: "IDFC Personal 10178745345", kind: "savings", openingBalance: 100000, archived: false };
const B: Account = { id: "b", name: "SBI 20012349876", kind: "savings", openingBalance: 0, archived: false };
const e = (p: Partial<Expense>): Expense => ({ id: "x", title: "t", merchant: null, category: "Other", amount: 50000, currency: "INR", originalAmount: 50000, fxRate: 1, date: "2026-10-01", description: "", receipts: [], splits: [], scope: "personal", txnType: "expense", accountId: "a", reconciledAt: null, statementRef: null, ...p } as unknown as Expense);
const debit = e({ id: "d", description: "IMPS 612345678901 TO SBI 9876" });
const credit = e({ id: "c", txnType: "income", accountId: "b", description: "IMPS 612345678901 FROM IDFC" });

describe("internal transfers", () => {
  it('blocks a different posting date rather than shifting the receiving balance date',()=>{expect(transferPairBlocker(debit,{...credit,date:'2026-10-02'})).toContain('posting dates');expect(suggestTransfers([debit,{...credit,date:'2026-10-02'}],[A,B],[])[0]?.strength).toBe('ambiguous');});
  it('blocks equal original amounts with independently different INR values',()=>{expect(transferPairBlocker({...debit,currency:'USD',originalAmount:500},{...credit,currency:'USD',originalAmount:500,amount:50100})).toContain('currency values');});
  it('does not suppress a receiving entry with a linked claim',()=>{expect(transferPairBlocker(debit,{...credit,reimbursementStatus:'pending'})).toContain('linked financial details');});
  it('rejects an outgoing transfer as receiving evidence',()=>{expect(transferPairBlocker(debit,{...credit,txnType:'transfer',toAccountId:'a'})).toContain('not incoming');});
  it("pairs a ₹50,000 debit and credit with a shared reference as one strong match", () => {
    const s = suggestTransfers([debit, credit], [A, B], []);
    expect(s).toHaveLength(1); expect(s[0]?.strength).toBe("strong"); expect(s[0]?.credit?.id).toBe("c");
  });
  it("never treats identical amounts alone as strong", () => {
    const s = suggestTransfers([e({ id: "d2" }), e({ id: "c2", txnType: "income", accountId: "b" })], [A, B], []);
    expect(s[0]?.strength).toBe("weak");
  });
  it("two equally likely credits stay ambiguous", () => {
    const s = suggestTransfers([debit, credit, { ...credit, id: "c3" }], [A, B], []);
    expect(s[0]?.strength).toBe("ambiguous");
  });
  it("already-linked entries are not suggested again", () => {
    const link = { id: "l", debit_id: "d", credit_id: "c", source_account: "a", dest_account: "b", status: "matched", cancelled_at: null, source_amount: 50000, source_currency: "INR", created_at: "" };
    expect(suggestTransfers([debit, credit], [A, B], [link])).toHaveLength(0);
  });
  it("after linking, income and spending do not include the transfer and balances are unchanged", () => {
    const before = [debit, credit];
    const after = [{ ...debit, txnType: "transfer" as const, toAccountId: "b" }, { ...credit, transferCounterpartOf: "d" }];
    expect(cashflow(after)).toEqual({ income: 0, spent: 0, net: 0 });
    expect(accountBalance(A, after)).toBe(accountBalance(A, before));
    expect(accountBalance(B, after)).toBe(accountBalance(B, before));
    expect(transferImpact(debit, credit)).toEqual({ incomeChange: -50000, spendingChange: -50000, newPostings: 0 });
  });
});

describe("records check (read-only)", () => {
  it("reports a transfer counted as spending and income without changing anything", () => {
    const txns = [debit, credit]; const copy = JSON.stringify(txns);
    const f = auditRecords(txns, [A, B], []);
    expect(f.map((x) => x.issue).sort()).toEqual(["transfer_as_expense", "transfer_as_income"]);
    expect(f[0]?.confidence).toBe("high");
    expect(JSON.stringify(txns)).toBe(copy);
  });
  it("ignores records before April 2026", () => {
    expect(auditRecords([{ ...debit, date: "2026-03-01" }, { ...credit, date: "2026-03-01" }], [A, B], [])).toHaveLength(0);
  });
  it("flags a statement line missing from records", () => {
    const f = auditRecords([], [A], [{ id: "s", accountId: "a", currency: "INR", from: "2026-10-01", to: "2026-10-31", lines: [{ ref: "1", date: "2026-10-05", description: "UPI SHOP", amount: 4500, direction: "debit" }] }]);
    expect(f[0]?.issue).toBe("missing_in_ledger");
  });
});
