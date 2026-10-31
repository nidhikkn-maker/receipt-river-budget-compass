import { describe, expect, it } from "vitest";
import type { Expense } from "./expenses";
import type { Account } from "./ledger";
import type { Commitment } from "./planning";
import { behaviour, briefDue, defaultEmergency, emergencyFund, irregularCandidates, mergeMerchants, merchantProfiles, milestoneProgress, normaliseMerchant, plannedScenario, recordProgress, simulate, tripSummary, unmergeMerchant, weeklyBrief, type Milestone, type SimInput } from "./intelligence";

const ex = (o: Partial<Expense>): Expense => ({ id: crypto.randomUUID(), title: "Item", merchant: null, category: "Groceries", scope: "personal", memberId: null, splits: [], amount: 100, currency: "INR", originalAmount: 100, fxRate: 1, paymentMethod: "upi", reconciledAt: null, statementRef: null, date: "2026-10-10", description: "", receipts: [], txnType: "expense", accountId: "a1", ...o });
const bank: Account = { id: "a1", name: "HDFC", kind: "savings", openingBalance: 100000, archived: false };
const card: Account = { id: "c1", name: "Card", kind: "credit_card", openingBalance: 0, archived: false, creditLimit: 500000 };
const TODAY = "2026-10-31";

describe("decision simulator", () => {
  it("only purchase scenarios can become outgoing planned expenses", () => {
    for (const kind of ["loan_extra", "increase_savings", "reduce_category", "card_payment", "goal_allocation"] as const) expect(plannedScenario({ kind, amount: 100, date: TODAY, recurring: false })).toBeNull();
    expect(plannedScenario({ kind: "postpone", amount: 321.45, date: TODAY, postponeTo: "2026-11-15", recurring: true })).toMatchObject({ amount: 321.45, nextDue: "2026-11-15", frequency: "once", direction: "out" });
    expect(() => plannedScenario({ kind: "purchase", amount: 100, date: "2026-02-30", recurring: false })).toThrow();
  });
  const base: SimInput = { cash: 50000, floor: 10000, commitments: [], today: TODAY, days: 60, goals: [{ name: "Car", target: 100000, saved: 20000, monthly: 0 }], loans: [{ name: "Home", principal: 1000000, rate: 9, emi: 20000 }], monthlySavings: 5000 };
  it("₹30,000 purchase cuts available funds from ₹40,000 to ₹10,000", () => {
    const r = simulate(base, { kind: "purchase", amount: 30000, date: "2026-11-05", recurring: false });
    expect(r.before.available).toBe(40000);
    expect(r.after.available).toBe(10000);
    expect(r.after.lowest).toBe(20000);
  });
  it("loan prepayment reports interest saved and fewer months", () => {
    const r = simulate(base, { kind: "loan_extra", amount: 100000, date: TODAY, recurring: false, loanIndex: 0 });
    expect(r.loan!.interestSaved).toBeGreaterThan(0);
    expect(r.loan!.monthsSaved).toBeGreaterThan(0);
  });
  it("goal allocation of ₹30,000 lifts the goal to 50%", () => {
    const r = simulate(base, { kind: "goal_allocation", amount: 30000, date: TODAY, recurring: false, goalIndex: 0 });
    expect(r.before.goal!.pct).toBe(20);
    expect(r.after.goal!.pct).toBe(50);
  });
  it("does not change the commitments passed in", () => {
    const c: Commitment[] = []; simulate({ ...base, commitments: c }, { kind: "new_recurring", amount: 999, date: TODAY, recurring: true });
    expect(c).toHaveLength(0);
  });
});

describe("emergency fund", () => {
  it("credit card limits never count; coverage = reserves ÷ highest essential month + EMIs", () => {
    const txns = [ex({ amount: 20000, date: "2026-09-10", category: "Groceries" }), ex({ amount: 10000, date: "2026-08-10", category: "Groceries" }), ex({ amount: 50000, date: "2026-09-12", category: "Shopping" })];
    const r = emergencyFund(defaultEmergency(), [bank, card], txns, 10000, 0, TODAY);
    expect(r.reserves).toBe(20000); // 100000 − 80000 spent
    expect(r.monthly).toBe(30000); // 20000 highest essentials + 10000 EMI
    expect(r.coverage).toBe(0.7);
    expect(r.target).toBe(180000);
    expect(r.gap).toBe(160000);
  });
  it("excludes earmarked savings", () => {
    const r = emergencyFund(defaultEmergency(), [bank], [], 0, 30000, TODAY);
    expect(r.reserves).toBe(70000);
  });
});

describe("irregular expenses", () => {
  it("detects a yearly insurance premium and next date", () => {
    const t = [ex({ merchant: "LIC Premium", amount: 24000, date: "2024-11-15", category: "Insurance" }), ex({ merchant: "LIC Premium", amount: 25000, date: "2025-11-14", category: "Insurance" })];
    const c = irregularCandidates(t, TODAY);
    expect(c).toHaveLength(1);
    expect(c[0]!.nextDate).toBe("2026-11-14");
    expect(c[0]!.estimate).toBe(26000);
  });
  it("ignores monthly payments", () => {
    const t = ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"].map((date) => ex({ merchant: "Netflix", date }));
    expect(irregularCandidates(t, TODAY)).toHaveLength(0);
  });
});

