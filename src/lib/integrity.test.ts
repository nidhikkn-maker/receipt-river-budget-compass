import { describe, expect, it } from "vitest";
import { accountBalance, accountValue, adjustmentToMatch, cashflow, netWorth, reconciledBalance, transferMeaning, type Account, type Txn } from "./ledger";
import { closureDate, emiSplit, foreclosure, forecast, incomeTracking, nextAfter, occurrences, prepayment, remindersDue, subscriptionSummary, type Commitment } from "./planning";

const bank: Account = { id: "b", name: "Bank", kind: "savings", openingBalance: 10000, archived: false };
const loan: Account = { id: "l", name: "Home loan", kind: "loan", openingBalance: 500000, archived: false };
const fund: Account = { id: "f", name: "Fund", kind: "investment", openingBalance: 0, archived: false };

describe("financial data integrity", () => {
  it("reimbursements raise the balance and reduce spending without counting as income", () => {
    const t: Txn[] = [{ id: "1", date: "2026-10-01", amount: 3000, accountId: "b", txnType: "expense" }, { id: "2", date: "2026-10-09", amount: 3000, accountId: "b", txnType: "reimbursement" }];
    expect(accountBalance(bank, t)).toBe(10000);
    expect(cashflow(t)).toEqual({ income: 0, spent: 0, net: 0 });
  });
  it("loan principal repayment is a transfer; only interest is spending", () => {
    const t: Txn[] = [{ id: "p", date: "2026-10-05", amount: 4000, accountId: "b", toAccountId: "l", txnType: "transfer" }, { id: "i", date: "2026-10-05", amount: 3500, accountId: "b", txnType: "expense" }];
    expect(accountBalance(loan, t)).toBe(496000);
    expect(accountBalance(bank, t)).toBe(2500);
    expect(cashflow(t).spent).toBe(3500);
  });
  it("investment purchase and redemption move money without income or spending", () => {
    const t: Txn[] = [{ id: "b1", date: "2026-10-01", amount: 6000, accountId: "b", toAccountId: "f", txnType: "transfer" }, { id: "r1", date: "2026-10-20", amount: 1000, accountId: "f", toAccountId: "b", txnType: "transfer" }];
    expect(accountBalance(fund, t)).toBe(5000);
    expect(cashflow(t)).toEqual({ income: 0, spent: 0, net: 0 });
    expect(transferMeaning(bank, fund)).toBe("Investment purchase");
    expect(transferMeaning(fund, bank)).toBe("Investment redemption");
    expect(transferMeaning(bank, loan)).toBe("Loan principal repayment");
  });
  it("balance adjustments can lower or raise the balance to match the bank", () => {
    const t: Txn[] = [{ id: "1", date: "2026-10-01", amount: 500, accountId: "b", txnType: "expense" }];
    expect(adjustmentToMatch(bank, t, 9200)).toEqual({ amount: 300, sign: -1 });
    expect(accountBalance(bank, [...t, { id: "a", date: "2026-10-02", amount: 300, accountId: "b", txnType: "adjustment", adjustmentSign: -1 }])).toBe(9200);
    expect(adjustmentToMatch(bank, t, 9500)).toBeNull();
  });
  it("reconciled balance counts only statement-matched entries", () => {
    const t: Txn[] = [{ id: "1", date: "2026-10-01", amount: 500, accountId: "b", txnType: "expense", reconciledAt: "2026-10-05" }, { id: "2", date: "2026-10-02", amount: 700, accountId: "b", txnType: "expense" }];
    expect(reconciledBalance(bank, t)).toBe(9500);
    expect(accountBalance(bank, t)).toBe(8800);
  });
  it("investment value uses the latest valuation plus later flows, with its date and source", () => {
    const t: Txn[] = [{ id: "1", date: "2026-09-01", amount: 10000, accountId: "b", toAccountId: "f", txnType: "transfer" }, { id: "2", date: "2026-10-10", amount: 2000, accountId: "b", toAccountId: "f", txnType: "transfer" }];
    const v = [{ accountId: "f", value: 11000, valuedOn: "2026-10-01", source: "AMFI NAV" }];
    expect(accountValue(fund, t, v)).toEqual({ value: 13000, valuedOn: "2026-10-01", source: "AMFI NAV" });
    expect(netWorth([bank, fund], t, v).net).toBe(-2000 + 13000);
  });
});

const c = (x: Partial<Commitment>): Commitment => ({ id: "c", name: "x", kind: "bill", direction: "out", amount: 100, frequency: "monthly", intervalDays: null, nextDue: "2026-11-05", accountId: null, category: "Other", confirmed: true, essential: true, status: "active", ...x });

