import { createServerFn } from "@tanstack/react-start";
import { isWithdrawn, withdrawalOfRow } from "./withdrawal";
import type { Json } from "@/integrations/supabase/types";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ReceiptDetailsSchema, postingPrecisionError, receiptBreakdownError } from "./receipt-reading";
import { c11ReviewError } from "./statement-pipeline/review-gate";
import { receiptReuseError, stampDuplicateReview } from "./duplicate-decision";
import { decimal, multiplyMoney } from "./money";

const BASE = "INR";

async function fetchRate(currency: string, date: string): Promise<{ rate: number; date: string }> {
  if (currency === BASE) return { rate: 1, date };
  // ECB reference rates via Frankfurter: the latest published rate on or before `date`.
  const res = await fetch(`https://api.frankfurter.dev/v1/${date}?from=${currency}&to=${BASE}`);
  if (!res.ok) throw new Error(`No exchange rate available for ${currency}`);
  const j = (await res.json()) as { date: string; rates: Record<string, number> };
  const rate = j.rates[BASE];
  if (!rate) throw new Error(`No exchange rate available for ${currency}`);
  return { rate, date: j.date };
}

/**
 * KK ruling (11 Nov 2026), lead decision: the posted INR amount is the source amount times the recorded rate in
 * decimal arithmetic, rounded once half-up to paise (money.ts). USD 1.15 at 83.3 = 95.795 posts as 95.80.
 */
export function postedInrAmount(originalAmount: number, rate: number): number {
  return Math.max(multiplyMoney(originalAmount, rate), 0.01);
}
const sameDecimal = (a: unknown, b: unknown) => {
  if (a == null || b == null || !Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) return false;
  return decimal(Number(a)).toDecimalPlaces(8).eq(decimal(Number(b)).toDecimalPlaces(8));
};
export interface StoredPosting { original_amount: number | string | null; currency: string | null; expense_date: string | null; fx_rate: number | string | null; fx_date: string | null; amount: number | string | null }
/**
 * Posted records are never retroactively changed (lead review of 50fe4c56): an edit that keeps the source amount,
 * currency and entry date keeps the stored rate, rate date and INR amount exactly, and no rate is fetched — so a
 * provider revising a historical rate can never move an old entry. Returns null when the posting must be recomputed.
 */
export function unchangedPosting(stored: StoredPosting | null | undefined, next: { originalAmount: number; currency: string; date: string }): { rate: number; date: string; amount: number } | null {
  if (!stored || stored.currency !== next.currency || stored.expense_date !== next.date || !sameDecimal(stored.original_amount, next.originalAmount)) return null;
  const rate = Number(stored.fx_rate), amount = Number(stored.amount);
  if (stored.fx_rate == null || stored.amount == null || !Number.isFinite(rate) || !Number.isFinite(amount)) return null;
  return { rate, date: stored.fx_date ?? next.date, amount };
}

