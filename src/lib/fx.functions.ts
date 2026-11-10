import { createServerFn } from "@tanstack/react-start";
import { isWithdrawn, withdrawalOfRow } from "./withdrawal";
import type { Json } from "@/integrations/supabase/types";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ReceiptDetailsSchema, receiptBreakdownError } from "./receipt-reading";
import { c11ReviewError } from "./statement-pipeline/review-gate";

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
    // C11: an automatically classified row is saved only with the person's own row approval.
    const reviewError = c11ReviewError(data.receiptDetails);
    if (reviewError) return { ok: false as const, error: reviewError };
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
    if (data.id) {
      const stored = await supabase.from("expenses").select("id,receipt_details").eq("id", data.id).eq("employee_id", userId).maybeSingle();
      if (stored.error) return { ok: false as const, error: "Couldn't save the expense" };
      const w = stored.data ? withdrawalOfRow(stored.data) : null;
      if (isWithdrawn(w)) return { ok: false as const, error: "This entry is withdrawn. Restore it before editing." };
      const rd = stored.data?.receipt_details;
      if (w && rd && typeof rd === "object" && !Array.isArray(rd)) keptWithdrawal = rd["withdrawal"];
    }
    let fx: { rate: number; date: string };
    try {
      fx = await fetchRate(data.currency, data.date);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
    const row = {
      title: data.title, merchant: data.merchant, category: data.category, scope: data.scope, member_id: data.memberId, splits: data.splits,
      currency: data.currency, original_amount: data.originalAmount, fx_rate: fx.rate, fx_date: fx.date,
      amount: Math.max(Math.round(data.originalAmount * fx.rate * 100) / 100, 0.01),
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
      ...(data.receiptDetails ? { receipt_details: keptWithdrawal === undefined ? data.receiptDetails : { ...data.receiptDetails, withdrawal: keptWithdrawal } } : {}),
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
      const existing = await supabase.from("expenses").select("id").eq("id", data.createId).eq("employee_id", userId).single();
      if (existing.error) return { ok: false as const, error: "Couldn't save the expense" };
    }
    return { ok: true as const };
  });
