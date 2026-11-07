import { describe, expect, it } from "vitest";
import type { Account } from "./ledger";
import { applyInstrument, lastInstrumentForMerchant, totalsByInstrument, upsertInstrument, validateInstrument, type PaymentInstrument } from "./payment-instruments";

const hdfc: Account = { id: "hdfc", name: "HDFC Savings", kind: "savings", openingBalance: 0, archived: false };
const amex: Account = { id: "amex", name: "AMEX", kind: "credit_card", openingBalance: 0, archived: false };
const cash: Account = { id: "cash", name: "Cash", kind: "cash", openingBalance: 0, archived: false };
const accounts = [hdfc, amex, cash];
const gpay: PaymentInstrument = { id: "g", type: "upi", nickname: "GPay", handle: "KK@okhdfc", accountId: "hdfc" };

describe("payment methods", () => {
  it("UPI ID links to a bank account and fills UPI + that bank", () => {
    const v = validateInstrument(gpay, accounts);
    expect(v.handle).toBe("kk@okhdfc");
    expect(applyInstrument(v)).toEqual({ paymentMethod: "upi", accountId: "hdfc", memberId: null });
  });
  it("UPI ID cannot be linked to a credit card account", () => {
    expect(() => validateInstrument({ ...gpay, accountId: "amex" }, accounts)).toThrow(/must be linked/);
  });
  it("RuPay credit card on UPI counts against the card account", () => {
    const r = validateInstrument({ id: "r", type: "rupay_upi", nickname: "RuPay", handle: "kk@axl", lastFour: "1234", accountId: "amex" }, accounts);
    expect(applyInstrument(r)).toEqual({ paymentMethod: "credit_card", accountId: "amex", memberId: null });
  });
  it("cards keep only the last 4 digits", () => {
    expect(() => validateInstrument({ id: "d", type: "debit_card", nickname: "Debit", lastFour: "4111111111111111", accountId: "hdfc" }, accounts)).toThrow(/last 4/);
    expect(validateInstrument({ id: "d", type: "debit_card", nickname: "Debit", lastFour: "4821", accountId: "hdfc" }, accounts).lastFour).toBe("4821");
  });
  it("rejects an invalid UPI handle", () => {
    expect(() => validateInstrument({ ...gpay, handle: "not-an-id" }, accounts)).toThrow(/UPI ID/);
  });
  it("keeps only one default", () => {
    let list = upsertInstrument([], { ...gpay, isDefault: true }, accounts);
    list = upsertInstrument(list, { id: "c", type: "cash", nickname: "Wallet cash", accountId: "cash", isDefault: true }, accounts);
    expect(list.filter((p) => p.isDefault).map((p) => p.id)).toEqual(["c"]);
  });
  it("totals spending per method and remembers the last one per shop", () => {
    const entries = [
      { merchant: "Zepto", date: "2026-10-01", amount: 100, paymentInstrumentId: "g" },
      { merchant: "Zepto", date: "2026-10-05", amount: 50.5, paymentInstrumentId: "g" },
      { merchant: "Zepto", date: "2026-10-06", amount: 999, paymentInstrumentId: "g", txnType: "transfer" },
    ];
    expect(totalsByInstrument(entries)).toEqual({ g: 150.5 });
    expect(lastInstrumentForMerchant(" zepto ", entries, [gpay])?.id).toBe("g");
  });
});
