// Compact Trip Budget (Version 5.5). One primary trip budget plus optional allocation
// dimensions (workspace, traveller, category, currency, organisation). Dimensions are
// views of the same plan — they are NEVER added together. Actuals come only from the
// shared ledger via tripFinance; unpaid bookings stay commitments, never spending.
import { tripFinance, type TravelTrip } from "./travel";
import { isTracked, outstandingOf, receivedOf } from "./reimbursements";
import { CURRENCIES } from "./expenses";

const r2 = (n: number) => Math.round(n * 100) / 100;
type Txns = Parameters<typeof tripFinance>[1];

export type BudgetStatus = "not_set" | "within" | "approaching" | "full" | "over";
export const BUDGET_STATUS_LABEL: Record<BudgetStatus, string> = {
  not_set: "Budget not set",
  within: "Within Budget",
  approaching: "Approaching Limit",
  full: "Budget Fully Utilised",
  over: "Over Budget",
};

/** Utilisation status against the primary budget. warnAt/fullAt are percentages (defaults 80/100). */
export function budgetStatus(spent: number, budget: number, warnAt = 80, fullAt = 100): BudgetStatus {
  if (!(budget > 0)) return "not_set";
  const pct = (spent / budget) * 100;
  if (pct > fullAt) return "over";
  if (pct === fullAt) return "full";
  if (pct >= warnAt) return "approaching";
  return "within";
}

/** True when no primary budget exists but historical allocation dimensions do — the user must confirm, never auto-summed. */
export function budgetNeedsConfirmation(t: TravelTrip): boolean {
  if (t.budget > 0) return false;
  return (t.workspaceBudgets?.length ?? 0) + (t.travellerBudgets?.length ?? 0) + (t.currencyBudgets?.length ?? 0) + (t.budgetLines?.length ?? 0) + (t.organisationBudgets?.length ?? 0) > 0;
}

export interface TripBudgetSummary {
  hasBudget: boolean;
  needsConfirmation: boolean;
  budget: number;
  currency: string;
  contingency: number;
  notes: string;
  updatedAt: string | null;
  /** Confirmed expenses from the shared ledger, counted once. */
  spent: number;
  /** Primary budget − confirmed expenses (negative means over). */
  remaining: number;
  /** Amount over budget, 0 when within. Shown instead of a bare negative. */
  overAmount: number;
  /** Unpaid bookings — commitments, not spending. */
  committed: number;
  /** Primary budget − confirmed expenses − outstanding commitments. */
  availableAfterCommitments: number;
  reimbursablePending: number;
  status: BudgetStatus;
}

/** The compact card's numbers. Every figure comes from the primary budget and the shared ledger. */
export function tripBudgetSummary(t: TravelTrip, txns: Txns, warnAt = 80): TripBudgetSummary {
  const f = tripFinance(t, txns);
  const budget = r2(t.budget > 0 ? t.budget : 0);
  const spent = r2(f.total);
  const committed = r2(f.committed);
  const remaining = r2(budget - spent);
  return {
    hasBudget: budget > 0,
    needsConfirmation: budgetNeedsConfirmation(t),
    budget,
    currency: t.currencies?.[0] ?? "INR",
    contingency: r2(t.contingency ?? 0),
    notes: t.budgetNotes ?? "",
    updatedAt: t.budgetUpdatedAt ?? null,
    spent,
    remaining,
    overAmount: remaining < 0 ? r2(-remaining) : 0,
    committed,
    availableAfterCommitments: r2(budget - spent - committed),
    reimbursablePending: r2(f.reimbursablePending),
    status: budgetStatus(spent, budget, warnAt),
  };
}

export type AllocationState = "none" | "partial" | "complete" | "exceeds";
export interface AllocationDimension { key: "workspace" | "traveller" | "category" | "currency" | "organisation"; label: string; total: number; state: AllocationState }

/**
 * Each allocation dimension reconciles independently against the primary budget.
 * Dimensions are never summed together — a workspace plan of ₹10,000 plus a traveller
 * plan of ₹10,000 still means a ₹10,000 trip budget, not ₹20,000.
 */
