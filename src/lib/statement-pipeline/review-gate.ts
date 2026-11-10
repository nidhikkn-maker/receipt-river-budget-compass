// C11 review gate (KK decision C11, 10 Nov 2026; release blocker RB-DEC-C11).
// Every automatically classified statement row needs its own explicit approval before it is saved and
// posted. Saving many individually approved rows in one batch is allowed; one unchecked tap that saves
// every suggestion is not. Graduated automation thresholds stay 99.5% (amounts and dates), 97%
// (categories) and at least 200 verified real rows per issuer; until KK separately approves autopilot,
// meeting them only shows the evidence — it never pre-approves a row.
// Enforced three times: here (Statement Desk / applyUpload), in saveExpense (server) and in the P7
// posting trigger (database: C11_REVIEW_REQUIRED). Pure functions, no I/O.

export const AUTOMATION_THRESHOLDS = { amountDateAccuracy: 0.995, categoryAccuracy: 0.97, minVerifiedRows: 200 } as const;

export interface IssuerAccuracy { issuer: string; verifiedRows: number; amountDateAccuracy: number; categoryAccuracy: number }

/** Evidence check only: true when an issuer has met every graduated threshold on verified real rows. */
export function automationEarned(a: IssuerAccuracy | null | undefined): boolean {
  if (!a) return false;
  const finite = [a.verifiedRows, a.amountDateAccuracy, a.categoryAccuracy].every(Number.isFinite);
  return finite && a.verifiedRows >= AUTOMATION_THRESHOLDS.minVerifiedRows
    && a.amountDateAccuracy >= AUTOMATION_THRESHOLDS.amountDateAccuracy && a.categoryAccuracy >= AUTOMATION_THRESHOLDS.categoryAccuracy;
}

/** C11 in this release: explicit approval is required even when automation has been earned. */
export const rowApprovalRequired = (_a?: IssuerAccuracy | null): true => true;

export interface Classification { source: "statement"; automatic: true }
export interface ReviewStamp { approvedAt: string; method: "row"; key: string }

export const C11_MESSAGE = "Each automatically classified row needs your own approval before it is saved.";

/** Approved line keys -> approval time. Only rows the person ticked are present. */
export type Approvals = Readonly<Record<string, string>>;

export function approve(approvals: Approvals, key: string, at = new Date().toISOString()): Approvals {
  return approvals[key] ? approvals : { ...approvals, [key]: at };
}
export function unapprove(approvals: Approvals, key: string): Approvals {
  if (!approvals[key]) return approvals;
  const next = { ...approvals };
  delete next[key];
  return next;
}

/** The decisions to save: exactly the approved ones, in plan order. Nothing is added by default. */
export function approvedDecisions<D extends { line: { key: string } }>(decisions: readonly D[], approvals: Approvals): D[] {
  return decisions.filter((d) => !!approvals[d.line.key]);
}

/** Throws before any write when a decision to be saved has no approval. */
export function assertReviewed(decisions: readonly { line: { key: string } }[], approvals: Approvals): void {
  const missing = decisions.filter((d) => !approvals[d.line.key]);
  if (missing.length) throw new Error(`${C11_MESSAGE} ${missing.length} row${missing.length === 1 ? " is" : "s are"} not approved.`);
}

/** Receipt details stamped with the classification and (when approved) the person's review. */
export function stampReview<T extends object>(details: T | undefined, key: string, approvedAt: string | undefined): T & { classification: Classification; review?: ReviewStamp } {
  const base = { ...(details ?? {}) } as T & { classification: Classification; review?: ReviewStamp };
  base.classification = { source: "statement", automatic: true };
  if (approvedAt) base.review = { approvedAt, method: "row", key: key.slice(0, 200) };
  else delete base.review;
  return base;
}

type Stamped = { classification?: { automatic?: boolean } | undefined; review?: { approvedAt?: string } | undefined } | null | undefined;
/** Server/database rule in one place: an automatic classification without a review is refused. */
export function c11ReviewError(details: Stamped): string | null {
  if (details?.classification?.automatic === true && !details.review?.approvedAt) return C11_MESSAGE;
  return null;
}

/** Button text: it always states how many individually approved rows will be saved. */
export function saveApprovedLabel(n: number): string {
  return n === 0 ? "Approve rows to save" : `Save ${n} approved row${n === 1 ? "" : "s"}`;
}
