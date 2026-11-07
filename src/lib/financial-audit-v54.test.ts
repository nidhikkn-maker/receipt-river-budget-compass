import { describe, expect, it } from "vitest";
import { accountBalance, cashflow, type Account } from "./ledger";
import type { Expense } from "./expenses";
import { workspaceTotals } from "./workspaces";
import { outstandingOf, receivedOf } from "./reimbursements";
import { position, assistantFacts } from "./position";
import { buildReport } from "./reports";

const bank: Account = { id: "audit-bank", name: "V5.4 sample bank", kind: "savings", openingBalance: 100000, archived: false };
const card: Account = { ...bank, id: "audit-card", kind: "credit_card", openingBalance: 0 };
const entry = (p: Partial<Expense> = {}): Expense => ({
  id: "audit-expense", title: "V5.4 controlled sample", merchant: "Sample merchant", category: "Travel",
  scope: "personal", memberId: null, splits: [], amount: 10000, currency: "INR", originalAmount: 10000,
  fxRate: 1, paymentMethod: "bank_transfer", reconciledAt: null, statementRef: null, date: "2026-04-10",
  description: "In-memory audit only", receipts: [], txnType: "expense", accountId: bank.id, tags: [], ...p,
});
const input = (transactions: Expense[]) => ({ accounts: [bank], transactions, commitments: [], goals: [], loans: [], today: "2026-04-20", days: 30 });
const claim = (received = 0) => entry({ scope: "business", reimbursementStatus: "pending", reimbursement: { stage: received ? "partial" : "submitted", reimbursable: 10000, payer: "Sample organisation", receipts: received ? [{ id: "audit-receipt", txnId: "audit-receipt", date: "2026-04-12", amount: received }] : [] } });

describe("V5.4 F-001–F-008 exact financial outcomes — no cloud writes", () => {
  it("F-001: ₹100,000 less ₹2,500 gives ₹97,500 and ₹2,500 spending", () => {
    const tx = [entry({ amount: 2500, originalAmount: 2500 })];
    expect(accountBalance(bank, tx)).toBe(97500); expect(cashflow(tx).spent).toBe(2500); expect(position(input(tx)).cash).toBe(97500);
  });
  it("F-002: ₹15,000 transfer gives ₹85,000 / ₹35,000, no income or spending", () => {
    const other: Account = { ...bank, id: "audit-other", openingBalance: 20000 };
    const tx = [entry({ txnType: "transfer", amount: 15000, originalAmount: 15000, toAccountId: other.id })];
    expect(accountBalance(bank, tx)).toBe(85000); expect(accountBalance(other, tx)).toBe(35000);
    expect(accountBalance(bank, tx) + accountBalance(other, tx)).toBe(120000); expect(cashflow(tx)).toEqual({ income: 0, spent: 0, net: 0 });
  });
  it("F-003: ₹10,000 card purchase leaves bank ₹100,000 and card liability ₹10,000", () => {
    const tx = [entry({ accountId: card.id })];
    expect(accountBalance(bank, tx)).toBe(100000); expect(accountBalance(card, tx)).toBe(10000); expect(cashflow(tx).spent).toBe(10000);
  });
  it("F-004: ₹10,000 card settlement leaves bank ₹90,000/card zero, spending still ₹10,000", () => {
    const tx = [entry({ accountId: card.id }), entry({ id: "audit-settlement", txnType: "card_payment", toAccountId: card.id })];
    expect(accountBalance(bank, tx)).toBe(90000); expect(accountBalance(card, tx)).toBe(0); expect(cashflow(tx).spent).toBe(10000);
  });
  it("F-005: ₹2,000 refund gives bank ₹92,000 and net spending ₹8,000", () => {
    const tx = [entry(), entry({ id: "audit-refund", txnType: "refund", amount: 2000, originalAmount: 2000 })];
    expect(accountBalance(bank, tx)).toBe(92000); expect(cashflow(tx).spent).toBe(8000);
  });
  it("F-006: one ₹10,000 payment allocates ₹4,000 Personal / ₹6,000 Business", () => {
    const tx = [entry({ workspaceAllocations: [{ workspace: "personal", amount: 4000 }, { workspace: "business", amount: 6000 }] })];
    expect(accountBalance(bank, tx)).toBe(90000); expect(cashflow(tx).spent).toBe(10000);
    expect(workspaceTotals(tx)).toEqual({ personal: 4000, family: 0, business: 6000, official: 0, total: 10000 });
  });
  it("F-007: personally funded ₹10,000 business expense has a separate ₹10,000 receivable", () => {
    const c = claim(); const tx = [c];
    expect(accountBalance(bank, tx)).toBe(90000); expect(cashflow(tx).spent).toBe(10000);
    expect(workspaceTotals(tx).business).toBe(10000); expect(outstandingOf(c)).toBe(10000);
  });
  it("F-008: ₹6,000 receipt leaves ₹4,000 owed, bank ₹96,000 and income zero", () => {
    const c = claim(6000); const tx = [c, entry({ id: "audit-receipt", txnType: "reimbursement", amount: 6000, originalAmount: 6000 })];
    expect(receivedOf(c)).toBe(6000); expect(outstandingOf(c)).toBe(4000); expect(accountBalance(bank, tx)).toBe(96000); expect(cashflow(tx).income).toBe(0);
  });
});

