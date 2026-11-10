import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { accountCheckRecord, accountNetwork, accountState, billCard, cardDigitsFromText, cardFromText, cleanCard, maskCardNumbers, networkFromText, receiptAccountEvidence } from "./account-evidence";
import { displayDate, fromLocalDate, toLocalDate } from "./date-display";
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
    expect(r).toMatchObject({ accountId: null, instrumentId: null, evidence: null, payer: "own", reason: "The bill says it was paid by a credit card but doesn't show which one." });
  });
  it("matching printed last four digits suggest exactly that account and name the evidence", () => {
    const r = receiptAccountEvidence({ text: "Paid by Amex card ****1006", paymentMethod: "credit_card" }, accounts, instruments);
    expect(r.accountId).toBe("amex");
    expect(r.evidence).toBe("Amex ending 1006 printed on the bill matches Amex Platinum Travel");
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
    expect(src).toContain("receiptAccountEvidence({ text: x.text, paymentMethod: x.payment_method, cardNetwork: x.card_network ?? null, cardLastFour: x.card_last_four ?? null }");
    expect(src).toContain("if (accountByUser.current || billRead.current) d.accountId = null;");
    expect(src).toContain("!billRead.current && hit.accountId");
    expect(src).toContain("Account needs confirmation");
    expect(src).toContain("const acctState = accountState(accountId, accountConfirmed, notOwn);");
    expect(src).toContain("data-account-state={acctState}");
    // Classic applies the same rule (D1): after a bill is read its Save waits for a chosen or confirmed account.
    expect(src).toContain('const accountBlocked = !embedded?.confirmsAccount && !editing && !!billEvidence && !isMove(txnType) && acctState !== "confirmed";');
    expect(src).toMatch(/disabled=\{[^}]*accountBlocked[^}]*\}/);
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

// Batch B1d (KK decision D1): card identifiers printed on the bill, cash, company card and paid-by-someone-else.
const amexAcc: Account = { id: "amex", name: "Amex Platinum Travel", kind: "credit_card", openingBalance: 0, archived: false, issuer: "American Express", lastFour: "1006" };
const cashAcc: Account = { id: "cash", name: "Cash wallet", kind: "cash", openingBalance: 0, archived: false };
const visaAcc: Account = { id: "visa", name: "SBI SimplyClick", kind: "credit_card", openingBalance: 0, archived: false, issuer: "SBI Card Visa", lastFour: "1006" };
const sample = "BLUE TOKAI COFFEE ROASTERS Indiranagar, Bengaluru GSTIN 29ABCDE1234F1Z5 Date: 09-11-2026 14:22 Cappuccino x2 380.00 Almond croissant 58.10 Subtotal 438.10 CGST 2.5% 10.95 SGST 2.5% 10.95 TOTAL 460.00 Paid: Credit card ****1006 Thank you!";

describe("card identifiers on the bill (B1d item 1)", () => {
  it("reads the network and last four digits from every printed pattern", () => {
    expect(cardFromText("Card no. XXXX XXXX XXXX 1006")).toEqual({ network: null, lastFour: "1006" });
    expect(cardFromText("Card ending 1006 VISA")).toEqual({ network: "visa", lastFour: "1006" });
    expect(cardFromText("AMEX ****1006")).toEqual({ network: "amex", lastFour: "1006" });
    expect(cardFromText("American Express xx1006")).toEqual({ network: "amex", lastFour: "1006" });
    expect(cardFromText("Mastercard ending in 4421")).toEqual({ network: "mastercard", lastFour: "4421" });
    expect(cardFromText("RuPay ⋆⋆⋆⋆ 5521")).toEqual({ network: "rupay", lastFour: "5521" });
    expect(cardFromText("Diners Club card number ****3344")).toEqual({ network: "diners", lastFour: "3344" });
    expect(cardFromText(sample)).toEqual({ network: null, lastFour: "1006" });
  });
  it("never chooses between two networks or two sets of digits", () => {
    expect(networkFromText("We accept Visa and Mastercard")).toBeNull();
    expect(cardFromText("Card ****1006 refund to A/c xx4821").lastFour).toBeNull();
    expect(cardFromText("TOTAL 1460.00 Invoice 20931")).toEqual({ network: null, lastFour: null });
  });
  it("accepts only a known network and exactly four digits from the reader, else falls back to the bill text", () => {
    expect(cleanCard("AMEX", "1006")).toEqual({ network: "amex", lastFour: "1006" });
    expect(cleanCard("American Express", "1006")).toEqual({ network: "amex", lastFour: "1006" });
    expect(cleanCard("Discover", "4111111111111006")).toEqual({ network: null, lastFour: null });
    expect(billCard({ text: "AMEX ****1006", cardNetwork: null, cardLastFour: null })).toEqual({ network: "amex", lastFour: "1006" });
    expect(billCard({ text: "Card ****9999", cardNetwork: "visa", cardLastFour: "1006" })).toEqual({ network: "visa", lastFour: "1006" });
  });
  it("masks a full card number in the bill text down to its last four digits", () => {
    expect(maskCardNumbers("Card 4111 1111 1111 1111 approved")).toBe("Card XXXX XXXX XXXX 1111 approved");
    expect(maskCardNumbers("Invoice 1234567890123 TOTAL 460")).toBe("Invoice 1234567890123 TOTAL 460");
  });
  it("the account's network comes from what the owner saved", () => {
    expect(accountNetwork(amexAcc)).toBe("amex");
    expect(accountNetwork(visaAcc)).toBe("visa");
    expect(accountNetwork({ name: "HDFC Savings" })).toBeNull();
  });
});

