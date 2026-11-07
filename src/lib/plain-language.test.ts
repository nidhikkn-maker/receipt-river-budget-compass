import { describe, expect, it } from "vitest";
import { cashflow, type Account, type Txn } from "./ledger";
import { canvasNarrative, describeMovement, statementStage, statusGuidance, couldNotMatch, PLAIN_TXN_LABEL, TXN_TYPES_COVERED } from "./plain-language";

const bank: Account = { id: "bank", name: "HDFC Savings", kind: "savings", openingBalance: 0, archived: false };
const bank2: Account = { id: "bank2", name: "IDFC Savings", kind: "savings", openingBalance: 0, archived: false };
const card: Account = { id: "card", name: "Amex", kind: "credit_card", openingBalance: 0, archived: false };
const accounts = [bank, bank2, card];

describe("plain transaction wording", () => {
  it("own-account transfer is described as moving money, not spending, and is not counted as spending", () => {
    const t: Txn = { id: "t", txnType: "transfer", amount: 5000, accountId: "bank", toAccountId: "bank2", date: "2026-04-03" };
    const w = describeMovement(t, accounts);
    expect(w.title).toBe("Money moved between my accounts");
    expect(w.countsAsSpending).toBe(false);
    expect(cashflow([t]).spent).toBe(0);
  });
  it("a transfer with an unconfirmed receiving account is never called an own-account transfer", () => {
    const w = describeMovement({ txnType: "transfer", accountId: "bank", toAccountId: null }, accounts);
    expect(w.title).not.toBe("Money moved between my accounts");
    expect(w.direction).toBe("unknown");
  });
  it("card bill payment is not duplicate spending: ₹2,000 charge + ₹2,000 payment counts ₹2,000 once", () => {
    const charge: Txn = { id: "c", txnType: "expense", amount: 2000, accountId: "card", date: "2026-04-01" };
    const pay: Txn = { id: "p", txnType: "card_payment", amount: 2000, accountId: "bank", toAccountId: "card", date: "2026-04-08" };
    expect(describeMovement(charge, accounts).title).toBe("Card charge");
    expect(describeMovement(pay, accounts).title).toBe("Card bill payment");
    expect(describeMovement(pay, accounts).countsAsSpending).toBe(false);
    expect(cashflow([charge, pay]).spent).toBe(2000);
  });
  it("records with no type are 'Needs identification', never guessed", () => {
    expect(describeMovement({ accountId: "bank" }, accounts).title).toBe("Needs identification");
  });
  it("every stored transaction type has a plain label", () => {
    for (const t of TXN_TYPES_COVERED) expect(PLAIN_TXN_LABEL[t]).toBeTruthy();
  });
});

describe("Intelligent Canvas narrative", () => {
  it("incomplete receipt evidence is never confident and asks for the missing total", () => {
    const n = canvasNarrative({ kind: "receipt", merchant: "Saravana Bhavan", amount: null, date: "2026-04-05", category: "Food" });
    expect(n.confident).toBe(false);
    expect(n.help).toContain("the total");
    expect(n.nextAction).toBe("Add the total");
  });
  it("a possible duplicate blocks confidence and points to comparison", () => {
    const n = canvasNarrative({ kind: "receipt", merchant: "Uber", amount: 320, currencyText: "₹320.00", date: "2026-04-05", category: "Travel", possibleDuplicate: true });
    expect(n.confident).toBe(false);
    expect(n.nextAction).toBe("Compare with the saved payment");
  });
  it("complete receipt with category asks to check and confirm", () => {
    const n = canvasNarrative({ kind: "receipt", merchant: "Uber", amount: 320, currencyText: "₹320.00", date: "2026-04-05", category: "Travel", categoryReason: "you chose Travel for Uber before" });
    expect(n.found).toBe("I found a receipt from Uber for ₹320.00 on 2026-04-05.");
    expect(n.belongs).toBe("I think this belongs to Travel because you chose Travel for Uber before. Please confirm.");
    expect(n.confident).toBe(true);
  });
  it("statement with 3 unmatched lines says so and offers one next action", () => {
    const n = canvasNarrative({ kind: "statement", lines: 42, unmatched: 3 });
    expect(n.match).toBe("I couldn't match these 3 payments.");
    expect(n.nextAction).toBe("Review 3 payments");
    expect(n.confident).toBe(false);
  });
});

describe("status and stage wording", () => {
  it("statuses explain what to do", () => {
    expect(statusGuidance("Ready to Confirm").action).toBe("Confirm");
    expect(statusGuidance("draft").meaning).toContain("doesn't count");
    expect(statusGuidance("failed").action).toBe("Try again");
  });
  it("statement stage is Saved only after confirmed save", () => {
    expect(statementStage({ files: 1, reading: false, planned: true, pendingDecisions: 0, confirmedSaved: false })).toBe("Organised");
    expect(statementStage({ files: 1, reading: false, planned: true, pendingDecisions: 2, confirmedSaved: false })).toBe("Needs your review");
    expect(statementStage({ files: 1, reading: true, planned: false, pendingDecisions: 0, confirmedSaved: false })).toBe("Reading");
    expect(statementStage({ files: 1, reading: false, planned: true, pendingDecisions: 0, confirmedSaved: true })).toBe("Saved");
  });
  it("couldNotMatch", () => { expect(couldNotMatch(1)).toBe("I couldn't match this payment."); expect(couldNotMatch(0)).toBe("Every payment matched."); });
});
