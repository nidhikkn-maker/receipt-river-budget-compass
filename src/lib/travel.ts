// Travel Manager rules. Trips, travellers, bookings, itinerary and advances live in the
// owner's preferences; real money only ever moves through ledger entries tagged to the trip.
// Unpaid bookings are commitments and never change balances; advances are tracked separately from spending.
import { tripSummary, tripTag, type Trip } from "./intelligence";
import { workspaceParts } from "./workspaces";
import type { Scope } from "./expenses";

export const TRIP_TYPES = ["personal", "family", "business", "official", "mixed"] as const;
export type TripType = (typeof TRIP_TYPES)[number];
export const BOOKING_KINDS = ["flight", "hotel", "train", "bus", "car", "visa", "insurance", "activity", "other"] as const;
export type BookingKind = (typeof BOOKING_KINDS)[number];

export interface Booking { id: string; kind: BookingKind; provider: string; ref: string; date: string; amount: number; status: "unpaid" | "paid" | "cancelled"; expenseId?: string | null; note?: string }
export interface ItineraryItem { id: string; date: string; time?: string; title: string; place?: string; bookingId?: string | null }
export interface Advance { id: string; date: string; amount: number; source: string; settledAt?: string | null; settlementNote?: string }
export interface TravelTrip extends Trip { type?: TripType; travellers?: string[]; bookings?: Booking[]; itinerary?: ItineraryItem[]; advances?: Advance[]; closedAt?: string | null; purpose?: string }

const r2 = (n: number) => Math.round(n * 100) / 100;
type Row = Parameters<typeof tripSummary>[1][number] & { id: string; scope?: Scope; reimbursementStatus?: string; workspaceAllocations?: import("./workspaces").WorkspaceShare[]; originalAmount?: number | null };

export function validateBooking(b: Booking) {
  if (!b.provider.trim() && !b.ref.trim()) throw new Error("Add the provider or booking reference");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) throw new Error("Add the booking date");
  if (!Number.isFinite(b.amount) || b.amount < 0) throw new Error("Amount can't be negative");
  if (b.status === "paid" && !b.expenseId) throw new Error("A paid booking must be linked to its payment entry");
}

/** Trip money picture. Actual = ledger entries tagged to the trip. Committed = unpaid bookings (not yet spent). Nothing is counted twice. */
export function tripFinance(t: TravelTrip, txns: Row[]) {
  const s = tripSummary(t, txns);
  const ids = new Set(s.entries.map((e) => (e as Row).id));
  const bookings = t.bookings ?? [];
  const committed = r2(bookings.filter((b) => b.status === "unpaid").reduce((a, b) => a + b.amount, 0));
  const paidUnlinked = bookings.filter((b) => b.status === "paid" && b.expenseId && !ids.has(b.expenseId));
  const ws: Record<string, number> = {};
  for (const e of s.entries as Row[]) for (const p of workspaceParts({ scope: e.scope ?? "personal", amount: e.amount, originalAmount: e.originalAmount ?? null, workspaceAllocations: e.workspaceAllocations ?? [] })) ws[p.workspace] = r2((ws[p.workspace] ?? 0) + p.amount);
  const tag = tripTag(t);
  const ledgerAdv = txns.filter((x) => (x.tags ?? []).includes(tag)).reduce((a, x) => a + (x.txnType === "advance" ? x.amount : x.txnType === "advance_settlement" ? -x.amount : 0), 0);
  // Advances come from trip notes plus "Travel advance" ledger entries tagged to the trip; returns reduce them.
  const advanced = r2((t.advances ?? []).reduce((a, x) => a + x.amount, 0) + ledgerAdv);
  const reimbursablePending = r2((s.entries as Row[]).filter((e) => e.reimbursementStatus === "pending").reduce((a, e) => a + e.amount, 0));
  const reimbursed = r2((s.entries as Row[]).filter((e) => e.reimbursementStatus === "received").reduce((a, e) => a + e.amount, 0));
  const businessShare = r2((ws["business"] ?? 0) + (ws["official"] ?? 0));
  // Advance balance: money given in advance minus the business/official share spent; positive = to return, negative = still owed to you.
  const advanceBalance = advanced ? r2(advanced - businessShare) : 0;
  const projected = r2(s.total + committed);
  return { ...s, committed, projected, remainingAfterCommitted: t.budget ? r2(t.budget - projected) : 0, byWorkspace: ws, advanced, advanceBalance, reimbursablePending, reimbursed, paidUnlinked };
}

/** Entries within the trip dates that aren't on the trip yet — suggestions only, never auto-linked. */
export function tripCandidates(t: TravelTrip, txns: Row[]) {
  const tag = tripTag(t);
  return txns.filter((x) => (x.txnType ?? "expense") === "expense" && x.date >= t.start && x.date <= t.end && !(x.tags ?? []).includes(tag));
}

/** Closing needs every booking paid or cancelled and every advance settled. Closing adds no entries. */
export function closeBlockers(t: TravelTrip, txns: Row[]): string[] {
  const out: string[] = [];
  const unpaid = (t.bookings ?? []).filter((b) => b.status === "unpaid").length;
  if (unpaid) out.push(`${unpaid} booking${unpaid > 1 ? "s are" : " is"} still unpaid — mark paid or cancelled`);
  const open = (t.advances ?? []).filter((a) => !a.settledAt).length;
  if (open) out.push(`${open} advance${open > 1 ? "s aren't" : " isn't"} settled yet`);
  const pend = tripFinance(t, txns).reimbursablePending;
  if (pend > 0) out.push(`₹${pend.toLocaleString("en-IN")} of reimbursements are still pending`);
  return out;
}

