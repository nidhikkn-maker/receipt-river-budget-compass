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
  const advanced = r2((t.advances ?? []).reduce((a, x) => a + x.amount, 0));
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
