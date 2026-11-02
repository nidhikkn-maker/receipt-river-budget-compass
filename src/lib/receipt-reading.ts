import { z } from "zod";

export const ReadingConfidence = z.enum(["high", "medium", "low", "unknown"]);
export type ReadingConfidence = z.infer<typeof ReadingConfidence>;
export const ReceiptConfidence = z.object({ merchant: ReadingConfidence, date: ReadingConfidence, total: ReadingConfidence });
export type ReceiptConfidence = z.infer<typeof ReceiptConfidence>;
export const ReceiptItemConfidence = z.object({ name: ReadingConfidence, amount: ReadingConfidence });
export type ReceiptItemConfidence = z.infer<typeof ReceiptItemConfidence>;
export const ReceiptDetailsSchema = z.object({
  subtotal: z.number().nonnegative().nullable().optional(),
  tax: z.number().nonnegative().nullable().optional(),
  tip: z.number().nonnegative().nullable().optional(),
  confidence: ReceiptConfidence.optional(),
  items: z.array(z.object({ name: z.string().max(200), quantity: z.number().nonnegative(), amount: z.number().nonnegative(), confidence: ReceiptItemConfidence.optional() })).max(100).optional(),
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
  items: z.array(z.object({ name: z.string(), quantity: z.number().nonnegative(), amount: z.number().nonnegative(), confidence: ReceiptItemConfidence.describe("Separate reading certainty for this item's name and extended line amount; never a probability") })),
  text: z.string(), currency: z.string().nullable(),
  payment_method: z.enum(["cash", "upi", "credit_card", "debit_card", "forex_card", "company_card", "bank_transfer", "other"]).nullable(),
  description: z.string().nullable(), category: z.string().max(60).nullable(),
  scope: z.enum(["personal", "business"]).nullable(),
});
export type ExtractedReceipt = z.infer<typeof ExtractedReceiptSchema>;

export function receiptItemConfidence(item: { name: string; amount: number; confidence?: ReceiptItemConfidence | undefined }): ReceiptItemConfidence {
  return {
    name: item.name.trim() ? item.confidence?.name ?? "unknown" : "unknown",
    amount: Number.isFinite(item.amount) && item.amount >= 0 ? item.confidence?.amount ?? "unknown" : "unknown",
  };
}

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

/** Money in whole cents, so every receipt comparison happens at currency precision. */
const cents = (value: number) => Math.round(value * 100);

export interface ReceiptAmounts {
  subtotal?: number | null | undefined;
  tax?: number | null | undefined;
  tip?: number | null | undefined;
  items?: readonly { name: string; quantity: number; amount: number; confidence?: ReceiptItemConfidence | undefined }[] | undefined;
}

/** Which fields of one extracted item were read with low confidence ("name", "amount", or both). */
export function receiptItemReviewReasons(item: { name: string; amount: number; confidence?: ReceiptItemConfidence | undefined }): string[] {
  const confidence = receiptItemConfidence(item);
  return [confidence.name === "low" ? "name" : "", confidence.amount === "low" ? "amount" : ""].filter(Boolean);
}

/** Positions of items the reader was unsure about — these must be looked at before saving. */
export function receiptItemsToReview(items?: ReceiptAmounts["items"]): number[] {
  return (items ?? []).flatMap((item, index) => (receiptItemReviewReasons(item).length ? [index] : []));
}

/**
 * Does the extracted item list add up to the rest of the bill? Compared with the subtotal when one was
 * read, otherwise with total minus tax and tip. A human check, never a hard save block: a partially
 * read item list must not make a correct expense unsavable.
 */
export function receiptItemTotalError(total: number, details?: ReceiptAmounts): string | null {
  const items = details?.items ?? [];
  if (!items.length || !Number.isFinite(total) || total <= 0) return null;
  if (items.some((item) => !Number.isFinite(item.amount) || item.amount < 0)) return "Receipt item amounts must be zero or more.";
  const itemSum = cents(items.reduce((sum, item) => sum + item.amount, 0));
  const subtotal = details?.subtotal;
  const hasSubtotal = subtotal != null && Number.isFinite(subtotal);
  const base = hasSubtotal ? cents(subtotal as number) : cents(total - (details?.tax ?? 0) - (details?.tip ?? 0));
  if (!Number.isFinite(base) || base < 0 || itemSum === base) return null;
  const against = hasSubtotal ? "the subtotal" : "the bill's subtotal (total minus tax and tip)";
  return `Receipt items add up to ${(itemSum / 100).toFixed(2)}, but ${against} is ${(base / 100).toFixed(2)}. Check for a missing or misread line before saving.`;
}

export interface ReceiptReviewCheck { items: number[]; itemTotalError: string | null; needed: boolean }

/** Everything that must be reviewed before this receipt can be saved: unclear items and item totals. */
export function receiptReviewCheck(total: number, details?: ReceiptAmounts): ReceiptReviewCheck {
  const items = receiptItemsToReview(details?.items);
  const itemTotalError = receiptItemTotalError(total, details);
  return { items, itemTotalError, needed: items.length > 0 || itemTotalError != null };
}

/**
 * Binds a "I've checked these" acknowledgement to the exact amounts and reading confidences it covered,
 * so editing an item, subtotal, tax or tip asks for the check again instead of inheriting the old one.
 */
export function receiptReviewSignature(total: number, details?: ReceiptAmounts): string {
  return JSON.stringify({
    total: Number.isFinite(total) ? cents(total) : null,
    subtotal: details?.subtotal ?? null,
    tax: details?.tax ?? null,
    tip: details?.tip ?? null,
    items: (details?.items ?? []).map((item) => [item.name, item.quantity, item.amount, receiptItemConfidence(item).name, receiptItemConfidence(item).amount]),
  });
}