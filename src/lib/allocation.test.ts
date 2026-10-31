import { describe, expect, it } from "vitest";
import { carryForwardAmounts, plannedVsActual, suggestAllocation, validateAllocation, type AllocationPlan } from "./allocation";
import type { Commitment } from "./planning";

const today = "2026-10-31";
const mk = (over: Partial<Commitment>): Commitment => ({
  id: over.id ?? crypto.randomUUID(), name: "Bill", kind: "bill", direction: "out", amount: 1000, frequency: "monthly",
  intervalDays: null, nextDue: "2026-11-05", accountId: null, category: "Utilities", confirmed: true, essential: true, status: "active", ...over,
});

describe("suggestAllocation", () => {
  it("puts fixed obligations first and never exceeds the income", () => {
    const r = suggestAllocation({
      amount: 100000, today,
      commitments: [mk({ amount: 15000, name: "Rent" }), mk({ amount: 2000, essential: false, name: "OTT" })],
      cardDues: [{ name: "AMEX", amount: 10000 }], loanEmis: [{ name: "Car loan", amount: 12000 }],
      householdMonthly: 20000, emergency: { target: 100000, saved: 40000 }, goals: [{ name: "Holiday", monthly: 5000 }],
    });
    const total = r.lines.reduce((s, l) => s + l.amount, 0);
    expect(total).toBeLessThanOrEqual(100000);
    expect(r.shortfall).toBe(0);
    expect(r.lines.find((l) => l.bucket === "mandatory")?.amount).toBe(15000);
    expect(r.lines.find((l) => l.bucket === "card")?.amount).toBe(10000);
    expect(r.lines.find((l) => l.bucket === "loan")?.amount).toBe(12000);
    expect(r.lines.find((l) => l.bucket === "discretionary")?.amount).toBeGreaterThan(0);
  });

  it("reports a shortfall when obligations alone exceed the income and zeroes flexible lines", () => {
    const r = suggestAllocation({
      amount: 20000, today,
      commitments: [mk({ amount: 18000, name: "Rent" })],
      cardDues: [{ name: "AMEX", amount: 8000 }], loanEmis: [],
      householdMonthly: 15000, emergency: { target: 50000, saved: 0 }, goals: [{ name: "G", monthly: 3000 }],
    });
    expect(r.shortfall).toBe(6000);
    expect(r.lines.every((l) => ["mandatory", "card", "loan"].includes(l.bucket))).toBe(true);
    expect(r.lines.reduce((s, l) => s + l.amount, 0)).toBeLessThanOrEqual(20000);
  });
});

describe("validateAllocation", () => {
  it("rejects plans whose total exceeds the eligible funds", () => {
    expect(() => validateAllocation([{ bucket: "goals", label: "Goals", amount: 6000 }, { bucket: "mandatory", label: "Bills", amount: 5000 }], 10000)).toThrow(/more than/);
  });
  it("rejects negative lines and accepts a plan within the funds", () => {
    expect(() => validateAllocation([{ bucket: "goals", label: "Goals", amount: -1 }], 10000)).toThrow(/negative/);
    expect(() => validateAllocation([{ bucket: "goals", label: "Goals", amount: 4000 }], 10000)).not.toThrow();
  });
});

describe("plannedVsActual + carryForward", () => {
  const plan: AllocationPlan = {
    id: "p1", title: "October salary", incomeDate: "2026-10-01", amount: 50000, carryForward: true, createdAt: "2026-10-01",
    lines: [{ bucket: "household", label: "Household", amount: 20000 }, { bucket: "goals", label: "Goals", amount: 10000 }],
  };
  it("compares planned and actual per bucket", () => {
    const rows = plannedVsActual(plan, { mandatory: 0, card: 0, loan: 0, household: 18500, emergency: 0, annual: 0, goals: 10000, investments: 0, discretionary: 0 });
    expect(rows.find((r) => r.bucket === "household")).toMatchObject({ planned: 20000, actual: 18500, difference: -1500 });
  });
  it("carries forward only unspent amounts, never overspending", () => {
    const rows = plannedVsActual(plan, { mandatory: 0, card: 0, loan: 0, household: 18500, emergency: 0, annual: 0, goals: 12000, investments: 0, discretionary: 0 });
    const carry = carryForwardAmounts(plan, rows);
    expect(carry.household).toBe(1500);
    expect(carry.goals).toBe(0);
  });
  it("carries nothing when carry-forward is off", () => {
    const rows = plannedVsActual({ ...plan, carryForward: false }, { mandatory: 0, card: 0, loan: 0, household: 1000, emergency: 0, annual: 0, goals: 0, investments: 0, discretionary: 0 });
    expect(carryForwardAmounts({ ...plan, carryForward: false }, rows).household).toBe(0);
  });
});
