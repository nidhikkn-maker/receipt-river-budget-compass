import { addMoney, multiplyMoney, proportionMoney, roundMoney, subtractMoney, sumMoney } from "./money";
// Money Allocation Engine: recommends how to distribute recorded income across commitments,
// cards, loans, reserves and goals. Pure, tested. Allocations are internal plans — they never
// move money between accounts, and a plan's total can never exceed the eligible funds.

import { monthlyCost, type Commitment } from "./planning";

export const BUCKETS = ["mandatory", "card", "loan", "household", "emergency", "annual", "goals", "investments", "discretionary"] as const;
export type Bucket = (typeof BUCKETS)[number];
export const BUCKET_LABEL: Record<Bucket, string> = {
  mandatory: "Mandatory commitments", card: "Credit card payments", loan: "Loan repayments", household: "Household spending",
  emergency: "Emergency reserve", annual: "Planned annual expenses", goals: "Financial goals", investments: "Investments", discretionary: "Free to spend",
};

export interface AllocationLine {
  bucket: Bucket;
  label: string;
  amount: number;
  /** What this line is based on, so the user can check the maths. */
  note?: string | undefined;
}

export interface AllocationPlan {
  id: string;
  title: string;
  /** Date the income was received/expected. */
  incomeDate: string;
  /** Eligible funds the plan distributes. */
  amount: number;
  lines: AllocationLine[];
  carryForward: boolean;
  createdAt: string;
}

const r2 = roundMoney;

export interface AllocationInput {
  /** Income amount to distribute. */
  amount: number;
  today: string;
  /** Days the plan should cover (defaults to ~1 month). */
  horizonDays?: number;
  commitments: Commitment[];
  /** Card bill amounts due within the horizon: [{ name, amount }]. */
  cardDues: { name: string; amount: number }[];
  /** Loan EMIs due within the horizon: [{ name, amount }]. */
  loanEmis: { name: string; amount: number }[];
  /** Monthly household/living budget (category budgets total). */
  householdMonthly: number;
  /** Emergency reserve: target and saved so far. */
  emergency: { target: number; saved: number };
  /** Goals with a monthly contribution. */
  goals: { name: string; monthly: number }[];
  /** Optional fixed investment contribution per month. */
  investmentsMonthly?: number;
}

/**
 * Recommended distribution of `amount`. Fixed obligations (mandatory commitments, card dues, EMIs)
 * come first; what remains is split across household, reserves, annual accruals, goals, investments
 * and free spending. The total is always ≤ the eligible amount — when obligations alone exceed it,
 * the shortfall is reported and every flexible line is zero.
 */
