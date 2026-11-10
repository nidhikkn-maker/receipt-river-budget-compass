import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { accountState, cardDigitsFromText, receiptAccountEvidence } from "./account-evidence";
import { displayDate } from "./date-display";
import type { Account } from "./ledger";
import type { PaymentInstrument } from "./payment-instruments";

const accounts: Account[] = [
  { id: "sav", name: "HDFC Savings", kind: "savings", openingBalance: 0, archived: false, lastFour: "4821" },
  { id: "regalia", name: "HDFC Regalia card", kind: "credit_card", openingBalance: 0, archived: false, lastFour: "7710" },
  { id: "amex", name: "Amex Platinum Travel", kind: "credit_card", openingBalance: 0, archived: false, lastFour: "1006" },
  { id: "old", name: "Closed card", kind: "credit_card", openingBalance: 0, archived: true, lastFour: "5555" },
];
const instruments: PaymentInstrument[] = [{ id: "gpay", type: "upi", nickname: "GPay HDFC", accountId: "sav" }];

describe("account evidence from a scanned bill", () => {
  it("a bill that only names the method is insufficient: no account, and the reason says why", () => {
    const r = receiptAccountEvidence({ text: "TOTAL 460.00 Paid by credit card", paymentMethod: "credit_card" }, accounts, instruments);
    expect(r).toEqual({ accountId: null, instrumentId: null, evidence: null, reason: "The bill says it was paid by a credit card but doesn't show which one." });
  });
  it("matching printed last four digits suggest exactly that account and name the evidence", () => {
    const r = receiptAccountEvidence({ text: "Paid by Amex card ****1006", paymentMethod: "credit_card" }, accounts, instruments);
    expect(r.accountId).toBe("amex");
    expect(r.evidence).toBe("Card or account ending 1006 printed on the bill matches Amex Platinum Travel");
  });
  it("digits that match nothing, or only an archived account, suggest nothing", () => {
    expect(receiptAccountEvidence({ text: "Card XX9999" }, accounts, instruments).accountId).toBeNull();
    expect(receiptAccountEvidence({ text: "Card XX5555" }, accounts, instruments).accountId).toBeNull();
  });
  it("digits matching more than one account are ambiguous", () => {
    const twins = [...accounts, { id: "twin", name: "Other card", kind: "credit_card", openingBalance: 0, archived: false, lastFour: "1006" } as Account];
    const r = receiptAccountEvidence({ text: "ending 1006" }, twins, []);
    expect(r.accountId).toBeNull();
    expect(r.reason).toContain("more than one");
  });
  it("finds last-four patterns but not amounts, GSTINs or invoice numbers", () => {
    expect(cardDigitsFromText("Card no. XXXX XXXX XXXX 7710")).toEqual(["7710"]);
    expect(cardDigitsFromText("A/c xx4821 debited")).toEqual(["4821"]);
    expect(cardDigitsFromText("ending in 1006")).toEqual(["1006"]);
    expect(cardDigitsFromText("TOTAL 1460.00 GSTIN 29ABCDE1234F1Z5 Invoice #BT-20931 Tel 080 4123 4567")).toEqual([]);
  });
  it("only an owner's choice counts as confirmed", () => {
    expect(accountState("none", false)).toBe("unselected");
    expect(accountState("amex", false)).toBe("suggested");
    expect(accountState("amex", true)).toBe("confirmed");
  });
  it("the shared review (classic and Smart Add) uses this rule and never fills the account from habit after a bill is read", () => {
    const src = readFileSync("src/routes/_authenticated/new.tsx", "utf8");
    expect(src).toContain("receiptAccountEvidence({ text: x.text, paymentMethod: x.payment_method }");
    expect(src).toContain("if (accountByUser.current || billRead.current) d.accountId = null;");
    expect(src).toContain("!billRead.current && hit.accountId");
    expect(src).toContain("Account needs confirmation");
    expect(src).toContain('data-account-state={accountState(accountId, accountConfirmed)}');
  });
});

describe("unambiguous dates", () => {
  it("formats ISO dates as 09 Nov 2026 and leaves anything else alone", () => {
    expect(displayDate("2026-11-09")).toBe("09 Nov 2026");
    expect(displayDate("2026-02-30")).toBe("2026-02-30");
    expect(displayDate("11/09/2026")).toBe("11/09/2026");
    expect(displayDate("")).toBe("");
  });
});
