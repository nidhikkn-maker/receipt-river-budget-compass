import { describe, expect, it } from "vitest";
import { cardLedger } from "./card-balance";
import { accountBalance, cashflow, type Account } from "./ledger";

const card: Account = { id: "amex", name: "AMEX", kind: "credit_card", openingBalance: 0, archived: false };
const spend = { id: "s1", txnType: "expense" as const, amount: 75000, accountId: "amex", date: "2026-10-01", reconciledAt: "x" };
const pay = { id: "p1", txnType: "card_payment" as const, amount: 50000, accountId: "idfc", toAccountId: "amex", date: "2026-10-10", reconciledAt: null };

describe("card balance", () => {
  it("a ₹50,000 payment lowers ₹75,000 owed to ₹25,000", () => {
    expect(cardLedger(card, [spend, pay]).outstanding).toBe(25000);
  });
  it("running balance matches the ledger balance", () => {
    expect(cardLedger(card, [spend, pay]).outstanding).toBe(accountBalance(card, [spend, pay]));
  });
  it("a card payment never counts as income", () => {
    expect(cashflow([pay]).income).toBe(0);
  });
  it("a payment without a statement match is flagged", () => {
    const r = cardLedger(card, [spend, pay]);
    expect(r.unreconciled.count).toBe(1);
    expect(r.lines[0]?.issue).toBe("Not matched to a card statement yet");
  });
  it("a reconciled payment is not flagged", () => {
    expect(cardLedger(card, [spend, { ...pay, reconciledAt: "y" }]).unreconciled.count).toBe(0);
  });
});
