import { z } from "zod";
import { BOOKING_KINDS, validateBooking, type Booking } from "./travel";
export const BookingExtraction = z.object({
  kind: z.enum(BOOKING_KINDS).nullable(), provider: z.string().nullable(), reference: z.string().nullable(),
  date: z.string().nullable(), endDate: z.string().nullable(), time: z.string().nullable(),
  amount: z.number().nullable(), currency: z.string().nullable(), traveller: z.string().nullable(),
  location: z.string().nullable(), dueDate: z.string().nullable(), cancellationTerms: z.string().nullable(),
  confirmed: z.boolean().nullable(), notes: z.string().nullable(), text: z.string(),
});
export type ExtractedBooking = z.infer<typeof BookingExtraction>;
export function bookingDraft(x: ExtractedBooking, documentId: string) {
  const date = (v: string | null) => v && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v ? v : "";
  return { kind: x.kind ?? "other", provider: x.provider ?? "", ref: x.reference ?? "", date: date(x.date),
    amount: x.amount != null && Number.isFinite(x.amount) && x.amount >= 0 ? String(x.amount) : "",
    currency: x.currency && /^[A-Z]{3}$/.test(x.currency) ? x.currency : "INR", rate: x.currency === "INR" ? "1" : "",
    due: date(x.dueDate), cancel: x.cancellationTerms ?? "", traveller: x.traveller ?? "", location: x.location ?? "",
    confirmation: x.confirmed === true ? "confirmed" as const : "pending" as const, document: documentId,
    note: [x.time, x.endDate ? `Until ${x.endDate}` : "", x.notes].filter(Boolean).join(" · "),
  };
}
/** Source claims of payment never create ledger movements or mark a booking paid. */
export function reviewedBooking(id: string, draft: ReturnType<typeof bookingDraft>): Booking {
  const rate = Number(draft.rate), amount = Number(draft.amount);
  if (!draft.amount.trim() || !draft.rate.trim() || !Number.isFinite(rate) || rate <= 0) throw Error("Enter the amount and a positive planning exchange rate");
  const booking: Booking = { id, kind: draft.kind, provider: draft.provider.trim(), ref: draft.ref.trim(), date: draft.date,
    amount: Math.round(amount * rate * 100) / 100, status: "unpaid", originalAmount: amount, currency: draft.currency,
    planningRate: rate, dueDate: draft.due || null, cancelTerms: draft.cancel || null, traveller: draft.traveller,
    location: draft.location, confirmation: draft.confirmation, documentIds: draft.document ? [draft.document] : [], note: draft.note };
  validateBooking(booking); return booking;
}