describe("V5.4 financial defect regressions — no cloud writes", () => {
  it("D-FIN-001: Home and AI must quote ₹4,000 remaining, not the ₹10,000 original claim", () => {
    const tx = [claim(6000)];
    expect(position(input(tx)).reimbursements.pendingAmount).toBe(4000);
    expect(assistantFacts(input(tx)).actual.pendingReimbursements.pendingAmount).toBe(4000);
  });
  it("D-FIN-002: legacy Business report must include the ₹6,000 workspace share", () => {
    const tx = [entry({ workspaceAllocations: [{ workspace: "personal", amount: 4000 }, { workspace: "business", amount: 6000 }] })];
    expect(buildReport("business", tx, () => "Sample person", {}).rows.reduce((sum, row) => sum + Number(row[10]), 0)).toBe(6000);
  });
  it("D-FIN-003: manual ₹1,100 repayment (₹980 principal/₹120 interest) reduces only principal", () => {
    const loan: Account = { ...bank, id: "audit-loan", kind: "loan", openingBalance: 10000 };
    const tx = [entry({ txnType: "loan_repayment", amount: 1100, originalAmount: 1100, toAccountId: loan.id, principal: 980, interest: 120 })];
    expect(accountBalance(loan, tx)).toBe(9020); expect(cashflow(tx).spent).toBe(120);
    expect(accountBalance(bank, tx)).toBe(98900);
  });
  it("D-FIN-001: fully received, written-off and untracked records do not inflate pending claims", () => {
    const tx = [claim(10000), entry({ reimbursementStatus: "pending", reimbursement: { stage: "written_off" } }), entry(), entry({ txnType: "reimbursement", reimbursementStatus: "pending" })];
    expect(position(input(tx)).reimbursements).toEqual({ pendingCount: 0, pendingAmount: 0 });
  });
  it("D-FIN-002: foreign-currency Business share and category splits use stored INR exactly once", () => {
    const tx = [entry({ currency: "USD", originalAmount: 100, fxRate: 100, workspaceAllocations: [{ workspace: "personal", amount: 40 }, { workspace: "business", amount: 60 }], allocations: [{ category: "Travel", amount: 4000 }, { category: "Food", amount: 6000 }] })];
    const r = buildReport("business", tx, () => "Sample person", {});
    expect(Number(r.rows[0]?.[8])).toBe(60); expect(Number(r.rows[0]?.[10])).toBe(6000);
    const cats = buildReport("categories", tx, () => "Sample person", {});
    expect(cats.rows.reduce((s, r) => s + Number(r[1]), 0)).toBe(6000);
    expect(cats.rows.reduce((s, r) => s + Number(r[2]), 0)).toBe(4000);
  });
  it("D-FIN-003: foreign repayment uses stored INR, legacy principal and separate EMI charges stay compatible", () => {
    const loan: Account = { ...bank, id: "audit-loan", kind: "loan", openingBalance: 10000 };
    const foreign = entry({ txnType: "loan_repayment", amount: 1100, originalAmount: 11, toAccountId: loan.id, principal: 9.8, interest: 1.2 });
    expect(accountBalance(loan, [foreign])).toBe(9020); expect(cashflow([foreign]).spent).toBe(120);
    const legacy = entry({ txnType: "loan_repayment", amount: 980, originalAmount: 980, toAccountId: loan.id });
    const fee = entry({ id: "fee", amount: 120, originalAmount: 120 });
    expect(accountBalance(loan, [legacy, fee])).toBe(9020); expect(cashflow([legacy, fee]).spent).toBe(120);
  });
});