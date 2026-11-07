import { describe, expect, it } from "vitest";
import { bankBalanceKnown, currentBankBalance, loanFundingReminders, validateBankBalance } from "./loan-funding";
import { paymentReadiness } from "./readiness";
import { adjustmentToMatch, type Account, type Txn } from "./ledger";
import { emiTargets, type EmiTarget } from "./emi-match";
import type { Commitment } from "./planning";
import { paymentReminderItems } from "./push-rules";

const target: EmiTarget = { loanId: "gls", name: "Mercedes GLS", loanAccountId: "loan", payFromAccountId: "cub", fundingFromAccountId: "idfc", fundingDay: 3, dueDay: 5, emi: 313913, refs: [] };
const loan = { id: "gls", name: "Mercedes GLS", nextDue: "2026-11-05", emi: 313913, principal: 10374241, rate: 8.25, accountId: "loan", status: "active", loanType: "vehicle" };
const bank: Account = { id: "cub", name: "City Union Bank", kind: "savings", openingBalance: 0, archived: false };
const transfer: Txn = { id: "fund", date: "2026-11-03", amount: 313900, txnType: "transfer", accountId: "idfc", toAccountId: "cub" };
const emi: Commitment = { id: "emi", name: "GLS EMI", kind: "emi", direction: "out", amount: 313913, frequency: "monthly", intervalDays: null, nextDue: "2026-11-05", accountId: "cub", category: "Financial charges", confirmed: true, essential: true, status: "active" };
const reminders = (tx: Txn[], today = "2026-11-04") => loanFundingReminders([target], [loan], tx, today, 3);

describe("City Union Bank balance coverage", () => {
  it("a dated actual balance uses all transfers and adjusts once, not income", () => {
    const adjustment = adjustmentToMatch(bank, [transfer], 313913);
    expect(adjustment).toEqual({ amount: 13, sign: 1 });
    const tx: Txn[] = [transfer, { id: "adjust", date: "2026-11-04", txnType: "adjustment", accountId: "cub", amount: 13, adjustmentSign: 1 }];
    expect(currentBankBalance(bank, tx, "2026-11-04")).toBe(313913);
    expect(adjustmentToMatch(bank, tx, 313913)).toBeNull();
    expect(paymentReadiness({ accounts: [bank], transactions: tx, commitments: [emi], today: "2026-11-04" })[0]?.status).toBe("ready");
  });
  it("₹3,13,900 leaves the ₹13 EMI gap visible", () => {
    expect(paymentReadiness({ accounts: [bank], transactions: [transfer], commitments: [emi], today: "2026-11-04" })[0]?.shortfall).toBe(13);
  });
  it("unknown starting balance never certifies coverage", () => {
    const unknown = { ...bank, details: { needsBalance: true } as NonNullable<Account["details"]> };
    expect(bankBalanceKnown(unknown)).toBe(false);
    expect(paymentReadiness({ accounts: [unknown], transactions: [transfer], commitments: [emi], today: "2026-11-04" })[0]?.status).toBe("unknown");
  });
  it("accepts zero but rejects invalid, future and negative balances", () => {
    expect(() => validateBankBalance(0, "2026-11-04", "2026-11-04")).not.toThrow();
    for (const [amount, date] of [[-1, "2026-11-04"], [NaN, "2026-11-04"], [1, "2026-11-05"], [1, "2026-02-30"]] as const) expect(() => validateBankBalance(amount, date, "2026-11-04")).toThrow();
  });
});
describe("Funding transfer reminders", () => {
  it("chooses CUB EMI rather than similarly priced IDFC funding commitment", () => {
    const accounts = [{ ...bank, details: { fundsLoan: "gls", fundedFrom: "idfc", fundingDay: 3 } as NonNullable<Account["details"]> }];
    const targets = emiTargets([loan], [{ ...emi, name: "Auto transfer to CUB savings (GLS EMI)", accountId: "idfc", amount: 313900 }, emi], accounts);
    expect(targets[0]?.payFromAccountId).toBe("cub");
    expect(targets[0]?.fundingFromAccountId).toBe("idfc");
  });
  it("alerts after the 3rd for a missing transfer before the 5th", () => {
    expect(reminders([])[0]).toMatchObject({ status: "missing", due: "2026-11-05", fundingDate: "2026-11-03", shortfall: 313913 });
    expect(reminders([], "2026-11-02")).toEqual([]);
    expect(reminders([], "2026-11-06")).toEqual([]);
  });
  it("₹13 shortfall is not hidden by EMI matching tolerance", () => expect(reminders([transfer])[0]).toMatchObject({ status: "short", received: 313900, shortfall: 13 }));
  it("split top-ups clear the warning without counting receiving evidence twice", () => {
    expect(reminders([transfer, { ...transfer, id: "top", amount: 13, date: "2026-11-04" }])).toEqual([]);
    expect(reminders([transfer, { ...transfer, id: "counter", transferCounterpartOf: "fund" }])[0]?.shortfall).toBe(13);
  });
  it("ignores expenses, wrong destinations and previous-month transfers", () => {
    expect(reminders([{ ...transfer, txnType: "expense" }, { ...transfer, id: "wrong", toAccountId: "amex" }, { ...transfer, id: "old", date: "2026-10-03" }])[0]?.status).toBe("missing");
  });
  it("stops after recorded EMI payment", () => expect(reminders([{ id: "paid", txnType: "loan_repayment", amount: 313913, date: "2026-11-05", accountId: "cub", toAccountId: "loan" }], "2026-11-05")).toEqual([]));
  it("shares the funding warning with private push and respects reminder switch", () => {
    const input = { today: "2026-11-04", leadDays: 3, enabled: true, commitments: [emi], accounts: [{ ...bank, details: { fundedFrom: "idfc", fundingDay: 3 } as NonNullable<Account["details"]> }], loans: [loan], transactions: [transfer], documents: [] };
    expect(paymentReminderItems(input).some(i => i.key === "loan-funding:gls:2026-11-05")).toBe(true);
    expect(paymentReminderItems({ ...input, enabled: false })).toEqual([]);
    expect(paymentReminderItems({ ...input, notifications: { loanFunding: false } }).some(i=>i.key.startsWith("loan-funding:"))).toBe(false);
    expect(paymentReminderItems({ ...input, notifications: { payments: false } }).map(i=>i.key)).toEqual(["loan-funding:gls:2026-11-05"]);
    expect(paymentReminderItems({ ...input, transactions: [{...transfer,amount:313913}], notifications: { payments: false } })).toEqual([]);
  });
});