describe("planned purchases and reminders", () => {
  it("one-off items occur once and never repeat", () => {
    expect(nextAfter("2026-11-10", "once")).toBe("9999-12-31");
    const occ = occurrences([c({ kind: "planned_purchase", frequency: "once", nextDue: "2026-11-10", amount: 45000 })], "2026-10-31", "2027-03-31");
    expect(occ).toHaveLength(1);
  });
  it("planned purchases reduce the forecast on their date", () => {
    const f = forecast({ startBalance: 50000, commitments: [c({ kind: "planned_purchase", frequency: "once", nextDue: "2026-11-10", amount: 45000 })], today: "2026-10-31", days: 15, floor: 10000 });
    expect(f.shortDates[0]).toBe("2026-11-10");
  });
  it("reminders include overdue items and those within the lead days", () => {
    const items = [{ date: "2026-10-31", overdue: true }, { date: "2026-11-02", overdue: false }, { date: "2026-11-09", overdue: false }];
    expect(remindersDue(items, "2026-10-31", 3)).toHaveLength(2);
    expect(remindersDue(items, "2026-10-31", 10)).toHaveLength(3);
  });
});

describe("income tracking", () => {
  it("separates received, expected and late income", () => {
    const list = [c({ id: "sal", name: "Salary", direction: "in", kind: "income", amount: 120000, nextDue: "2026-10-28" }), c({ id: "rent", name: "Rent in", direction: "in", kind: "income", amount: 25000, nextDue: "2026-10-31", confirmed: false })];
    const r = incomeTracking(list, [{ txnType: "income", amount: 5000, date: "2026-10-02", category: "Interest income" }], "2026-10-30");
    expect(r.received).toBe(5000);
    expect(r.bySource).toEqual({ "Interest income": 5000 });
    expect(r.late).toEqual([{ id: "sal", name: "Salary", amount: 120000, due: "2026-10-28", daysLate: 2, confirmed: true }]);
    expect(r.expectedRemaining).toBe(25000);
    expect(r.expectedConfirmed).toBe(0);
  });
});

describe("subscriptions module", () => {
  const subs = [
    c({ id: "n", name: "Netflix", kind: "subscription", amount: 649, nextDue: "2026-11-03", category: "Digital subscriptions" }),
    c({ id: "n2", name: "Netflix Family", kind: "subscription", amount: 199, nextDue: "2026-11-20", category: "Digital subscriptions" }),
    c({ id: "s", name: "Spotify", kind: "subscription", amount: 1189, frequency: "yearly", nextDue: "2027-05-01", category: "Digital subscriptions" }),
    c({ id: "p", name: "Old gym", kind: "subscription", amount: 2000, status: "cancelled" }),
  ];
  it("totals monthly and annual cost of active subscriptions", () => {
    const s = subscriptionSummary(subs, [], "2026-10-31");
    expect(s.counts).toEqual({ active: 3, paused: 0, cancelled: 1 });
    expect(s.monthly).toBe(649 + 199 + 99.08);
    expect(s.annual).toBe(Math.round((649 + 199 + 99.08) * 12 * 100) / 100);
    expect(s.renewals.map((x) => x.id)).toEqual(["n", "n2"]);
  });
  it("flags price increases and duplicates", () => {
    const s = subscriptionSummary(subs, [{ merchant: "NETFLIX", amount: 499, date: "2026-08-03" }, { merchant: "Netflix", amount: 649, date: "2026-09-03" }], "2026-10-31");
    expect(s.increases).toEqual([{ id: "n", name: "Netflix", from: 499, to: 649 }]);
    expect(s.duplicates[0]).toMatchObject({ ids: ["n", "n2"], reason: "Same service name" });
  });
});

describe("loan details", () => {
  it("splits the next EMI into interest and principal", () => {
    expect(emiSplit(500000, 9, 10000)).toEqual({ interest: 3750, principal: 6250, total: 10000 });
  });
  it("prepayment and foreclosure charges use the entered percentage", () => {
    const p = prepayment(500000, 9, 10000, 100000, 2);
    expect(p.charge).toBe(2000);
    expect(p.cashImpact).toBe(102000);
    expect(p.reduceTenure.netSaving).toBe(Math.round((p.reduceTenure.interestSaved - 2000) * 100) / 100);
    expect(foreclosure(250000, 3)).toEqual({ charge: 7500, total: 257500 });
  });
  it("projects the closure date from the next EMI", () => {
    expect(closureDate("2026-11-05", 3)).toBe("2027-01-05");
    expect(closureDate("2026-11-05", Infinity)).toBeNull();
  });
});
