// Reimbursement tracking rules: money you paid on behalf of a person, organisation or project.
// Receipts back are reimbursement entries (never income); outstanding amounts are derived, never stored.
import type { Expense, ReimbursementStatus } from "./expenses";

export const REIMB_STAGES = ["not_submitted", "submitted", "under_review", "partial", "received", "rejected", "written_off"] as const;
export type ReimbStage = (typeof REIMB_STAGES)[number];
export const REIMB_STAGE_LABEL: Record<ReimbStage, string> = {
  not_submitted: "Not submitted", submitted: "Submitted", under_review: "Under review", partial: "Partially received",
  received: "Fully received", rejected: "Rejected", written_off: "Written off",
};
export interface ReimbReceipt { id: string; date: string; amount: number; txnId?: string | null; note?: string }
export interface ReimbursementInfo {
  stage?: ReimbStage; reimbursable?: number; payer?: string; purpose?: string;
  submittedOn?: string | null; expectedOn?: string | null; receipts?: ReimbReceipt[]; remarks?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
type E = Pick<Expense, "id" | "amount" | "date" | "reimbursementStatus" | "reimbursement" | "title">;

export const isTracked = (e: E) => (e.reimbursementStatus ?? "none") !== "none" || !!e.reimbursement?.stage;
export const reimbursableOf = (e: E) => r2(Math.min(e.amount, e.reimbursement?.reimbursable ?? e.amount));
export const receivedOf = (e: E) => {
  const r = (e.reimbursement?.receipts ?? []).reduce((s, x) => s + x.amount, 0);
  // Older claims settled in one step have no receipt lines: the whole claim was received.
  return r2(r === 0 && e.reimbursementStatus === "received" ? reimbursableOf(e) : r);
};
export function stageOf(e: E): ReimbStage {
  const st = e.reimbursement?.stage;
  if (st === "rejected" || st === "written_off") return st;
  const got = receivedOf(e), due = reimbursableOf(e);
  if (got >= due && due > 0) return "received";
  if (got > 0) return "partial";
  return st && st !== "partial" && st !== "received" ? st : "not_submitted";
}
/** Rejected and written-off claims become personal cost, so nothing is outstanding. */
export const outstandingOf = (e: E) => { const s = stageOf(e); return s === "rejected" || s === "written_off" ? 0 : r2(Math.max(0, reimbursableOf(e) - receivedOf(e))); };
/** Database status column: pending while money is still expected. */
export const statusColumn = (e: E): ReimbursementStatus => { const s = stageOf(e); return s === "received" ? "received" : s === "rejected" || s === "written_off" ? "none" : "pending"; };

/** Validates a new receipt against what is still outstanding. */
export function validateReceipt(e: E, amount: number) {
  if (!(amount > 0)) throw new Error("Enter the amount received");
  const left = outstandingOf(e);
  if (r2(amount) > left) throw new Error(`Only ₹${left.toLocaleString("en-IN")} is outstanding on this claim`);
}

export const ageBucket = (from: string, today: string) => {
  const d = Math.floor((Date.parse(today) - Date.parse(from)) / 86_400_000);
  return d <= 30 ? "0–30 days" : d <= 60 ? "31–60 days" : d <= 90 ? "61–90 days" : "Over 90 days";
};
export const AGE_BUCKETS = ["0–30 days", "31–60 days", "61–90 days", "Over 90 days"];

export function reimbursementSummary(list: E[], today: string) {
  const tracked = list.filter(isTracked);
  const byPayer: Record<string, number> = {}, byAge: Record<string, number> = Object.fromEntries(AGE_BUCKETS.map((b) => [b, 0]));
  let gross = 0, reimbursable = 0, received = 0, outstanding = 0, writtenOff = 0;
  for (const e of tracked) {
    const out = outstandingOf(e), s = stageOf(e);
    gross += e.amount; received += receivedOf(e); outstanding += out;
    if (s === "rejected" || s === "written_off") writtenOff += r2(reimbursableOf(e) - receivedOf(e)); else reimbursable += reimbursableOf(e);
    if (out > 0) {
      const payer = e.reimbursement?.payer?.trim() || "Unassigned";
      byPayer[payer] = r2((byPayer[payer] ?? 0) + out);
      const b = ageBucket(e.reimbursement?.submittedOn || e.date, today); byAge[b] = r2((byAge[b] ?? 0) + out);
    }
  }
  return {
    count: tracked.length, gross: r2(gross), reimbursable: r2(reimbursable), received: r2(received), outstanding: r2(outstanding), writtenOff: r2(writtenOff),
    /** What these payments really cost you after expected and received reimbursements. */
    netPersonalCost: r2(gross - reimbursable), byPayer, byAge,
  };
}
