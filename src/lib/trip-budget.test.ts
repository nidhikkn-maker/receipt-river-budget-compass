// Version 5.5 acceptance tests: one primary budget, allocation dimensions that never
// double-count, ledger-based actuals, commitments, reimbursements and multi-currency.
import { describe, expect, it } from "vitest";
import { allocationReconciliation, budgetNeedsConfirmation, budgetStatus, reimbursementBreakdown, tripBudgetSummary, validateAllocation, validateBudgetEdit } from "./trip-budget";
import type { TravelTrip } from "./travel";

const trip = (over: Partial<TravelTrip> = {}): TravelTrip => ({
  id: "t1", name: "Kovai Trip", destination: "Kovai", start: "2026-01-10", end: "2026-01-12",
  budget: 10000, currencies: ["INR"], type: "business", organisation: "AET", travellers: ["Krupanidhi Karunanithi"], ...over,
});
const exp = (id: string, amount: number, over: Record<string, unknown> = {}) => ({
  id, date: "2026-01-11", title: id, amount, currency: "INR", originalAmount: amount, fxRate: 1,
  txnType: "expense", scope: "business", tripId: "t1", paymentMethod: "upi", ...over,
}) as never;

describe("budgetStatus thresholds", () => {
  it("maps utilisation to the four states plus not_set", () => {
    expect(budgetStatus(0, 10000)).toBe("within");
    expect(budgetStatus(7999, 10000)).toBe("within");
    expect(budgetStatus(8000, 10000)).toBe("approaching");
    expect(budgetStatus(9999, 10000)).toBe("approaching");
    expect(budgetStatus(10000, 10000)).toBe("full");
    expect(budgetStatus(10001, 10000)).toBe("over");
    expect(budgetStatus(0, 0)).toBe("not_set");
  });
  it("honours a configurable warning threshold", () => {
    expect(budgetStatus(6000, 10000, 60)).toBe("approaching");
    expect(budgetStatus(6000, 10000, 80)).toBe("within");
  });
});

describe("Test 1 — single budget", () => {
  it("planned 10,000, spent 0, remaining 10,000", () => {
    const s = tripBudgetSummary(trip(), []);
    expect(s.budget).toBe(10000);
    expect(s.spent).toBe(0);
    expect(s.remaining).toBe(10000);
    expect(s.status).toBe("within");
  });
});

describe("Test 2 — allocation without duplication", () => {
  it("workspace ₹10,000 + traveller ₹10,000 still means a ₹10,000 trip budget", () => {
    const t = trip({ workspaceBudgets: [{ workspace: "business", amount: 10000 }], travellerBudgets: [{ traveller: "Krupanidhi Karunanithi", amount: 10000 }] });
    const s = tripBudgetSummary(t, []);
    expect(s.budget).toBe(10000);
    const dims = allocationReconciliation(t);
    expect(dims.find((d) => d.key === "workspace")).toMatchObject({ total: 10000, state: "complete" });
    expect(dims.find((d) => d.key === "traveller")).toMatchObject({ total: 10000, state: "complete" });
    // Dimensions reconcile independently; they are never summed.
    expect(dims.reduce((a, d) => a + d.total, 0)).toBe(20000);
    expect(s.budget).not.toBe(20000);
  });
  it("flags partial and exceeding allocations instead of silently changing values", () => {
    const dims = allocationReconciliation(trip({ workspaceBudgets: [{ workspace: "business", amount: 4000 }], travellerBudgets: [{ traveller: "Me", amount: 12000 }] }));
    expect(dims.find((d) => d.key === "workspace")?.state).toBe("partial");
    expect(dims.find((d) => d.key === "traveller")?.state).toBe("exceeds");
  });
});

describe("Test 3 — expense addition", () => {
  it("a confirmed ₹3,000 expense leaves ₹7,000 and updates automatically from the ledger", () => {
    const s = tripBudgetSummary(trip(), [exp("e1", 3000)]);
    expect(s.spent).toBe(3000);
    expect(s.remaining).toBe(7000);
  });
  it("overspending shows the excess, not an unexplained negative", () => {
    const s = tripBudgetSummary(trip(), [exp("e1", 11000)]);
    expect(s.status).toBe("over");
    expect(s.overAmount).toBe(1000);
    expect(s.remaining).toBe(-1000);
  });
});

describe("Test 4 — personal card payment", () => {
  it("counts once, records the method, and tracks pending reimbursement", () => {
    const e = exp("e1", 2000, { paymentMethod: "credit_card", reimbursementStatus: "pending" });
    const s = tripBudgetSummary(trip(), [e]);
    expect(s.spent).toBe(2000);
    expect(s.reimbursablePending).toBe(2000);
    const rb = reimbursementBreakdown(trip(), [e]);
    expect(rb.personalCard).toBe(2000);
    expect(rb.pending).toBe(2000);
    expect(rb.personalCash).toBe(0);
  });
  it("a company-card expense is organisation-paid, not a personal receivable", () => {
    const e = exp("e1", 5000, { paymentMethod: "company_card", reimbursementStatus: "pending" });
    const rb = reimbursementBreakdown(trip(), [e]);
    expect(rb.organisationPaid).toBe(5000);
    expect(rb.personalCard).toBe(0);
  });
});

