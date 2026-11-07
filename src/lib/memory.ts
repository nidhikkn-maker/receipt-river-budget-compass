// Financial memory: decisions you made, what you expected, and what actually happened.
// Pure, tested. Entries are notes about decisions — they never change ledger records.

export interface DecisionMemory {
  id: string;
  title: string;
  decidedOn: string;
  reason: string;
  /** Expected monthly ₹ effect (+ saves/earns, − costs). */
  expected: number;
  reviewOn: string;
  /** Recorded actual monthly ₹ effect once reviewed. */
  actual: number | null;
  lesson: string;
  reviewedAt: string | null;
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export function validateDecision(d: Pick<DecisionMemory, "title" | "decidedOn" | "reviewOn" | "expected">): void {
  if (!d.title.trim()) throw new Error("Describe the decision");
  if (!isDate(d.decidedOn) || !isDate(d.reviewOn)) throw new Error("Pick both dates");
  if (d.reviewOn < d.decidedOn) throw new Error("The review date must be after the decision date");
  if (!Number.isFinite(d.expected) || Math.abs(d.expected) > 1e8) throw new Error("Check the expected amount");
}

export type DecisionState = "waiting" | "due" | "better" | "as_expected" | "worse";

/** Where a decision stands. Within 10% (or ₹100) of the expectation counts as "as expected". */
export function decisionState(d: DecisionMemory, today: string): DecisionState {
  if (d.actual == null) return today >= d.reviewOn ? "due" : "waiting";
  const tol = Math.max(100, Math.abs(d.expected) * 0.1);
  if (Math.abs(d.actual - d.expected) <= tol) return "as_expected";
  return d.actual > d.expected ? "better" : "worse";
}

/** Decisions waiting for a review, oldest review date first. */
export function dueForReview(list: DecisionMemory[], today: string): DecisionMemory[] {
  return list.filter((d) => decisionState(d, today) === "due").sort((a, b) => a.reviewOn.localeCompare(b.reviewOn));
}

/** Summary across reviewed decisions. */
export function memorySummary(list: DecisionMemory[]) {
  const reviewed = list.filter((d) => d.actual != null);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    reviewed: reviewed.length,
    expectedTotal: r2(reviewed.reduce((s, d) => s + d.expected, 0)),
    actualTotal: r2(reviewed.reduce((s, d) => s + (d.actual ?? 0), 0)),
  };
}
