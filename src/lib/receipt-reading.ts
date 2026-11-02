import { z } from "zod";

export const ReadingConfidence = z.enum(["high", "medium", "low", "unknown"]);
export type ReadingConfidence = z.infer<typeof ReadingConfidence>;
export const ReceiptConfidence = z.object({ merchant: ReadingConfidence, date: ReadingConfidence, total: ReadingConfidence });
export type ReceiptConfidence = z.infer<typeof ReceiptConfidence>;
export const ReceiptDetailsSchema = z.object({
  subtotal: z.number().nonnegative().nullable().optional(),
  tax: z.number().nonnegative().nullable().optional(),
  tip: z.number().nonnegative().nullable().optional(),
  confidence: ReceiptConfidence.optional(),
  items: z.array(z.object({ name: z.string().max(200), quantity: z.number().nonnegative(), amount: z.number().nonnegative() })).max(100).optional(),
  text: z.string().max(20000).optional(), fingerprint: z.string().max(128).optional(),
  audit: z.object({
    read: z.object({ merchant: z.string().max(200), date: z.string().max(20), amount: z.number().nonnegative(), currency: z.string().max(8) }),
    corrected: z.object({ merchant: z.string().max(200).optional(), date: z.string().max(20).optional(), amount: z.number().nonnegative().optional(), currency: z.string().max(8).optional() }),
    confirmedAt: z.string().max(40),
  }).optional(),
});

export const ExtractedReceiptSchema = z.object({
  title: z.string().nullable(), merchant: z.string().nullable(),
  date: z.string().nullable().describe("YYYY-MM-DD, null if missing or ambiguous"),
  amount: z.number().positive().nullable().describe("Final total paid, including tax and tip once"),
  subtotal: z.number().nonnegative().nullable().describe("Explicit subtotal before tax and tip, null if not shown; never calculate it from total"),
  tax: z.number().nonnegative().nullable().describe("Explicit total tax, null if not shown; sum separate tax components once"),
  tip: z.number().nonnegative().nullable().describe("Explicit gratuity/tip included in final paid total, null if unknown; do not infer from service charge"),
  confidence: ReceiptConfidence.describe("Reading certainty, not a calibrated probability: high = clearly labelled and readable; medium = some ambiguity; low = unclear; unknown = missing"),
  items: z.array(z.object({ name: z.string(), quantity: z.number().nonnegative(), amount: z.number().nonnegative() })),
  text: z.string(), currency: z.string().nullable(),
  payment_method: z.enum(["cash", "upi", "credit_card", "debit_card", "forex_card", "company_card", "bank_transfer", "other"]).nullable(),
  description: z.string().nullable(), category: z.string().max(60).nullable(),
  scope: z.enum(["personal", "business"]).nullable(),
});
export type ExtractedReceipt = z.infer<typeof ExtractedReceiptSchema>;

export function receiptConfidence(values: { merchant: string | null; date: string | null; amount: number | null; confidence?: ReceiptConfidence }): ReceiptConfidence {
  return {
    merchant: values.merchant?.trim() ? values.confidence?.merchant ?? "unknown" : "unknown",
    date: values.date && /^\d{4}-\d{2}-\d{2}$/.test(values.date) && Number.isFinite(Date.parse(values.date)) ? values.confidence?.date ?? "unknown" : "unknown",
    total: values.amount != null && Number.isFinite(values.amount) && values.amount > 0 ? values.confidence?.total ?? "unknown" : "unknown",
  };
}

export function receiptBreakdownError(total: number, details?: { subtotal?: number | null | undefined; tax?: number | null | undefined; tip?: number | null | undefined }): string | null {
  const amounts = [details?.subtotal, details?.tax, details?.tip];
  if (amounts.some(value => value != null && (!Number.isFinite(value) || value < 0))) return "Subtotal, tax and tip must be zero or more.";
  const included = (details?.tax ?? 0) + (details?.tip ?? 0);
  if (Math.round(included * 100) > Math.round(total * 100)) return "Tax and tip cannot exceed the total paid. Check the receipt amounts.";
  if (details?.subtotal != null && Number.isFinite(total) && total > 0) {
    const expected = Math.round((details.subtotal + included) * 100);
    const actual = Math.round(total * 100);
    if (expected !== actual) return `Receipt total mismatch: subtotal + tax + tip = ${(expected / 100).toFixed(2)}, but total is ${(actual / 100).toFixed(2)}. Check discounts, other charges or reading errors before saving.`;
  }
  return null;
}