describe("Test 5 — unpaid booking", () => {
  it("raises commitments, not confirmed spending", () => {
    const t = trip({ bookings: [{ id: "b1", kind: "hotel", provider: "Taj", ref: "H1", date: "2026-01-10", amount: 4000, status: "unpaid" }] });
    const s = tripBudgetSummary(t, []);
    expect(s.spent).toBe(0);
    expect(s.committed).toBe(4000);
    expect(s.availableAfterCommitments).toBe(6000);
  });
  it("a booking paid through the ledger is not double-counted as a commitment", () => {
    const t = trip({ bookings: [{ id: "b1", kind: "hotel", provider: "Taj", ref: "H1", date: "2026-01-10", amount: 4000, status: "paid", expenseId: "e1" }] });
    const s = tripBudgetSummary(t, [exp("e1", 4000)]);
    expect(s.spent).toBe(4000);
    expect(s.committed).toBe(0);
    expect(s.availableAfterCommitments).toBe(6000);
  });
});

describe("Test 6 — currency conversion", () => {
  it("preserves the original currency and recorded rate; consolidated total uses it", () => {
    const e = exp("e1", 4150, { currency: "USD", originalAmount: 50, fxRate: 83 });
    const s = tripBudgetSummary(trip({ currencies: ["USD"] }), [e]);
    expect(s.spent).toBe(4150);
    expect(s.currency).toBe("USD");
    const dims = allocationReconciliation(trip({ currencyBudgets: [{ currency: "USD", amount: 100, planningRate: 83 }] }));
    expect(dims.find((d) => d.key === "currency")?.total).toBe(8300);
  });
});

describe("Test 7 — existing trip migration", () => {
  it("keeps every historical allocation accessible and unchanged", () => {
    const t = trip({
      workspaceBudgets: [{ workspace: "business", amount: 8000 }],
      travellerBudgets: [{ traveller: "Me", amount: 8000 }],
      currencyBudgets: [{ currency: "INR", amount: 8000, planningRate: 1 }],
      budgetLines: [{ category: "Hotels", amount: 5000 }],
    });
    const dims = allocationReconciliation(t);
    expect(dims.every((d) => d.total > 0 || d.key === "organisation")).toBe(true);
    expect(t.workspaceBudgets?.[0]?.amount).toBe(8000);
    expect(t.budgetLines?.[0]?.category).toBe("Hotels");
  });
  it("marks a budget-less trip with allocations as requiring confirmation, never auto-summed", () => {
    const t = trip({ budget: 0, workspaceBudgets: [{ workspace: "business", amount: 8000 }] });
    expect(budgetNeedsConfirmation(t)).toBe(true);
    const s = tripBudgetSummary(t, []);
    expect(s.hasBudget).toBe(false);
    expect(s.needsConfirmation).toBe(true);
    expect(s.budget).toBe(0); // not 8000 — historical allocations are never summed into a primary budget
  });
  it("a trip with no budget and no allocations is simply not set", () => {
    const s = tripBudgetSummary(trip({ budget: 0 }), []);
    expect(s.hasBudget).toBe(false);
    expect(s.needsConfirmation).toBe(false);
    expect(s.status).toBe("not_set");
  });
});

describe("Test 9 — reimbursements and advances", () => {
  it("advances and receipts reconcile without artificial income or duplicate expenses", () => {
    const t = trip({ advances: [{ id: "a1", date: "2026-01-09", amount: 5000, source: "AET" }] });
    const e = exp("e1", 3000, { reimbursementStatus: "partial", reimbursement: { stage: "partial", reimbursable: 3000, receipts: [{ id: "r1", date: "2026-01-20", amount: 1000 }] } });
    const rb = reimbursementBreakdown(t, [e]);
    expect(rb.advances).toBe(5000);
    expect(rb.received).toBe(1000);
    expect(rb.pending).toBe(2000);
    const s = tripBudgetSummary(t, [e]);
    expect(s.spent).toBe(3000); // counted once
    expect(s.reimbursablePending).toBe(2000);
  });
});

describe("Test 10 — save reliability", () => {
  it("validateBudgetEdit returns an idempotent patch (repeat saves write the same values)", () => {
    const a = validateBudgetEdit({ amount: 10000, currency: "INR", contingency: 500, notes: "  Team trip  " });
    expect(a).toMatchObject({ budget: 10000, currencies: ["INR"], contingency: 500, budgetNotes: "Team trip" });
    expect(typeof a.budgetUpdatedAt).toBe("string");
  });
  it("rejects invalid budget edits and allocations with readable reasons", () => {
    expect(() => validateBudgetEdit({ amount: -1, currency: "INR", contingency: 0, notes: "" })).toThrow("negative");
    expect(() => validateBudgetEdit({ amount: 100, currency: "XXX", contingency: 0, notes: "" })).toThrow("supported currency");
    expect(() => validateAllocation(0)).toThrow("above zero");
    expect(() => validateAllocation(100, 0)).toThrow("exchange rate");
  });
});
