import type { Expense } from "./expenses";
import { tripTag } from "./intelligence";
import { travelCategory, type TravelTrip } from "./travel";
type Details = Pick<Expense, "date" | "title" | "merchant" | "description" | "currency" | "originalAmount" | "scope" | "category"> & { tags?: string[]; tripId?: string | null; txnType?: string };
export function smartTripSuggestions(e: Details, trips: TravelTrip[]) {
  if ((e.txnType ?? "expense") !== "expense" || e.tripId || (e.tags ?? []).some((t) => t.startsWith("Trip: "))) return [];
  const text = `${e.title} ${e.merchant ?? ""} ${e.description} ${(e.tags ?? []).join(" ")}`.toLowerCase();
  const contains = (value: string | undefined) => !!value && value.trim().length >= 4 && text.includes(value.trim().toLowerCase());
  const results = trips.filter((t) => !t.closedAt && !t.cancelledAt).flatMap((trip) => {
    let score = 0; const reasons: string[] = [];
    const during = e.date >= trip.start && e.date <= trip.end;
    if (during) { score += 20; reasons.push("Expense date is within trip dates"); }
    if (contains(trip.destination)) { score += 35; reasons.push(`Destination matches ${trip.destination}`); }
    if (contains(trip.name)) { score += 35; reasons.push("Trip name appears in expense details"); }
    const reference = (trip.bookings ?? []).find((b) => b.status !== "cancelled" && contains(b.ref));
    if (reference) { score += 70; reasons.push(`Booking reference ${reference.ref} matches`); }
    const booking = (trip.bookings ?? []).find((b) => b.status !== "cancelled" && contains(b.provider) && b.currency === e.currency && b.originalAmount != null && Math.abs(b.originalAmount - e.originalAmount) <= 0.01);
    if (booking) { score += 40; reasons.push("Booking provider and original-currency amount match"); }
    if (during && (travelCategory(text) || /flight|hotel|train|travel|transport/i.test(e.category))) { score += 10; reasons.push("Travel-related expense"); }
    if (during && trip.type === e.scope) { score += 5; reasons.push("Workspace matches"); }
    if (score < 20 || (!during && !reference && !booking && score < 70)) return [];
    return [{ trip, score, reasons, confidence: score >= 70 ? "Strong match" : score >= 40 ? "Possible match" : "Date match only", ambiguous: false }];
  }).sort((a, b) => b.score - a.score || a.trip.id.localeCompare(b.trip.id));
  return results.map((r) => ({ ...r, ambiguous: results.filter((x) => Math.abs(x.score - r.score) < 10).length > 1 }));
}