export function allocationReconciliation(t: TravelTrip): AllocationDimension[] {
  const budget = t.budget > 0 ? r2(t.budget) : 0;
  const state = (total: number): AllocationState => {
    if (total <= 0) return "none";
    if (!budget) return "partial"; // no primary budget to reconcile against
    if (total > budget + 0.005) return "exceeds";
    return Math.abs(total - budget) <= 0.005 ? "complete" : "partial";
  };
  const dims: AllocationDimension[] = [
    { key: "workspace", label: "By workspace", total: r2((t.workspaceBudgets ?? []).reduce((s, x) => s + x.amount, 0)), state: "none" },
    { key: "traveller", label: "By traveller", total: r2((t.travellerBudgets ?? []).reduce((s, x) => s + x.amount, 0)), state: "none" },
    { key: "category", label: "By category", total: r2((t.budgetLines ?? []).reduce((s, x) => s + x.amount, 0)), state: "none" },
    // Currency allocations convert at their saved planning rates; historic rates are never recalculated.
    { key: "currency", label: "By currency", total: r2((t.currencyBudgets ?? []).reduce((s, x) => s + x.amount * x.planningRate, 0)), state: "none" },
    { key: "organisation", label: "By organisation", total: r2((t.organisationBudgets ?? []).reduce((s, x) => s + x.amount, 0)), state: "none" },
  ];
  return dims.map((d) => ({ ...d, state: state(d.total) }));
}

export interface ReimbursementBreakdown {
  /** Eligible expenses paid from own cash/bank/UPI. */
  personalCash: number;
  /** Eligible expenses paid through personal cards. */
  personalCard: number;
  /** Tracked expenses paid with a company card — usually NOT a personal receivable. */
  organisationPaid: number;
  /** Travel advances received (reconciled separately, never income). */
  advances: number;
  /** Reimbursements already received (settles the original spend, never income). */
  received: number;
  /** Still pending reimbursement. */
  pending: number;
}

const CARD_METHODS = new Set(["credit_card", "debit_card", "forex_card", "rupay_upi"]);

/** §5.4 breakdown. Eligibility comes from each entry's configured reimbursement status — never assumed from workspace alone. */
export function reimbursementBreakdown(t: TravelTrip, txns: Txns): ReimbursementBreakdown {
  const f = tripFinance(t, txns);
  const out: ReimbursementBreakdown = { personalCash: 0, personalCard: 0, organisationPaid: 0, advances: r2(f.advanced), received: 0, pending: 0 };
  for (const e of f.entries as (typeof f.entries[number] & { paymentMethod?: string })[]) {
    if (!isTracked(e as Parameters<typeof isTracked>[0])) continue;
    const eligible = outstandingOf(e) + receivedOf(e);
    if (e.paymentMethod === "company_card") out.organisationPaid = r2(out.organisationPaid + eligible);
    else if (CARD_METHODS.has(e.paymentMethod ?? "")) out.personalCard = r2(out.personalCard + eligible);
    else out.personalCash = r2(out.personalCash + eligible);
    out.received = r2(out.received + receivedOf(e));
    out.pending = r2(out.pending + outstandingOf(e));
  }
  return out;
}

export interface BudgetEdit { amount: number; currency: string; contingency: number; notes: string }

/** Validate the Edit Budget sheet. Returns the cleaned patch or throws a user-readable reason. */
export function validateBudgetEdit(x: BudgetEdit): Pick<TravelTrip, "budget" | "contingency" | "budgetNotes" | "budgetUpdatedAt"> & { currencies: string[] } {
  if (!Number.isFinite(x.amount) || x.amount < 0) throw new Error("Budget can't be negative");
  if (!Number.isFinite(x.contingency) || x.contingency < 0) throw new Error("Contingency can't be negative");
  if (!(CURRENCIES as readonly string[]).includes(x.currency)) throw new Error("Pick a supported currency");
  return {
    budget: r2(x.amount),
    currencies: [x.currency],
    contingency: r2(x.contingency),
    budgetNotes: x.notes.trim().slice(0, 300),
    budgetUpdatedAt: new Date().toISOString(),
  };
}

/** Validate one allocation row for any dimension. Amount must be positive; currency rows need a positive planning rate. */
export function validateAllocation(amount: number, rate = 1): void {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount above zero");
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Enter a positive planning exchange rate");
}