describe("D1 account rule for the sample Blue Tokai bill and its variants", () => {
  const owner = [amexAcc, cashAcc, { id: "sav", name: "HDFC Savings", kind: "savings", openingBalance: 0, archived: false, lastFour: "4821" } as Account];
  it("the sample receipt's ****1006 suggests only the unique matching account, with evidence", () => {
    const r = receiptAccountEvidence({ text: sample, paymentMethod: "credit_card", cardNetwork: null, cardLastFour: "1006" }, owner, []);
    expect(r).toMatchObject({ accountId: "amex", payer: "own", evidence: "Card ending 1006 printed on the bill matches Amex Platinum Travel", card: { network: null, lastFour: "1006" } });
  });
  it("Amex ending 1006 printed on the bill names the network in the evidence", () => {
    const r = receiptAccountEvidence({ text: "Paid AMEX ****1006", paymentMethod: "credit_card", cardNetwork: "amex", cardLastFour: "1006" }, owner, []);
    expect(r.evidence).toBe("Amex ending 1006 printed on the bill matches Amex Platinum Travel");
  });
  it("a network mismatch is not a match: the bill says Amex, the only 1006 account is Visa", () => {
    const r = receiptAccountEvidence({ text: "Paid AMEX ****1006", paymentMethod: "credit_card", cardNetwork: "amex", cardLastFour: "1006" }, [visaAcc], []);
    expect(r.accountId).toBeNull();
    expect(r.reason).toBe("The bill shows Amex ending 1006, but your SBI SimplyClick ending 1006 is Visa, so it is not treated as a match.");
    // …and with both an Amex and a Visa ending 1006 the Amex is the unique match.
    expect(receiptAccountEvidence({ text: "AMEX ****1006", cardNetwork: "amex", cardLastFour: "1006" }, [visaAcc, amexAcc], []).accountId).toBe("amex");
  });
  it("a saved card (payment instrument) with the digits is matched through its linked account", () => {
    const card: PaymentInstrument = { id: "plat", type: "credit_card", nickname: "Amex Platinum", lastFour: "1006", accountId: "amexNoDigits" };
    const acc: Account = { id: "amexNoDigits", name: "Amex card", kind: "credit_card", openingBalance: 0, archived: false };
    const r = receiptAccountEvidence({ text: "AMEX ****1006", cardNetwork: "amex", cardLastFour: "1006" }, [acc], [card]);
    expect(r).toMatchObject({ accountId: "amexNoDigits", instrumentId: "plat" });
  });
  it("cash: only a cash account is a candidate, never a card, even when the shop is usually paid by card", () => {
    const r = receiptAccountEvidence({ text: "TOTAL 460.00 Paid in cash", paymentMethod: "cash" }, owner, []);
    expect(r).toMatchObject({ accountId: "cash", payer: "cash", evidence: "The bill says it was paid in cash, and Cash wallet is your only cash account" });
    expect(receiptAccountEvidence({ text: "Cash tendered 500" }, [amexAcc], []).accountId).toBeNull();
    expect(receiptAccountEvidence({ text: "Cash tendered 500" }, [amexAcc, cashAcc, { ...cashAcc, id: "cash2", name: "Petty cash" }], []).reason).toContain("more than one cash account");
    expect(receiptAccountEvidence({ text: "Paid cash. Card ****1006" , paymentMethod: "cash" }, owner, []).accountId).toBeNull();
  });
  it("company card or paid by someone else: no personal account is assumed", () => {
    for (const read of [{ text: "Corporate card ****1006", paymentMethod: "credit_card" }, { text: "TOTAL 460", paymentMethod: "company_card" }, { text: "Paid by company. On behalf of Thapal Ventures" }]) {
      const r = receiptAccountEvidence(read, owner, []);
      expect(r).toMatchObject({ accountId: null, payer: "other" });
      expect(r.reason).toContain("no personal account is assumed");
    }
  });
  it("a bill that mentions reimbursement offers claim-back but never decides it", () => {
    const r = receiptAccountEvidence({ text: "Reimbursable travel expense Card ****1006", paymentMethod: "credit_card" }, owner, []);
    expect(r).toMatchObject({ accountId: "amex", reimbursable: true });
  });
  it("not paid from my accounts counts as confirmed only when the owner said so and no account is set", () => {
    expect(accountState("none", false, true)).toBe("confirmed");
    expect(accountState("amex", false, true)).toBe("suggested");
  });
  it("the saved audit record says how the account was settled", () => {
    const card = { network: "amex" as const, lastFour: "1006" };
    expect(accountCheckRecord({ accountId: "amex", notOwn: false, suggestedId: "amex", evidence: "Amex ending 1006 printed on the bill matches Amex Platinum Travel", card }, "t")).toEqual({ decision: "evidence_confirmed", evidence: "Amex ending 1006 printed on the bill matches Amex Platinum Travel", card, confirmedAt: "t" });
    expect(accountCheckRecord({ accountId: "sav", notOwn: false, suggestedId: "amex", evidence: "x", card: null }, "t")).toEqual({ decision: "chosen", confirmedAt: "t" });
    expect(accountCheckRecord({ accountId: "none", notOwn: true, suggestedId: null, evidence: null, card: null }, "t")).toEqual({ decision: "not_own_account", confirmedAt: "t" });
  });
});

describe("dates never change because of display or locale (B1d item 3)", () => {
  it("ISO ↔ calendar day round-trips exactly, including month ends and leap days", () => {
    for (const iso of ["2026-11-09", "2026-01-31", "2028-02-29", "2026-12-31"]) expect(fromLocalDate(toLocalDate(iso)!)).toBe(iso);
    expect(toLocalDate("2026-02-30")).toBeUndefined();
    expect(toLocalDate("11/09/2026")).toBeUndefined();
  });
});