const RateInput = z.object({ currency: z.string().regex(/^[A-Z]{3}$/), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export const getFxRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RateInput.parse(d))
  .handler(async ({ data }) => {
    try {
      return { ok: true as const, ...(await fetchRate(data.currency, data.date)) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

const SaveInput = z.object({
  id: z.string().uuid().nullable(),
  createId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  merchant: z.string().max(200).nullable(),
  category: z.string().min(1).max(60),
  scope: z.enum(["personal", "family", "business", "official"]),
  workspaceAllocations: z.array(z.object({ workspace: z.enum(["personal", "family", "business", "official"]), amount: z.number().positive() })).max(4).default([]),
  memberId: z.string().uuid().nullable(),
  splits: z.array(z.object({ memberId: z.string().uuid().nullable(), amount: z.number().positive() })).max(20).default([]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  originalAmount: z.number().positive().max(100_000_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(2000),
  paymentMethod: z.enum(["cash", "upi", "credit_card", "debit_card", "forex_card", "company_card", "bank_transfer", "other"]),
  receipts: z.array(z.object({ name: z.string(), type: z.string(), path: z.string() })).max(10).optional(),
  txnType: z.enum(["expense", "income", "transfer", "refund", "reimbursement", "adjustment", "card_payment", "loan_repayment", "investment", "advance", "advance_settlement"]).default("expense"),
  reimbursementStatus: z.enum(["none", "pending", "received"]).default("none"),
  adjustmentSign: z.union([z.literal(1), z.literal(-1)]).default(1),
  accountId: z.string().uuid().nullable().default(null),
  toAccountId: z.string().uuid().nullable().default(null),
  paymentInstrumentId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/).nullable().default(null),
  payeeId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/).nullable().default(null),
  entityId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/).nullable().optional(),
  entitySource: z.enum(["account", "manual"]).optional(),
  tripId: z.string().uuid().nullable().default(null),
  principal: z.number().nonnegative().max(100_000_000).nullable().default(null),
  interest: z.number().nonnegative().max(100_000_000).nullable().default(null),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  receiptDetails: ReceiptDetailsSchema.optional(),
});

/** Adds or updates an expense, converting to INR server-side with the rate for the bill date. */
export const saveExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const receiptError = receiptBreakdownError(data.originalAmount, data.receiptDetails, data.currency);
    if (receiptError) return { ok: false as const, error: receiptError };
    // KK decision 11 Nov 2026: an amount finer than the stored precision (₹1234.567, ₹0.005) is refused for review
    // instead of being rounded silently by the numeric(14,2) column; the read evidence keeps the source digits.
    const precisionError = postingPrecisionError(data.originalAmount, data.currency);
    if (precisionError) return { ok: false as const, error: precisionError };
    // C11: an automatically classified row is saved only with the person's own row approval.
    const reviewError = c11ReviewError(data.receiptDetails);
    if (reviewError) return { ok: false as const, error: reviewError };
    // A confirmed duplicate stays protected: a new entry can't reuse a receipt file already attached to another entry.
    const fingerprint = data.receiptDetails?.fingerprint;
    if (!data.id && fingerprint) {
      const used = await supabase.from("expenses").select("id").eq("employee_id", userId).eq("receipt_details->>fingerprint", fingerprint).limit(20);
      if (used.error) return { ok: false as const, error: "Couldn't check whether this receipt is already saved. Try again." };
      const reuse = receiptReuseError(fingerprint, (used.data ?? []).map((r: { id: string }) => r.id), [data.createId]);
      if (reuse) return { ok: false as const, error: reuse };
    }
    // Who resolved a possible duplicate comes from the signed-in account, never from the browser.
    const stampedDetails = data.receiptDetails ? stampDuplicateReview(data.receiptDetails, userId) : undefined;
    if (data.receipts?.some((r) => !r.path.startsWith(`${userId}/`))) return { ok: false as const, error: "Invalid receipt" };
    if (data.splits.length) {
      const sum = Math.round(data.splits.reduce((a, x) => a + x.amount, 0) * 100) / 100;
      if (data.splits.length < 2 || Math.abs(sum - data.originalAmount) > 0.009) return { ok: false as const, error: "Shares must add up to the bill total" };
    }
    if (["transfer", "card_payment", "loan_repayment", "investment"].includes(data.txnType) && (!data.accountId || !data.toAccountId || data.accountId === data.toAccountId)) {
      return { ok: false as const, error: "Pick two different accounts for a transfer" };
    }
    if (data.principal != null || data.interest != null) {
      if (data.txnType !== "loan_repayment") return { ok: false as const, error: "Only loan repayments have a principal/interest split" };
      if (data.principal == null || data.interest == null) return { ok: false as const, error: "Fill in both principal and interest, or neither" };
      if (Math.abs(Math.round((data.principal + data.interest) * 100) - Math.round(data.originalAmount * 100)) > 1) {
        return { ok: false as const, error: "Principal and interest must add up to the payment" };
      }
    }
    // RB-LED-01: a withdrawn entry is read-only until restored, and an edit never drops its withdrawal history.
    let keptWithdrawal: Json | undefined = undefined;
    let storedPosting: StoredPosting | null = null;
    if (data.id) {
      const stored = await supabase.from("expenses").select("id,receipt_details,original_amount,currency,expense_date,fx_rate,fx_date,amount").eq("id", data.id).eq("employee_id", userId).maybeSingle();
      if (stored.error) return { ok: false as const, error: "Couldn't save the expense" };
      const w = stored.data ? withdrawalOfRow(stored.data) : null;
      if (isWithdrawn(w)) return { ok: false as const, error: "This entry is withdrawn. Restore it before editing." };
      storedPosting = stored.data ?? null;
      const rd = stored.data?.receipt_details;
      if (w && rd && typeof rd === "object" && !Array.isArray(rd)) keptWithdrawal = rd["withdrawal"];
    }
    // The stored details are the server-stamped review plus any withdrawal history kept from the saved row.
    const receiptDetails = stampedDetails && keptWithdrawal !== undefined ? { ...stampedDetails, withdrawal: keptWithdrawal } : stampedDetails;
    // Unchanged amount, currency and date: keep the stored posting exactly, without fetching a rate.
    const kept = unchangedPosting(storedPosting, { originalAmount: data.originalAmount, currency: data.currency, date: data.date });
    let fx: { rate: number; date: string };
    if (kept) fx = { rate: kept.rate, date: kept.date };
    else try {
      fx = await fetchRate(data.currency, data.date);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
    const row = {
      title: data.title, merchant: data.merchant, category: data.category, scope: data.scope, member_id: data.memberId, splits: data.splits,
      currency: data.currency, original_amount: data.originalAmount, fx_rate: fx.rate, fx_date: fx.date,
      amount: kept ? kept.amount : postedInrAmount(data.originalAmount, fx.rate),
      payment_method: data.paymentMethod, expense_date: data.date, description: data.description,
      reimbursement_status: data.txnType === "expense" ? data.reimbursementStatus : "none", adjustment_sign: data.txnType === "adjustment" ? data.adjustmentSign : 1,
      txn_type: data.txnType, account_id: data.accountId, to_account_id: ["transfer", "card_payment", "loan_repayment", "investment"].includes(data.txnType) ? data.toAccountId : null, tags: data.tags,
      payment_instrument_id: data.paymentInstrumentId,
      payee_id: data.payeeId,
      ...(data.entitySource ? { entity_id: data.entitySource === "manual" ? data.entityId ?? null : null, entity_source: data.entitySource } : {}),
      trip_id: ["advance", "advance_settlement"].includes(data.txnType) ? data.tripId : null,
      principal: data.txnType === "loan_repayment" ? data.principal : null,
      interest: data.txnType === "loan_repayment" ? data.interest : null,
      workspace_allocations: data.workspaceAllocations,
      updated_at: new Date().toISOString(),
      ...(data.receipts ? { receipts: data.receipts } : {}),
      ...(receiptDetails ? { receipt_details: receiptDetails } : {}),
    };
    const result = data.id
      ? await supabase.from("expenses").update(row).eq("id", data.id).eq("employee_id", userId).select("id").single()
      : data.createId
        ? await supabase.from("expenses").upsert({ ...row, id: data.createId, employee_id: userId }, { onConflict: "id", ignoreDuplicates: true }).select("id")
        : await supabase.from("expenses").insert({ ...row, employee_id: userId }).select("id").single();
    const { error } = result;
    if (error) {
      console.error(error);
      return { ok: false as const, error: "Couldn't save the expense" };
    }
    if (!data.id && data.createId && Array.isArray(result.data) && !result.data.length) {
      const existing = await supabase.from("expenses").select("id,receipt_details").eq("id", data.createId).eq("employee_id", userId).single();
      if (existing.error) return { ok: false as const, error: "Couldn't save the expense" };
      // P0-034: the same line again after its entry was withdrawn (e.g. Statement Desk Undo): never a second entry and
      // never a silent reactivation. Restore entry (reason recorded) is the only way back.
      if (isWithdrawn(withdrawalOfRow(existing.data))) return { ok: false as const, error: "This entry was withdrawn (kept in history). Restore it from Withdrawn entries instead of saving it again." };
    }
    return { ok: true as const };
  });
