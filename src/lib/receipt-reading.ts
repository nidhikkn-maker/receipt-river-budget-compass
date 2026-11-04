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
  roundOff: z.number().min(-1).max(1).nullable().optional(),
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
  round_off: z.number().nullable().optional().describe("Explicit printed round-off/rounding/R/O adjustment, signed (negative when the bill rounds down), null if not printed; never calculate it"),
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

/** Currencies whose bills round the final total to a whole unit, often without printing a round-off line. */
const WHOLE_UNIT_ROUNDING = new Set(["INR", "JPY", "KRW", "IDR"]);

type Breakdown = { subtotal?: number | null | undefined; tax?: number | null | undefined; tip?: number | null | undefined; roundOff?: number | null | undefined };

/**
 * Round-off between the parts and the bill total, in currency units. `printed` comes from the bill; `implied`
 * is accepted only for whole-unit-rounding currencies when the total is a whole amount and the gap is under one unit.
 */
export function receiptRoundOff(total: number, details?: Breakdown, currency?: string): { printed: number; implied: number } {
  const printed = details?.roundOff != null && Number.isFinite(details.roundOff) ? Math.round(details.roundOff * 100) : 0;
  if (details?.subtotal == null || !Number.isFinite(total) || total <= 0) return { printed: printed / 100, implied: 0 };
  const gap = Math.round(total * 100) - Math.round((details.subtotal + (details.tax ?? 0) + (details.tip ?? 0)) * 100) - printed;
  const eligible = !printed && WHOLE_UNIT_ROUNDING.has((currency ?? "INR").toUpperCase()) && Math.round(total * 100) % 100 === 0 && Math.abs(gap) < 100;
  return { printed: printed / 100, implied: eligible ? gap / 100 : 0 };
}

export function receiptBreakdownError(total: number, details?: Breakdown, currency?: string): string | null {
  const amounts = [details?.subtotal, details?.tax, details?.tip];
  if (amounts.some(value => value != null && (!Number.isFinite(value) || value < 0))) return "Subtotal, tax and tip must be zero or more.";
  if (details?.roundOff != null && (!Number.isFinite(details.roundOff) || Math.abs(details.roundOff) > 1)) return "Round-off must be between -1 and 1.";
  const included = (details?.tax ?? 0) + (details?.tip ?? 0);
  if (Math.round(included * 100) > Math.round(total * 100)) return "Tax and tip cannot exceed the total paid. Check the receipt amounts.";
  if (details?.subtotal != null && Number.isFinite(total) && total > 0) {
    const round = receiptRoundOff(total, details, currency);
    const expected = Math.round((details.subtotal + included + round.printed + round.implied) * 100);
    const actual = Math.round(total * 100);
    if (expected !== actual) return `Receipt total mismatch: subtotal + tax + tip${round.printed ? " + round-off" : ""} = ${(expected / 100).toFixed(2)}, but total is ${(actual / 100).toFixed(2)}. Check discounts, other charges or reading errors before saving.`;
  }
  return null;
}

/** Money in whole cents, so every receipt comparison happens at currency precision. */
const cents = (value: number) => Math.round(value * 100);

export interface ReceiptAmounts {
  subtotal?: number | null | undefined;
  tax?: number | null | undefined;
  tip?: number | null | undefined;
  roundOff?: number | null | undefined;
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
export function receiptItemTotalError(total: number, details?: ReceiptAmounts, currency?: string): string | null {
  const items = details?.items ?? [];
  if (!items.length || !Number.isFinite(total) || total <= 0) return null;
  if (items.some((item) => !Number.isFinite(item.amount) || item.amount < 0)) return "Receipt item amounts must be zero or more.";
  const itemSum = cents(items.reduce((sum, item) => sum + item.amount, 0));
  const subtotal = details?.subtotal;
  const hasSubtotal = subtotal != null && Number.isFinite(subtotal);
  const base = hasSubtotal ? cents(subtotal as number) : cents(total - (details?.tax ?? 0) - (details?.tip ?? 0));
  if (!Number.isFinite(base) || base < 0 || itemSum === base) return null;
  // On whole-unit-rounded bills, paise-level differences are rounding, not a missing line.
  if (WHOLE_UNIT_ROUNDING.has((currency ?? "INR").toUpperCase()) && cents(total) % 100 === 0 && Math.abs(itemSum - base) < 100) return null;
  const against = hasSubtotal ? "the subtotal" : "the bill's subtotal (total minus tax and tip)";
  return `Receipt items add up to ${(itemSum / 100).toFixed(2)}, but ${against} is ${(base / 100).toFixed(2)}. Check for a missing or misread line before saving.`;
}

export interface ReceiptReviewCheck { items: number[]; itemTotalError: string | null; needed: boolean }

/** Everything that must be reviewed before this receipt can be saved: unclear items and item totals. */
export function receiptReviewCheck(total: number, details?: ReceiptAmounts, currency?: string): ReceiptReviewCheck {
  const items = receiptItemsToReview(details?.items);
  const itemTotalError = receiptItemTotalError(total, details, currency);
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
    roundOff: details?.roundOff ?? null,
    items: (details?.items ?? []).map((item) => [item.name, item.quantity, item.amount, receiptItemConfidence(item).name, receiptItemConfidence(item).amount]),
  });
}
export type ReceiptField = "merchant" | "date" | "total";
/** Main fields read with low confidence; each must be confirmed by the user at its current value. */
export function lowConfidenceFields(confidence?: Partial<ReceiptConfidence>): ReceiptField[] {
  return (["merchant", "date", "total"] as const).filter((f) => confidence?.[f] === "low");
}
/** Low-confidence fields not yet confirmed at the value now shown (editing a value needs a fresh confirmation). */
export function unconfirmedFields(confidence: Partial<ReceiptConfidence> | undefined, values: Record<ReceiptField, string>, checked: Partial<Record<ReceiptField, string>>): ReceiptField[] {
  return lowConfidenceFields(confidence).filter((f) => checked[f] !== values[f]);
}

/** Round-off for a saved expense: the saved value wins, otherwise worked out (display only) for older records. */
export function receiptRoundOffFor(e: { originalAmount: number; currency: string; receiptDetails?: Breakdown | null | undefined }): { amount: number; source: "saved" | "printed" | "implied" | null } {
  const d = e.receiptDetails ?? undefined;
  if (d?.roundOff != null && Number.isFinite(d.roundOff) && d.roundOff !== 0) return { amount: Math.round(d.roundOff * 100) / 100, source: "saved" };
  const r = receiptRoundOff(e.originalAmount, d, e.currency);
  return r.implied ? { amount: r.implied, source: "implied" } : { amount: 0, source: null };
}
