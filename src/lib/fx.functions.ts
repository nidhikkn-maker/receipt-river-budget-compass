import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BASE = "USD";

async function fetchRate(currency: string, date: string): Promise<{ rate: number; date: string }> {
  if (currency === BASE) return { rate: 1, date };
  // ECB reference rates (via Frankfurter). Returns the latest published rate on or before `date`.
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

const SubmitInput = z.object({
  title: z.string().trim().min(1).max(200),
  merchant: z.string().max(200).nullable(),
  category: z.enum(["Travel", "Meals", "Software", "Equipment", "Training", "Office", "Other"]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  originalAmount: z.number().positive().max(10_000_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(2000),
  paymentMethod: z.enum(["cash", "upi", "credit_card", "debit_card", "forex_card", "company_card", "bank_transfer", "other"]),
  receipts: z.array(z.object({ name: z.string(), type: z.string(), path: z.string() })).min(1).max(10),
});

/** Submits an expense, converting to USD server-side with the rate for the bill date. */
export const submitExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SubmitInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.receipts.some((r) => !r.path.startsWith(`${userId}/`))) return { ok: false as const, error: "Invalid receipt" };
    let fx: { rate: number; date: string };
    try {
      fx = await fetchRate(data.currency, data.date);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
    const { data: prof } = await supabase.from("profiles").select("department").eq("id", userId).single();
    if (!prof) return { ok: false as const, error: "Profile not found" };
    const amount = Math.round(data.originalAmount * fx.rate * 100) / 100;
    const { error } = await supabase.from("expenses").insert({
      employee_id: userId, department: prof.department, title: data.title, merchant: data.merchant, category: data.category,
      currency: data.currency, original_amount: data.originalAmount, fx_rate: fx.rate, fx_date: fx.date, amount: Math.max(amount, 0.01),
      payment_method: data.paymentMethod, expense_date: data.date, description: data.description,
      receipts: data.receipts, status: "pending_manager",
    });
    if (error) {
      console.error(error);
      return { ok: false as const, error: "Couldn't save the expense" };
    }
    return { ok: true as const };
  });
