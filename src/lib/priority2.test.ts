import { describe, expect, it } from "vitest";
import { defaultStress, stressTest, compareScenarios, type StressInput } from "./stress";
import { autopilot, applyAutopilotActions, type AutopilotInput } from "./autopilot";
import { affordability, avoidedSpending, coolingStatus, decisionHistory, validateCoolingItem, type CoolingOffItem } from "./cooling-off";
import type { Commitment } from "./planning";

const c = (o: Partial<Commitment>): Commitment => ({ id: "x", name: "x", kind: "other", direction: "out", amount: 0, frequency: "monthly", intervalDays: null, nextDue: "2026-11-05", accountId: null, category: "Miscellaneous", confirmed: true, essential: true, status: "active", ...o } as Commitment);
const base: StressInput = {
  cash: 60000, minBalance: 5000, reserves: 20000, monthlySpend: 30000, today: "2026-11-01", days: 60, loans: [],
  commitments: [
    c({ id: "sal", name: "Salary", direction: "in", amount: 100000, nextDue: "2026-11-01", category: "Salary" }),
    c({ id: "rent", name: "Rent", amount: 40000, nextDue: "2026-11-05" }),
  ],
};

describe("stress testing", () => {
  it("delayed salary by 15 days creates a shortfall before rent", () => {
    const r = stressTest(base, { ...defaultStress("salary_delayed"), delayDays: 15 });
    expect(r.shortFrom).toBe("2026-11-05");
    expect(r.daysUntilShort).toBe(4);
    expect(r.shortfall).toBe(5000); // 60000 - 40000 = 20000 vs floor 25000
    expect(r.reserveUsed).toBe(5000);
  });
  it("baseline plan holds and never touches the input commitments", () => {
    const before = JSON.stringify(base.commitments);
    const r = stressTest(base, { ...defaultStress("medical"), amount: 1000 });
    expect(r.shortfall).toBe(0);
    expect(r.shortFrom).toBeNull();
    expect(JSON.stringify(base.commitments)).toBe(before);
  });
  it("a large emergency payment uses the reserve up to its size only", () => {
    const r = stressTest(base, { ...defaultStress("emergency_payment"), amount: 200000 });
    expect(r.reserveUsed).toBe(20000);
    expect(r.shortfall).toBeGreaterThan(20000);
  });
  it("compares several scenarios", () => {
    expect(compareScenarios(base, [defaultStress("medical"), defaultStress("combined")]).map((r) => r.kind)).toEqual(["medical", "combined"]);
  });
});

const ap = (o: Partial<AutopilotInput> = {}): AutopilotInput => ({
  today: "2026-11-01", readiness: [], shortDates: [], lowestProjected: 0, overdue: [], anomalies: [],
  subscriptions: { monthly: 0, duplicates: [], increases: [] }, pendingReimbursements: { count: 0, amount: 0, oldestDays: 0 },
  overBudget: [], lateIncome: [], idleCash: 0, unreconciledOld: 0, ...o,
});

describe("autopilot", () => {
  it("ranks a forecast shortfall above a subscription increase", () => {
    const recs = autopilot(ap({ shortDates: ["2026-11-10"], lowestProjected: -500, subscriptions: { monthly: 0, duplicates: [], increases: [{ name: "Netflix", from: 499, to: 649 }] } }));
    expect(recs[0].priority).toBe("high");
    expect(recs[1].impact).toBe(1800);
  });
  it("only flags reimbursements waiting 14+ days", () => {
    expect(autopilot(ap({ pendingReimbursements: { count: 1, amount: 900, oldestDays: 13 } }))).toHaveLength(0);
    expect(autopilot(ap({ pendingReimbursements: { count: 1, amount: 900, oldestDays: 14 } }))).toHaveLength(1);
  });
  it("dismissed items stay hidden; snoozed ones return after their date", () => {
    const recs = autopilot(ap({ overdue: [{ name: "Rent", amount: 1, due: "2026-10-30" }], idleCash: 5000 }));
    const [a, b] = recs.map((r) => r.key);
    const acts = { [a]: { status: "dismissed" as const, at: "2026-11-01" }, [b]: { status: "later" as const, at: "2026-11-01", until: "2026-11-08" } };
    expect(applyAutopilotActions(recs, acts, "2026-11-02").active).toHaveLength(0);
    expect(applyAutopilotActions(recs, acts, "2026-11-08").active.map((r) => r.key)).toEqual([b]);
  });
});

const item = (o: Partial<CoolingOffItem>): CoolingOffItem => ({ id: "1", title: "Headphones", amount: 10000, category: "Shopping", proposedDate: "2026-11-01", priority: "low", reason: "", paymentMethod: null, waitDays: 7, createdAt: "2026-11-01T10:00:00Z", status: "waiting", decidedAt: null, ...o });

describe("cooling-off", () => {
  it("waits the chosen number of days before it is ready", () => {
    expect(coolingStatus(item({}), "2026-11-05")).toMatchObject({ status: "waiting", daysLeft: 3, readyAt: "2026-11-08" });
    expect(coolingStatus(item({}), "2026-11-08").status).toBe("ready");
  });
  it("rates affordability from safe-to-spend", () => {
    expect(affordability({ amount: 10000 }, { safeToSpend: 5000, upcomingObligations: 0, cash: 0 }).verdict).toBe("risky");
    expect(affordability({ amount: 10000 }, { safeToSpend: 15000, upcomingObligations: 0, cash: 0 }).verdict).toBe("tight");
    expect(affordability({ amount: 10000 }, { safeToSpend: 50000, upcomingObligations: 0, cash: 0 }).verdict).toBe("comfortable");
  });
  it("counts cancelled and postponed purchases as avoided, not purchased ones", () => {
    const items = [item({ id: "a", status: "cancelled", decidedAt: "2026-11-02" }), item({ id: "b", status: "postponed", amount: 500, decidedAt: "2026-11-03" }), item({ id: "c", status: "purchased", decidedAt: "2026-11-01" })];
    expect(avoidedSpending(items)).toBe(10500);
    expect(decisionHistory(items).map((i) => i.id)).toEqual(["b", "a", "c"]);
  });
  it("rejects empty amounts and waits over a year", () => {
    expect(() => validateCoolingItem({ title: "x", amount: 0, waitDays: 1, proposedDate: "2026-11-01" })).toThrow();
    expect(() => validateCoolingItem({ title: "x", amount: 1, waitDays: 400, proposedDate: "2026-11-01" })).toThrow();
  });
});
