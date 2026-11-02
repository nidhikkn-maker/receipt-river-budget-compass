import { describe, expect, it } from "vitest";
import { suggestForEntry, accountFromText } from "./single-entry";
import { CATEGORIES, type Expense } from "../expenses";
import type { Account } from "../ledger";

const categories = CATEGORIES.map((name) => ({ name, archived: false }));
const savings: Account = { id: "s", name: "HDFC Savings", kind: "savings", openingBalance: 0, archived: false };
const amex: Account = { id: "c", name: "AMEX Platinum", kind: "credit_card", openingBalance: 0, archived: false };
const accounts = [savings, amex];
const tx = (o: Partial<Expense> & { id: string }): Expense => ({ title: "", merchant: null, category: "Miscellaneous", scope: "personal", memberId: null, splits: [], amount: 0, currency: "INR", originalAmount: 0, fxRate: 1, paymentMethod: "other", reconciledAt: null, statementRef: null, date: "2026-10-01", description: "", receipts: [], accountId: "s", ...o } as Expense);
const base = { date: "2026-10-01", amount: 500, currency: "INR", txnType: "expense" as const, text: "", accountId: "s" };

describe("New entry uses Statement Desk rules", () => {
  it("suggests a category from the description", () => {
    expect(suggestForEntry({ ...base, text: "SWIGGY order" }, { transactions: [], accounts, categories }).category).toBe("Food and beverages");
  });
  it("finds the account named in the text", () => {
    expect(accountFromText("paid via amex", accounts)?.id).toBe("c");
    expect(suggestForEntry({ ...base, accountId: null, text: "AMEX Platinum dinner" }, { transactions: [], accounts, categories }).accountId).toBe("c");
  });
  it("spots a card payment to a known card", () => {
    const s = suggestForEntry({ ...base, text: "AMEX Platinum card payment" }, { transactions: [], accounts, categories });
    expect(s.txnType).toBe("card_payment");
    expect(s.toAccountId).toBe("c");
  });
  it("flags a saved entry with the same amount and date", () => {
    const s = suggestForEntry({ ...base, text: "Swiggy" }, { transactions: [tx({ id: "e1", originalAmount: 500, amount: 500, merchant: "Swiggy" })], accounts, categories });
    expect(s.matches[0]?.record.id).toBe("e1");
    expect(s.matches[0]?.exact).toBe(true);
  });
  it("never infers a transfer from amount alone", () => {
    const s = suggestForEntry({ ...base, text: "groceries" }, { transactions: [tx({ id: "in", originalAmount: 500, amount: 500, txnType: "income", accountId: "c" })], accounts, categories });
    expect(s.txnType).toBeUndefined();
    expect(s.opposite).toBeUndefined();
  });
  it("finds the already-saved other side of a transfer", () => {
    const s = suggestForEntry({ ...base, txnType: "transfer", text: "move" }, { transactions: [tx({ id: "in", originalAmount: 500, amount: 500, txnType: "income", accountId: "c" })], accounts, categories });
    expect(s.opposite?.id).toBe("in");
  });
});