describe("milestones", () => {
  const m: Milestone = { id: "1", name: "First ₹1 lakh reserve", metric: "emergency_amount", target: 100000, targetDate: null, notify: false, history: [{ date: "2026-10-01", value: 40000 }], createdAt: "2026-10-01" };
  const x = { emergencyAmount: 70000, emergencyMonths: 2, netWorth: 0, savings: 0, cardDebt: 0, loans: [] };
  it("₹70,000 of ₹1 lakh shows ₹30,000 remaining and a pace-based ETA", () => {
    const p = milestoneProgress(m, x, TODAY);
    expect(p.remaining).toBe(30000);
    expect(p.pct).toBe(70);
    expect(p.eta).toBe("2026-11-30");
  });
  it("debt reduction counts downward", () => {
    const d: Milestone = { ...m, metric: "card_debt", target: 0, start: 50000, history: [] };
    expect(milestoneProgress(d, { ...x, cardDebt: 25000 }, TODAY).pct).toBe(50);
  });
  it("records one point per day", () => {
    expect(recordProgress(recordProgress(m, 1, TODAY), 2, TODAY).history).toHaveLength(2);
  });
});

describe("trips", () => {
  it("keeps stored INR and rate per entry", () => {
    const trip = { id: "t", name: "Dubai", destination: "Dubai", start: "2026-10-01", end: "2026-10-05", budget: 50000, currencies: ["AED"] };
    const t = [ex({ tags: ["Trip: Dubai"], currency: "AED", originalAmount: 100, fxRate: 22.5, amount: 2250, category: "Food and beverages" }), ex({ tags: ["Trip: Dubai", "Purpose: Reimbursable"], amount: 10000, category: "Travel and accommodation" }), ex({ amount: 999 })];
    const s = tripSummary(trip, t);
    expect(s.total).toBe(12250);
    expect(s.perDay).toBe(2450);
    expect(s.variance).toBe(37750);
    expect(s.reimbursable).toBe(10000);
    expect(s.currencies.find((c) => c.currency === "AED")).toMatchObject({ original: 100, inr: 2250, rates: [22.5] });
  });
});

describe("merchants", () => {
  it("merging an existing group flattens aliases without changing totals", () => {
    const t = [ex({ merchant: "Alpha Shop", amount: 100 }), ex({ merchant: "Beta Store", amount: 200 }), ex({ merchant: "Gamma Mart", amount: 300 })];
    let a = mergeMerchants({}, ["Beta Store"], "Alpha Shop");
    a = mergeMerchants(a, ["Alpha Shop"], "Gamma Mart");
    expect(merchantProfiles(t, a, TODAY)).toHaveLength(1);
    expect(merchantProfiles(t, a, TODAY)[0]?.total).toBe(600);
    expect(merchantProfiles(t, unmergeMerchant(a, "Alpha Shop"), TODAY).map((p) => p.total).sort((x, y) => x - y)).toEqual([100, 500]);
  });
  it("normalises spelling variants without changing originals", () => {
    expect(normaliseMerchant("UPI-SWIGGY LTD")).toBe(normaliseMerchant("Swiggy"));
  });
  it("merge groups and unmerge separates", () => {
    const t = [ex({ merchant: "Amazon Pay", amount: 100 }), ex({ merchant: "AMZN Mktp", amount: 200 })];
    expect(merchantProfiles(t, {}, TODAY)).toHaveLength(2);
    const a = mergeMerchants({}, ["AMZN Mktp"], normaliseMerchant("Amazon Pay"));
    const p = merchantProfiles(t, a, TODAY);
    expect(p).toHaveLength(1); expect(p[0]!.total).toBe(300); expect(p[0]!.names).toEqual(["Amazon Pay", "AMZN Mktp"]);
    expect(merchantProfiles(t, unmergeMerchant(a, "AMZN Mktp"), TODAY)).toHaveLength(2);
  });
});

describe("behaviour", () => {
  it("flags a category up more than 30%", () => {
    const t = [ex({ amount: 2000, date: "2026-09-10", category: "Shopping" }), ex({ amount: 5000, date: "2026-10-10", category: "Shopping" })];
    expect(behaviour(t, TODAY).some((o) => o.key === "rise:Shopping")).toBe(true);
  });
});

describe("weekly brief", () => {
  it("caps recommendations at three and compares weeks", () => {
    const t = [ex({ amount: 3000, date: "2026-10-28" }), ex({ amount: 1000, date: "2026-10-20" })];
    const b = weeklyBrief({ txns: t, accounts: [bank], commitments: [], upcoming: [], lowest: 0, floor: 1000, staleAccounts: ["HDFC"], pendingReimbursements: 500, missingItems: 2, budgetWarnings: ["Groceries 120%"], today: TODAY });
    expect(b.snapshot.spent).toBe(3000);
    expect(b.snapshot.change).toBe(200);
    expect(b.recommendations.length).toBe(3);
  });
  it("is due after the chosen day and hour, once per week", () => {
    const mon9 = new Date(2026, 10, 2, 9); // Monday
    expect(briefDue({ enabled: true, day: 1, hour: 8 }, null, mon9)).toBe(true);
    expect(briefDue({ enabled: true, day: 1, hour: 8 }, "2026-11-02T08:30:00Z", mon9)).toBe(false);
    expect(briefDue({ enabled: false, day: 1, hour: 8 }, null, mon9)).toBe(false);
  });
});
