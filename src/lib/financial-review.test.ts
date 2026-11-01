import { describe, expect, it } from "vitest";
import { financialReview, categoryReviewPreview, previewStillCurrent } from "./financial-review";
import { inboxItems, inboxCounts } from "./inbox";
import { defaultPreferences } from "./preferences";
import { accountBalance, cashflow, type Account } from "./ledger";
import type { Expense } from "./expenses";

const bank: Account = { id: "bank", name: "Personal bank", kind: "savings", openingBalance: 300000, archived: false, lastFour: "1234" };
const card: Account = { id: "card", name: "Amex", kind: "credit_card", openingBalance: 250000, archived: false, lastFour: "5678" };
const e = (p: Partial<Expense> = {}): Expense => ({ id: "one", title: "Unknown purchase", merchant: null, category: "Miscellaneous", scope: "personal", memberId: null, splits: [], amount: 100, currency: "INR", originalAmount: 100, fxRate: 1, paymentMethod: "upi", reconciledAt: null, statementRef: "April statement", date: "2026-04-01", description: "Original narration", receipts: [], txnType: "expense", accountId: bank.id, ...p });
const prefs = defaultPreferences();
const items = (tx: Expense[]) => inboxItems({ transactions: tx, accounts: [bank, card], commitments: [], prefs, today: "2026-11-01", pendingCount: 0 });
const review = (tx: Expense[], accounts = [bank, card]) => financialReview(items(tx), tx, accounts, prefs.categories.map(c => c.name));

