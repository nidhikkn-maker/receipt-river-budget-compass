import { describe, expect, it } from "vitest";
import { amortize, detectSubscriptions, dueStatus, forecast, goalProgress, monthlyCost, nextAfter, occurrences, prepayment, safeToSpend, type Commitment } from "./planning";

const c = (o: Partial<Commitment>): Commitment => ({
  id: Math.random().toString(), name: "x", kind: "bill", direction: "out", amount: 1000, frequency: "monthly", intervalDays: null,
  nextDue: "2026-11-05", accountId: null, category: "Bills & Utilities", confirmed: true, essential: true, status: "active", ...o,
});

describe("recurring", () => {
  it("monthly due dates keep month-end days valid", () => {
    expect(nextAfter("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextAfter("2026-01-15", "quarterly")).toBe("2026-04-15");
  });
  it("scheduled payments are not treated as paid — a missed one shows as overdue", () => {
    expect(dueStatus(c({ nextDue: "2026-10-01" }), "2026-10-10")).toBe("overdue");
    expect(dueStatus(c({ nextDue: "2026-10-12" }), "2026-10-10")).toBe("due_soon");
  });
  it("paused and cancelled commitments don't appear in the schedule", () => {
    expect(occurrences([c({ status: "paused" }), c({ status: "cancelled" })], "2026-11-01", "2026-12-31")).toHaveLength(0);
  });
  it("monthly cost of a yearly subscription", () => { expect(monthlyCost({ amount: 1200, frequency: "yearly", intervalDays: null })).toBe(100); });
});

describe("safe-to-spend and forecast", () => {
  const base = { startBalance: 50000, today: "2026-11-01", days: 30 };
  it("salary arriving after a card payment can't be used to pay it", () => {
    const s = safeToSpend({ ...base, commitments: [
      c({ name: "AMEX", amount: 40000, nextDue: "2026-11-05" }),
      c({ name: "Salary", direction: "in", amount: 200000, nextDue: "2026-11-30" }),
    ] });
    expect(s.amount).toBe(10000);
    expect(s.lowestDate).toBe("2026-11-05");
  });
  it("unconfirmed income is excluded by default and included on request", () => {
    const list = [c({ direction: "in", amount: 30000, nextDue: "2026-11-02", confirmed: false }), c({ amount: 60000, nextDue: "2026-11-10" })];
    expect(safeToSpend({ ...base, commitments: list }).amount).toBe(0);
    expect(safeToSpend({ ...base, commitments: list, includeUnconfirmed: true }).amount).toBe(20000);
  });
  it("reserves and minimum balances are held back", () => {
    expect(safeToSpend({ ...base, commitments: [], reserves: 15000, minBalance: 5000 }).amount).toBe(30000);
  });
  it("forecast flags the dates money runs short", () => {
    const f = forecast({ ...base, days: 10, commitments: [c({ amount: 60000, nextDue: "2026-11-04" }), c({ direction: "in", amount: 20000, nextDue: "2026-11-08" })] });
    expect(f.shortDates).toEqual(["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]);
    expect(f.series.at(-1)!.balance).toBe(10000);
  });
});

describe("loans", () => {
  it("₹10L at 9% for 120 months: EMI clears it in 120 months", () => {
    const a = amortize(1000000, 9, 12667.58);
    expect(a.months).toBe(120);
    expect(Math.round(a.totalInterest)).toBeGreaterThan(520000);
  });
  it("prepaying shortens tenure and saves interest", () => {
    const p = prepayment(1000000, 9, 12667.58, 200000);
    expect(p.reduceTenure.monthsSaved).toBeGreaterThan(20);
    expect(p.reduceTenure.interestSaved).toBeGreaterThan(0);
    expect(p.reduceEmi.newEmi).toBeLessThan(12667.58);
  });
  it("an EMI below the monthly interest never pays off", () => { expect(amortize(1000000, 12, 5000).payable).toBe(false); });
});

describe("goals and subscriptions", () => {
  it("goal projection", () => { expect(goalProgress({ target: 100000, saved: 40000, monthly: 10000 }, "2026-11-01")).toEqual({ remaining: 60000, pct: 40, months: 6, eta: "2027-05-01" }); });
  it("finds a monthly charge and flags a price rise", () => {
    const s = detectSubscriptions([
      { merchant: "Netflix", amount: 499, date: "2026-07-03" }, { merchant: "Netflix", amount: 499, date: "2026-08-03" },
      { merchant: "Netflix", amount: 649, date: "2026-09-03" }, { merchant: "Cafe", amount: 200, date: "2026-09-03" },
    ]);
    expect(s).toHaveLength(1);
    expect(s[0]!.increased).toBe(true);
  });
});

import { debtScenarios as _ds } from "./planning";
describe("debtScenarios", () => {
  it("prepaying ₹50,000 on a ₹5L 9% loan with ₹10,000 EMI saves months and interest, more than ₹10,000 does", () => {
    const s = _ds([{ name: "Car", principal: 500000, rate: 9, emi: 10000 }])[0]!;
    expect(s.hypothetical).toBe(true);
    expect(s.prepay[1]!.monthsSaved).toBeGreaterThan(s.prepay[0]!.monthsSaved);
    expect(s.prepay[1]!.interestSaved).toBeGreaterThan(0);
    expect(s.raiseEmi.newEmi).toBe(11000);
    expect(s.raiseEmi.monthsSaved).toBeGreaterThan(0);
  });
  it("skips loans whose EMI cannot cover interest", () => {
    expect(_ds([{ name: "Bad", principal: 1000000, rate: 24, emi: 1000 }])).toHaveLength(0);
  });
});