/** Travel categories offered for one-tap adding to the catalog; booking kinds map onto them. */
export const TRAVEL_CATEGORIES = ["Flights", "Hotels", "Local transport", "Travel meals", "Visa & insurance", "Activities"] as const;
export const BOOKING_CATEGORY: Record<BookingKind, (typeof TRAVEL_CATEGORIES)[number]> = { flight: "Flights", hotel: "Hotels", train: "Local transport", bus: "Local transport", car: "Local transport", visa: "Visa & insurance", insurance: "Visa & insurance", activity: "Activities", other: "Activities" };

/** Suggest the travel category for a merchant/title. Returns null when nothing clearly matches. */
export function travelCategory(text: string): (typeof TRAVEL_CATEGORIES)[number] | null {
  const t = text.toLowerCase();
  if (/air|indigo|emirates|vistara|flight|airline|akasa|spicejet/.test(t)) return "Flights";
  if (/hotel|inn|resort|marriott|taj|hyatt|airbnb|oyo|stay|lodge/.test(t)) return "Hotels";
  if (/uber|ola|taxi|cab|metro|rail|irctc|bus|careem|rapido|fuel/.test(t)) return "Local transport";
  if (/visa|insurance/.test(t)) return "Visa & insurance";
  if (/restaurant|cafe|food|swiggy|zomato|dining|meal/.test(t)) return "Travel meals";
  return null;
}

/** Open trips whose dates cover the entry date — suggestions only. */
export function tripsForDate(trips: TravelTrip[], date: string) {
  return trips.filter((t) => !t.closedAt && date >= t.start && date <= t.end);
}

/** Ledger entries that look like the payment for an unpaid booking: amount within 2%, within 10 days. Only a single clear match is offered. */
export function bookingMatches(t: TravelTrip, txns: Row[]): { bookingId: string; entryId: string }[] {
  const linked = new Set((t.bookings ?? []).map((b) => b.expenseId).filter(Boolean));
  const out: { bookingId: string; entryId: string }[] = [];
  for (const b of (t.bookings ?? []).filter((x) => x.status === "unpaid" && x.amount > 0)) {
    const hits = txns.filter((x) => (x.txnType ?? "expense") === "expense" && !linked.has(x.id) && Math.abs(x.amount - b.amount) <= b.amount * 0.02 && Math.abs(Date.parse(x.date) - Date.parse(b.date)) <= 10 * 864e5);
    if (hits.length === 1) out.push({ bookingId: b.id, entryId: hits[0]!.id });
  }
  return out;
}

/** Plain-language trip observations computed from the trip's own records. */
export function tripInsights(t: TravelTrip, txns: Row[], today: string): string[] {
  const f = tripFinance(t, txns);
  const out: string[] = [];
  const days = f.days;
  if (t.budget > 0) {
    const elapsed = today < t.start ? 0 : Math.min(days, Math.round((Date.parse(today) - Date.parse(t.start)) / 864e5) + 1);
    if (f.projected > t.budget) out.push(`Spent plus booked (₹${f.projected.toLocaleString("en-IN")}) is already over the ₹${t.budget.toLocaleString("en-IN")} budget.`);
    else if (elapsed > 0 && elapsed < days) { const pace = r2(((f.total - 0) / elapsed) * days + f.committed); if (pace > t.budget) out.push(`At the current daily pace the trip would end around ₹${Math.round(pace).toLocaleString("en-IN")}, above budget.`); }
  }
  const top = f.categories[0]; if (top && f.total) out.push(`${top.category} is the biggest cost at ${Math.round((top.amount / f.total) * 100)}% of spending.`);
  if (f.currencies.length > 1) out.push(`Spending is in ${f.currencies.length} currencies; each entry keeps the rate from its bill date.`);
  if (f.reimbursablePending) out.push(`₹${f.reimbursablePending.toLocaleString("en-IN")} is waiting to be reimbursed.`);
  if (f.committed) out.push(`₹${f.committed.toLocaleString("en-IN")} of bookings are still unpaid and not yet in your balances.`);
  return out;
}

/** Trip report rows that reconcile to the ledger: entries (actual) + unpaid bookings (committed) listed separately. */
export function tripReportRows(t: TravelTrip, txns: Row[]): string[][] {
  const f = tripFinance(t, txns);
  return [
    ["Section", "Date", "Item", "Workspace", "Currency", "Original", "INR"],
    ...(f.entries as Row[]).map((e) => ["Spent", e.date, e.merchant ?? e.title ?? "", e.scope ?? "personal", e.currency ?? "INR", String(e.originalAmount ?? e.amount), String(e.amount)]),
    ...(t.bookings ?? []).filter((b) => b.status === "unpaid").map((b) => ["Booked (unpaid)", b.date, `${b.kind} ${b.provider} ${b.ref}`.trim(), "", "INR", String(b.amount), String(b.amount)]),
    ["Total spent", "", "", "", "", "", String(f.total)], ["Total booked unpaid", "", "", "", "", "", String(f.committed)],
    ...Object.entries(f.byWorkspace).map(([w, v]) => [`Workspace ${w}`, "", "", w, "", "", String(v)]),
  ];
}