export function suggestAllocation(i: AllocationInput): { lines: AllocationLine[]; total: number; unallocated: number; shortfall: number } {
  const horizon = Math.max(1, i.horizonDays ?? 30);
  const until = addDaysLocal(i.today, horizon);
  const due = i.commitments.filter((c) => c.status === "active" && c.direction === "out" && c.nextDue <= until);

  const mandatory = sumMoney(due.filter(c => c.essential).map(c => c.amount));
  const card = sumMoney(i.cardDues.map(c => c.amount));
  const loan = sumMoney(i.loanEmis.map(l => l.amount));
  const fixed = addMoney(mandatory, card, loan);

  const household = proportionMoney(Math.max(0, i.householdMonthly), horizon, 30.44);
  // Yearly/half-yearly commitments accrue monthly so the money is there when the bill arrives.
  const annual = proportionMoney(sumMoney(i.commitments.filter(c => c.status === "active" && c.direction === "out" && ["yearly", "half_yearly", "quarterly"].includes(c.frequency)).map(c => monthlyCost(c))), horizon, 30.44);
  const emergencyGap = Math.max(0, subtractMoney(i.emergency.target, i.emergency.saved));
  const emergency = r2(Math.min(emergencyGap, multiplyMoney(Math.max(0, i.amount), 0.1)));
  const goals = proportionMoney(sumMoney(i.goals.map(g => Math.max(0, g.monthly))), horizon, 30.44);
  const investments = proportionMoney(Math.max(0, i.investmentsMonthly ?? 0), horizon, 30.44);

  const lines: AllocationLine[] = [];
  const push = (bucket: Bucket, amount: number, note?: string) => { if (amount > 0.004) lines.push({ bucket, label: BUCKET_LABEL[bucket], amount: r2(amount), note }); };

  if (fixed > i.amount) {
    // Obligations alone exceed the income: fund them in priority order, flag the gap.
    let left = Math.max(0, i.amount);
    const take = (n: number) => { const t = r2(Math.min(n, left)); left = subtractMoney(left, t); return t; };
    push("mandatory", take(mandatory), `${due.filter((c) => c.essential).length} essential payments due by ${until}`);
    push("card", take(card), i.cardDues.map((c) => c.name).join(", "));
    push("loan", take(loan), i.loanEmis.map((l) => l.name).join(", "));
    const total = sumMoney(lines.map(l => l.amount));
    return { lines, total, unallocated: 0, shortfall: subtractMoney(fixed, i.amount) };
  }

  push("mandatory", mandatory, `${due.filter((c) => c.essential).length} essential payments due by ${until}`);
  push("card", card, i.cardDues.map((c) => c.name).join(", "));
  push("loan", loan, i.loanEmis.map((l) => l.name).join(", "));
  // Optional targets share only what remains after the fixed obligations.
  // Fund them in the displayed priority order, rounding after each allocation.
  let remaining = r2(Math.max(0, subtractMoney(i.amount, fixed)));
  const flexible = (bucket: Bucket, target: number, note?: string) => {
    const funded = r2(Math.min(target, remaining));
    remaining = subtractMoney(remaining, funded);
    push(bucket, funded, note);
  };
  flexible("household", household, "Monthly living budget");
  flexible("emergency", emergency, emergencyGap > 0 ? `Reserve gap ₹${Math.round(emergencyGap).toLocaleString("en-IN")}` : "Reserve target reached");
  flexible("annual", annual, "Set aside for yearly/quarterly bills");
  flexible("goals", goals, i.goals.filter((g) => g.monthly > 0).map((g) => g.name).join(", "));
  flexible("investments", investments);

  const total = sumMoney(lines.map(l => l.amount));
  const unallocated = r2(Math.max(0, subtractMoney(i.amount, total)));
  if (unallocated > 0.004) lines.push({ bucket: "discretionary", label: BUCKET_LABEL.discretionary, amount: unallocated, note: "Left over after everything above" });
  return { lines, total: addMoney(total, unallocated), unallocated, shortfall: 0 };
}

/** A plan is valid only when every line is non-negative and the total never exceeds the eligible funds. */
export function validateAllocation(lines: AllocationLine[], available: number): void {
  if (!Number.isFinite(available) || !(available > 0)) throw new Error("Enter the income amount first");
  for (const l of lines) {
    if (!Number.isFinite(l.amount) || !(l.amount >= 0)) throw new Error(`${l.label} can't be negative`);
    if (!l.label.trim()) throw new Error("Every line needs a label");
  }
  const total = sumMoney(lines.map(l => l.amount));
  if (total > available + 0.005) throw new Error(`The plan adds up to ₹${total.toLocaleString("en-IN")} — more than the ₹${available.toLocaleString("en-IN")} available`);
}

export interface ActualLine { bucket: Bucket; label: string; planned: number; actual: number; difference: number }

/**
 * Compare a saved plan with what actually happened. Matching is by the spending categories and
 * commitment names each bucket covers, so a rupee is counted once.
 */
export function plannedVsActual(
  plan: AllocationPlan,
  actual: { mandatory: number; card: number; loan: number; household: number; emergency: number; annual: number; goals: number; investments: number; discretionary: number },
): ActualLine[] {
  return plan.lines.map((l) => {
    const a = r2(actual[l.bucket] ?? 0);
    return { bucket: l.bucket, label: l.label, planned: l.amount, actual: a, difference: subtractMoney(a, l.amount) };
  });
}

/** Unspent planned amounts can roll into the next plan when carry-forward is on. Overspending never rolls. */
export function carryForwardAmounts(plan: AllocationPlan, actual: ActualLine[]): Record<Bucket, number> {
  const out = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
  if (!plan.carryForward) return out;
  for (const l of actual) out[l.bucket] = r2(Math.max(0, subtractMoney(l.planned, l.actual)));
  return out;
}

function addDaysLocal(s: string, n: number) {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
