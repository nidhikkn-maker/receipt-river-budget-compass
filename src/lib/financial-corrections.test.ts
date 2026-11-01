import { describe, expect, it } from "vitest";
import type { Expense } from "./expenses";
import type { Account } from "./ledger";
import { correctionPreview, correctionStillCurrent } from "./financial-corrections";
import type { FinancialReview } from "./financial-review";
const bank: Account = { id: "bank", name: "Bank", kind: "savings", openingBalance: 10000, archived: false };
const card: Account = { ...bank, id: "card", name: "Card", kind: "credit_card" };
const e: Expense = { id: "copy", correctionRevision: 0, title: "Card settlement", merchant: null, category: "Miscellaneous", scope: "personal", memberId: null, splits: [], amount: 1000, originalAmount: 10, currency: "USD", fxRate: 100, paymentMethod: "bank_transfer", reconciledAt: "2026-10-31", statementRef: "original", date: "2026-10-20", description: "Untouched", receipts: [], accountId: "bank", txnType: "expense" };
const row = (t = e): FinancialReview => ({ transaction: t, issues: [], group: "type", status: "Suggested Correction", confidence: "medium", targetAccountIds: [], evidence: [] });
describe("exact financial correction previews", () => {
  it("card settlement removes 1000 spending, reduces card owed by 1000 and preserves saved FX", () => {
    const p = correctionPreview([row()], { txnType: "card_payment", toAccountId: "card" }, [bank, card], [e]);
    expect(p.spendingChange).toBe(-1000); expect(p.incomeChange).toBe(0);
    expect(p.balanceChanges.map(a => a.change)).toEqual([0, -1000]);
    expect(p.after[0]).toMatchObject({ amount: 1000, originalAmount: 10, fxRate: 100, statementRef: "original", description: "Untouched", reconciledAt: null });
    expect(e.txnType).toBe("expense");
  });
  it("account correction moves the exact effect from old account to new account", () => {
    const p = correctionPreview([row()], { accountId: "card" }, [bank, card], [e]);
    expect(p.balanceChanges.map(a => a.change)).toEqual([1000, 1000]); expect(p.spendingChange).toBe(0);
  });
  it("requires both different active accounts", () => {
    expect(() => correctionPreview([row()], { txnType: "transfer" }, [bank], [e])).toThrow("two different");
    expect(() => correctionPreview([row()], { txnType: "transfer", toAccountId: "bank" }, [bank], [e])).toThrow("two different");
  });
  it("rejects card settlement to a bank", () => { expect(() => correctionPreview([row()], { txnType: "card_payment", toAccountId: "other" }, [bank, { ...bank, id: "other" }], [e])).toThrow("does not match"); });
  it("never converts a tracked claim to a movement", () => { expect(() => correctionPreview([row({ ...e, reimbursementStatus: "pending" })], { txnType: "card_payment", toAccountId: "card" }, [bank, card], [e])).toThrow("Linked claims"); });
  it("blocks a possible receiving-side record rather than doubling its credit", () => { expect(() => correctionPreview([row()], { txnType: "card_payment", toAccountId: "card" }, [bank, card], [e, { ...e, id: "counterpart", accountId: "card", txnType: "refund" }])).toThrow("receiving-side"); });
  it("uses reviewed loan split in original currency", () => {
    const loan = { ...card, id: "loan", kind: "loan" as const };
    const p = correctionPreview([row()], { txnType: "loan_repayment", toAccountId: "loan", principal: 8, interest: 2 }, [bank, loan], [e]);
    expect(p.spendingChange).toBe(-800); expect(p.balanceChanges[1]?.change).toBe(-800);
    expect(() => correctionPreview([row()], { txnType: "loan_repayment", toAccountId: "loan" }, [bank, loan], [e])).toThrow("principal");
  });
  it("invalidates changed records or changed account kind", () => {
    const p = correctionPreview([row()], { txnType: "card_payment", toAccountId: "card" }, [bank, card], [e]);
    expect(correctionStillCurrent(p, [e], [bank, card])).toBe(true);
    expect(correctionStillCurrent(p, [{ ...e, correctionRevision: 1 }], [bank, card])).toBe(false);
    expect(correctionStillCurrent(p, [e], [bank, { ...card, kind: "savings" }])).toBe(false);
  });
});