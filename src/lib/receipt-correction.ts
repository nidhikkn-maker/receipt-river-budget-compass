// Claim receipt correction (P20 'correct_claim_receipt'): reduce how much of a money-back entry ONE claim cites.
// Money back is allocated once across claims (date, then id order); when two claims cite the same entry, the later
// citation can be "already counted" elsewhere and must be reduced to the part not counted, or removed (0). The money
// entry itself is never changed, and a correction never increases a citation (that stays with claim_receipt) or
// changes its txnId, date or account. It runs through finance_operation: owner-checked, idempotent by operationId,
// audited (public.claim_receipt_corrections) and status-consistent (statusColumn).
import type { Expense } from "./expenses";
import { roundMoney, subtractMoney } from "./money";
import { statusColumn, type ReimbReceipt, type ReimbursementInfo } from "./reimbursements";

export interface ReceiptCorrection { receiptId: string; newAmount: number; reason: string; operationId: string }
export interface ReceiptCorrectionPlan {
  receipt: ReimbReceipt; before: number; after: number; reason: string;
  info: ReimbursementInfo; status: ReturnType<typeof statusColumn>;
  payload: { operationId: string; id: string; receiptId: string; expectedAmount: number; newAmount: number; reason: string };
}
type Claim = Pick<Expense, "id" | "amount" | "date" | "reimbursementStatus" | "reimbursement" | "title">;
const ALLOWED = new Set(["receiptId", "newAmount", "reason", "operationId"]);

/** Validates a correction and returns the claim as it will be saved; throws a user-facing message on refusal. */
export function planReceiptCorrection(e: Claim, c: ReceiptCorrection): ReceiptCorrectionPlan {
  const extra = Object.keys(c).filter((k) => !ALLOWED.has(k));
  if (extra.length) throw new Error("A correction only reduces the amount; the money entry, date and account stay as recorded");
  const reason = typeof c.reason === "string" ? c.reason.trim() : "";
  if (!reason || reason.length > 500) throw new Error("Give a reason for this correction");
  if (typeof c.operationId !== "string" || !c.operationId.trim()) throw new Error("Missing operation identifier");
  const after = c.newAmount;
  if (typeof after !== "number" || !Number.isFinite(after) || after < 0 || after !== roundMoney(after)) throw new Error("Enter zero or a positive amount with no more than two decimal places");
  const receipts = e.reimbursement?.receipts ?? [];
  const matches = receipts.filter((r) => r.id === c.receiptId);
  if (matches.length !== 1) throw new Error("This receipt is not on the claim");
  const receipt = matches[0]!, before = roundMoney(receipt.amount);
  if (subtractMoney(before, after) <= 0) throw new Error("A correction can only reduce what this claim cites; record more money received instead");
  const nextReceipts = after === 0 ? receipts.filter((r) => r !== receipt) : receipts.map((r) => (r === receipt ? { ...r, amount: after } : r));
  const info: ReimbursementInfo = { ...(e.reimbursement ?? {}), receipts: nextReceipts };
  // Receipt lines decide the status from here on (never the legacy "settled in one step" fallback).
  const status = statusColumn({ ...e, reimbursementStatus: "pending", reimbursement: info });
  return { receipt, before, after, reason, info, status,
    payload: { operationId: c.operationId, id: e.id, receiptId: c.receiptId, expectedAmount: receipt.amount, newAmount: after, reason } };
}

/** The store's operation: refuses offline (same check as addReimbursementReceipt's workflow), then runs the audited RPC. */
export async function submitReceiptCorrection(e: Claim, c: ReceiptCorrection, run: (action: string, payload: Record<string, unknown>) => Promise<unknown>) {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Reconnect to update this claim");
  const plan = planReceiptCorrection(e, c);
  const result = await run("correct_claim_receipt", plan.payload);
  return { plan, result };
}