describe("V5.9 evidence and financial preservation", () => {
  it("retains April 1 2026 issues beyond the old 120-day horizon", () => {
    expect(items([e()]).some(i => i.type === "uncategorised")).toBe(true);
  });
  it("deduplicates several issues into one selectable transaction", () => {
    expect(items([e({ accountId: null })]).filter(i => i.transactionId === "one")).toHaveLength(3);
    expect(review([e({ accountId: null })])).toHaveLength(1);
  });
  it("does not mark missing information corrected through dismissal", () => {
    const all = items([e({ accountId: null })]);
    expect(inboxCounts(all, all.map(i => i.key)).open.filter(i => i.transactionId === "one")).toHaveLength(3);
  });
  it("suggests the stated 250000 Amex bill payment for type confirmation, never category bulk approval", () => {
    const original = e({ title: "Ecom Indiaideas Amexcard Amexbillpayment", amount: 250000, originalAmount: 250000 });
    const r = review([original])[0];
    expect(r?.suggestedType).toBe("card_payment");
    expect(r?.targetAccountIds).toEqual(["card"]);
    expect(r?.group).toBe("type");
    expect(original.txnType).toBe("expense");
    expect(() => categoryReviewPreview(review([original]), "Groceries")).toThrow();
  });
  it("keeps incomplete or ambiguous card evidence for review", () => {
    const cards = [card, { ...card, id: "card2" }];
    const r = review([e({ title: "Amexbillpayment" })], [bank, ...cards])[0];
    expect(r?.targetAccountIds).toHaveLength(2);
    expect(r?.confidence).toBe("medium");
  });
  it("does not infer own transfer from equal amounts alone", () => {
    const tx = [e({ description: "UPI" }), e({ id: "two", accountId: "card", txnType: "income", category: "Income" })];
    expect(review(tx)[0]?.suggestedType).toBeUndefined();
  });
  it("requires reciprocal identifiers as well as amount/date/direction for a possible internal transfer", () => {
    const other: Account = { ...bank, id: "other", lastFour: "9876" };
    const tx = [e({ description: "To account 9876" }), e({ id: "two", accountId: "other", txnType: "income", description: "From account 1234" })];
    expect(review(tx, [bank, other])[0]?.suggestedType).toBe("transfer");
  });
  it("never assigns purpose from generic UPI merchant narration", () => {
    const tx = [e({ merchant: "UPI" }), e({ id: "two", merchant: "UPI", category: "Groceries", reconciledAt: "2026-04-02" }), e({ id: "three", merchant: "UPI", category: "Groceries", reconciledAt: "2026-04-02" })];
    expect(review(tx)[0]?.suggestedCategory).toBeUndefined();
  });
  it("shows a merchant category suggestion only with verified same-responsibility evidence", () => {
    const tx = [e({ merchant: "Store" }), e({ id: "two", merchant: "Store", category: "Groceries", reconciledAt: "2026-04-02" }), e({ id: "three", merchant: "Store", category: "Groceries", reconciledAt: "2026-04-03" })];
    expect(review(tx)[0]?.suggestedCategory).toBe("Groceries");
    tx[2] = { ...tx[2], department: "Different organisation" } as Expense;
    expect(review(tx)[0]?.suggestedCategory).toBeUndefined();
  });
  it("does not generalise a merchant with different legitimate purposes", () => {
    const tx = [e({ merchant: "Store" }), e({ id: "two", merchant: "Store", category: "Groceries", reconciledAt: "2026-04-02" }), e({ id: "three", merchant: "Store", category: "Shopping", reconciledAt: "2026-04-03" })];
    expect(review(tx)[0]?.suggestedCategory).toBeUndefined();
  });
  it("previews exact category records without changing original data, account balances or cashflow", () => {
    const tx = [e()]; const saved = JSON.stringify(tx);
    const p = categoryReviewPreview(review(tx), "Groceries");
    expect(p.records.map(x => x.id)).toEqual(["one"]);
    expect([p.amount, p.balanceChange, p.spendingChange, p.incomeChange]).toEqual([100, 0, 0, 0]);
    const changed = tx.map(t => ({ ...t, category: p.category }));
    expect(accountBalance(bank, changed)).toBe(accountBalance(bank, tx));
    expect(cashflow(changed)).toEqual(cashflow(tx));
    expect(JSON.stringify(tx)).toBe(saved);
    expect(changed[0]?.description).toBe("Original narration");
    expect(changed[0]?.reconciledAt).toBeNull();
  });
  it("blocks confirmation after source, responsibility or category revision changes", () => {
    const tx = [e()]; const p = categoryReviewPreview(review(tx), "Groceries");
    expect(previewStillCurrent(p, tx)).toBe(true);
    for (const patch of [{ amount: 101 }, { department: "Other" }, { categoryRevision: 2 }]) expect(previewStillCurrent(p, [{ ...tx[0], ...patch } as Expense])).toBe(false);
    expect(previewStillCurrent(p, [])).toBe(false);
  });
  it("category confirmation closes only the category issue, not outstanding statement review", () => {
    const original=e();const p=categoryReviewPreview(review([original]),"Groceries");
    const corrected={...original,category:p.category};
    const remaining=items([corrected]).filter(i=>i.transactionId===original.id);
    expect(remaining.map(i=>i.type)).toEqual(['unverified_import']);
    expect(original.category).toBe('Miscellaneous');
    expect(accountBalance(bank,[corrected])).toBe(accountBalance(bank,[original]));
  });
  it("blocks duplicate, missing account, and split records from bulk categorisation", () => {
    for (const tx of [[e({ accountId: null })], [e(), e({ id: "two" })]]) expect(() => categoryReviewPreview(review(tx), "Groceries")).toThrow();
  });
  it("transfer and card settlements do not add income or spending", () => {
    const tx = [e({ txnType: "transfer", toAccountId: "other", amount: 1000 }), e({ id: "two", txnType: "card_payment", toAccountId: "card", amount: 250000 })];
    expect(cashflow(tx).spent).toBe(0);
    expect(cashflow(tx).income).toBe(0);
    expect(accountBalance(card, tx)).toBe(0);
  });
});
describe("suggested category settles", () => {
  it("does not suggest the category a transaction already has", () => {
    const peer = (id: string) => e({ id, merchant: "Opt Gst", category: "Financial charges", reconciledAt: "2026-11-01" });
    const target = e({ id: "t", merchant: "Opt Gst", category: "Financial charges" });
    const other = e({ id: "u", merchant: "Opt Gst", category: "Miscellaneous" });
    const rows = review([peer("p1"), peer("p2"), target, other]);
    expect(rows.find(r => r.transaction.id === "t")?.suggestedCategory).toBeUndefined();
    expect(rows.find(r => r.transaction.id === "u")?.suggestedCategory).toBe("Financial charges");
  });
});
