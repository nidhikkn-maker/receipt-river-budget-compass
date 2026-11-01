// Travel Manager rules. Trips, travellers, bookings, itinerary and advances live in the
// owner's preferences; real money only ever moves through ledger entries tagged to the trip.
// Unpaid bookings are commitments and never change balances; advances are tracked separately from spending.
import { tripSummary, tripTag, type Trip } from "./intelligence";
import { workspaceParts } from "./workspaces";
import { categoryParts, type Scope, type ReimbursementStatus } from "./expenses";
import { isTracked, outstandingOf, receivedOf, type ReimbursementInfo } from "./reimbursements";

export const TRIP_TYPES = ["personal", "family", "business", "official", "mixed"] as const;
export type TripType = (typeof TRIP_TYPES)[number];
export const BOOKING_KINDS = ["flight", "hotel", "train", "bus", "car", "visa", "insurance", "activity", "other"] as const;
export type BookingKind = (typeof BOOKING_KINDS)[number];

/** A booking is a plan, not a payment. Money reaches it through linked ledger entries; the remainder stays a commitment. */
export interface Booking { id: string; kind: BookingKind; provider: string; ref: string; date: string; amount: number; status: "unpaid" | "paid" | "cancelled"; expenseId?: string | null; expenseIds?: string[]; dueDate?: string | null; cancelTerms?: string | null; note?: string; traveller?: string; location?: string; currency?: string; originalAmount?: number; planningRate?: number; confirmation?: "pending" | "confirmed"; documentIds?: string[] }
export interface ItineraryItem { id: string; date: string; time?: string; title: string; place?: string; bookingId?: string | null; travellers?: string[]; note?: string; documentIds?: string[] }
export interface Advance { id: string; date: string; amount: number; source: string; settledAt?: string | null; settlementNote?: string }
/** One category's share of the trip plan. Category budgets plus a contingency allowance make up the plan. */
export interface BudgetLine { category: string; amount: number }
export interface TravelTrip extends Trip { type?: TripType; travellers?: string[]; bookings?: Booking[]; itinerary?: ItineraryItem[]; advances?: Advance[]; closedAt?: string | null; cancelledAt?: string | null; purpose?: string; budgetLines?: BudgetLine[]; contingency?: number; primaryWorkspace?: Scope; organisation?: string; workspaceBudgets?: { workspace: Scope; amount: number }[]; travellerBudgets?: { traveller: string; amount: number }[]; currencyBudgets?: { currency: string; amount: number; planningRate: number }[]; organisationBudgets?: { organisation: string; amount: number }[]; budgetNotes?: string; budgetUpdatedAt?: string }

/** Lifecycle for cards and filters. Cancelled and closed win over dates; otherwise dates decide. */
export type TripStatus = "upcoming" | "active" | "completed" | "cancelled" | "closed";
export const TRIP_STATUSES = ["upcoming", "active", "completed", "cancelled", "closed"] as const;
export const TRIP_STATUS_LABEL: Record<TripStatus, string> = { upcoming: "Upcoming", active: "Active", completed: "Completed", cancelled: "Cancelled", closed: "Closed" };
export function tripStatus(t: Pick<TravelTrip, "start" | "end" | "closedAt" | "cancelledAt">, today: string): TripStatus {
  if (t.cancelledAt) return "cancelled";
  if (t.closedAt) return "closed";
  if (t.start > today) return "upcoming";
  if (t.end < today) return "completed";
  return "active";
}

const r2 = (n: number) => Math.round(n * 100) / 100;
type Row = Parameters<typeof tripSummary>[1][number] & { id: string; title?: string; scope?: Scope; reimbursementStatus?: ReimbursementStatus; reimbursement?: ReimbursementInfo; workspaceAllocations?: import("./workspaces").WorkspaceShare[]; originalAmount?: number | null; tripId?: string | null };

export function validateBooking(b: Booking) {
  if (!b.provider.trim() && !b.ref.trim()) throw new Error("Add the provider or booking reference");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) throw new Error("Add the booking date");
  if (b.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(b.dueDate)) throw new Error("Payment due date is not a valid date");
  if (!Number.isFinite(b.amount) || b.amount < 0) throw new Error("Amount can't be negative");
  if (b.status === "paid" && !bookingPaymentIds(b).length) throw new Error("A paid booking must be linked to its payment entry");
}

/** Entries linked to a booking as payment — one, several partial payments, or none yet. */
export function bookingPaymentIds(b: Booking): string[] {
  return [...new Set([b.expenseId, ...(b.expenseIds ?? [])].filter((x): x is string => !!x))];
}

/** How much of a booking is already covered by linked ledger entries. */
export function bookingPaid(b: Booking, txns: Row[]) {
  const ids = new Set(bookingPaymentIds(b));
  return r2(txns.filter((x) => ids.has(x.id)).reduce((s, x) => s + (x.txnType === "refund" ? -x.amount : x.amount), 0));
}

/** Still to pay on a booking. Cancelled bookings owe nothing; a paid booking is considered settled. */
export function bookingOutstanding(b: Booking, txns: Row[]) {
  if (b.status === "cancelled" || b.status === "paid") return 0;
  return r2(Math.max(0, b.amount - bookingPaid(b, txns)));
}

/** Trip money picture. Actual = ledger entries tagged to the trip. Committed = unpaid bookings (not yet spent). Nothing is counted twice. */
export function tripFinance(t: TravelTrip, txns: Row[]) {
  const s = tripSummary(t, txns);
  const ids = new Set(s.entries.map((e) => (e as Row).id));
  const bookings = t.bookings ?? [];
  const committed = r2(bookings.reduce((a, b) => a + bookingOutstanding(b, txns), 0));
  const paidUnlinked = bookings.filter((b) => b.status === "paid" && b.expenseId && !ids.has(b.expenseId));
  const ws: Record<string, number> = {};
  for (const e of s.entries as Row[]) for (const p of workspaceParts({ scope: e.scope ?? "personal", amount: e.amount, originalAmount: e.originalAmount ?? null, workspaceAllocations: e.workspaceAllocations ?? [] })) ws[p.workspace] = r2((ws[p.workspace] ?? 0) + p.amount);
  const tag = tripTag(t);
  const ledgerAdv = txns.filter((x) => (x.tripId ? x.tripId === t.id : (x.tags ?? []).includes(tag))).reduce((a, x) => a + (x.txnType === "advance" ? x.amount : x.txnType === "advance_settlement" ? -x.amount : 0), 0);
  // Advances come from trip notes plus "Travel advance" ledger entries linked to the trip (by picker or tag); returns reduce them.
  const advanced = r2((t.advances ?? []).reduce((a, x) => a + x.amount, 0) + ledgerAdv);
  const claims = (s.entries as Row[]).map(e => ({ ...e, title: e.title ?? "Trip expense" })).filter(isTracked);
  const reimbursablePending = r2(claims.reduce((a, e) => a + outstandingOf(e), 0));
  const reimbursed = r2(claims.reduce((a, e) => a + receivedOf(e), 0));
  const businessShare = r2((ws["business"] ?? 0) + (ws["official"] ?? 0));
  // Advance balance: money given in advance minus the business/official share spent; positive = to return, negative = still owed to you.
  const advanceBalance = advanced ? r2(advanced - businessShare) : 0;
  const projected = r2(s.total + committed);
  return { ...s, committed, projected, remainingAfterCommitted: t.budget ? r2(t.budget - projected) : 0, byWorkspace: ws, advanced, advanceBalance, reimbursablePending, reimbursed, paidUnlinked };
}

/** Trip plan (§7.1): category-wise budget, contingency allowance and what the plan says against what is actually recorded. */
export function tripBudgetDetail(t: TravelTrip, txns: Row[]) {
  const s = tripSummary(t, txns);
  const spent: Record<string, number> = {};
  for (const e of s.entries as Row[]) for (const p of categoryParts(e)) spent[p.category] = r2((spent[p.category] ?? 0) + p.amount);
  const lines = (t.budgetLines ?? []).filter((l) => l.category.trim()).map((l) => {
    const actual = spent[l.category] ?? 0;
    return { category: l.category, budget: r2(l.amount), actual, left: r2(l.amount - actual), over: actual > r2(l.amount) };
  });
  const budgeted = r2(lines.reduce((a, l) => a + l.budget, 0));
  const contingency = r2(t.contingency ?? 0);
  const planned = r2((t.budget ?? 0) + contingency);
  const unbudgeted = r2(Object.entries(spent).filter(([c]) => !lines.some((l) => l.category === c)).reduce((a, [, v]) => a + v, 0));
  return { lines, budgeted, contingency, planned, spent: s.total, unbudgeted, remaining: r2(planned - s.total), hasPlan: lines.length > 0 || contingency > 0 };
}

/** Entries within the trip dates that aren't on the trip yet — suggestions only, never auto-linked. */
export function tripCandidates(t: TravelTrip, txns: Row[]) {
  const tag = tripTag(t);
  return txns.filter((x) => (x.txnType ?? "expense") === "expense" && x.date >= t.start && x.date <= t.end && !(x.tags ?? []).includes(tag));
}

/** Closing needs every booking paid or cancelled and every advance settled. Closing adds no entries. */
export function closeBlockers(t: TravelTrip, txns: Row[]): string[] {
  const out: string[] = [];
  const unpaid = (t.bookings ?? []).filter((b) => bookingOutstanding(b, txns) > 0).length;
  if (unpaid) out.push(`${unpaid} booking${unpaid > 1 ? "s are" : " is"} still unpaid — mark paid or cancelled`);
  const open = (t.advances ?? []).filter((a) => !a.settledAt).length;
  if (open) out.push(`${open} advance${open > 1 ? "s aren't" : " isn't"} settled yet`);
  const recon = advanceReconciliation(t, txns);
  if ((recon.advances > 0 || recon.returns > 0) && recon.outstanding !== 0 && open === 0) out.push(`Advance reconciliation still has ₹${Math.abs(recon.outstanding).toLocaleString("en-IN")} outstanding`);
  const pend = tripFinance(t, txns).reimbursablePending;
  if (pend > 0) out.push(`₹${pend.toLocaleString("en-IN")} of reimbursements are still pending`);
  return out;
}

/** Travel categories offered for one-tap adding to the catalog; booking kinds map onto them. */
export const TRAVEL_CATEGORIES = ["Flights", "Hotels", "Trains", "Local transport", "Airport transfers", "Car rental", "Fuel", "Visa", "Insurance", "Travel meals", "Sightseeing", "Activities", "Shopping", "Communication", "Service charges", "Miscellaneous", "Visa & insurance"] as const;
export const BOOKING_CATEGORY: Record<BookingKind, (typeof TRAVEL_CATEGORIES)[number]> = { flight: "Flights", hotel: "Hotels", train: "Local transport", bus: "Local transport", car: "Local transport", visa: "Visa & insurance", insurance: "Visa & insurance", activity: "Activities", other: "Activities" };

/** Suggest the travel category for a merchant/title. Returns null when nothing clearly matches. */
export function travelCategory(text: string): (typeof TRAVEL_CATEGORIES)[number] | null {
  const t = text.toLowerCase();
  if (/airport transfer|airport shuttle/.test(t)) return "Airport transfers";
  if (/irctc|railway|train/.test(t)) return "Trains";
  if (/car rental|rent a car|hertz|avis/.test(t)) return "Car rental";
  if (/fuel|petrol|diesel/.test(t)) return "Fuel";
  if (/sightseeing|museum|tour ticket/.test(t)) return "Sightseeing";
  if (/roaming|sim card|mobile data/.test(t)) return "Communication";
  if (/service charge|booking fee/.test(t)) return "Service charges";
  if (/air|indigo|emirates|vistara|flight|airline|akasa|spicejet/.test(t)) return "Flights";
  if (/hotel|inn|resort|marriott|taj|hyatt|airbnb|oyo|stay|lodge/.test(t)) return "Hotels";
  if (/uber|ola|taxi|cab|metro|rail|irctc|bus|careem|rapido|fuel/.test(t)) return "Local transport";
  if (/visa/.test(t)) return "Visa";
  if (/insurance/.test(t)) return "Insurance";
  if (/restaurant|cafe|food|swiggy|zomato|dining|meal/.test(t)) return "Travel meals";
  return null;
}

/** Open trips whose dates cover the entry date — suggestions only. */
export function tripsForDate(trips: TravelTrip[], date: string) {
  return trips.filter((t) => !t.closedAt && date >= t.start && date <= t.end);
}

/** Ledger entries that look like the payment for an unpaid booking: amount within 2%, within 10 days. Only a single clear match is offered. */
export function bookingMatches(t: TravelTrip, txns: Row[]): { bookingId: string; entryId: string }[] {
  const linked = new Set((t.bookings ?? []).flatMap(bookingPaymentIds));
  const out: { bookingId: string; entryId: string }[] = [];
  for (const b of (t.bookings ?? []).filter((x) => x.status === "unpaid" && x.amount > 0)) {
    const hits = txns.filter((x) => (x.txnType ?? "expense") === "expense" && !linked.has(x.id) && Math.abs(x.amount - b.amount) <= b.amount * 0.02 && Math.abs(Date.parse(x.date) - Date.parse(b.date)) <= 10 * 864e5);
    const hit = hits.length === 1 ? hits[0] : undefined;
    if (hit) out.push({ bookingId: b.id, entryId: hit.id });
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
    ...(t.bookings ?? []).filter((b) => bookingOutstanding(b, txns) > 0).map((b) => ["Booked (unpaid)", b.date, `${b.kind} ${b.provider} ${b.ref}`.trim(), "", "INR", String(bookingOutstanding(b, txns)), String(bookingOutstanding(b, txns))]),
    ["Total spent", "", "", "", "", "", String(f.total)], ["Total booked unpaid", "", "", "", "", "", String(f.committed)],
    ...Object.entries(f.byWorkspace).map(([w, v]) => [`Workspace ${w}`, "", "", w, "", "", String(v)]),
  ];
}

export interface ReconLine { date: string; label: string; kind: "advance" | "expense" | "return"; amount: number }
/** Advance reconciliation: advances received vs business/official trip spending vs money returned. Outstanding > 0 = you still hold (return it); < 0 = still owed to you. */
export function advanceReconciliation(t: TravelTrip, txns: Row[]) {
  const tag = tripTag(t);
  const linked = txns.filter((x) => (x.tripId ? x.tripId === t.id : (x.tags ?? []).includes(tag)));
  const lines: ReconLine[] = [];
  for (const a of t.advances ?? []) lines.push({ date: a.date, label: `Advance from ${a.source}`, kind: "advance", amount: r2(a.amount) });
  for (const x of linked) {
    const name = (x as Row & { title?: string; merchant?: string }).merchant || (x as Row & { title?: string }).title || "";
    if (x.txnType === "advance") lines.push({ date: x.date, label: name || "Travel advance", kind: "advance", amount: r2(x.amount) });
    if (x.txnType === "advance_settlement") lines.push({ date: x.date, label: name || "Advance returned", kind: "return", amount: r2(x.amount) });
  }
  for (const e of tripSummary(t, txns).entries as Row[]) {
    const share = workspaceParts({ scope: e.scope ?? "personal", amount: e.amount, originalAmount: e.originalAmount ?? null, workspaceAllocations: e.workspaceAllocations ?? [] }).filter((p) => p.workspace === "business" || p.workspace === "official").reduce((s, p) => s + p.amount, 0);
    if (share > 0) lines.push({ date: e.date, label: (e as Row & { merchant?: string; title?: string }).merchant || (e as Row & { title?: string }).title || "Trip expense", kind: "expense", amount: r2(share) });
  }
  lines.sort((a, b) => a.date.localeCompare(b.date));
  const sum = (k: ReconLine["kind"]) => r2(lines.filter((l) => l.kind === k).reduce((s, l) => s + l.amount, 0));
  const advances = sum("advance"), expenses = sum("expense"), returns = sum("return");
  return { lines, advances, expenses, returns, outstanding: r2(advances - expenses - returns) };
}

/** CSV rows for the reconciliation: every advance, business/official expense and return in date order, then the four totals. */
export function advanceReconRows(t: TravelTrip, txns: Row[]): string[][] {
  const r = advanceReconciliation(t, txns);
  const KIND: Record<ReconLine["kind"], string> = { advance: "Advance received", expense: "Trip expense (business/official)", return: "Returned to advance" };
  return [
    ["Date", "Type", "Item", "Amount"],
    ...r.lines.map((l) => [l.date, KIND[l.kind], l.label, String(l.amount)]),
    ["", "Total advances received", "", String(r.advances)],
    ["", "Total trip expenses", "", String(r.expenses)],
    ["", "Total returned", "", String(r.returns)],
    ["", r.outstanding > 0 ? "Outstanding — to return" : r.outstanding < 0 ? "Outstanding — owed to you" : "Outstanding — fully reconciled", "", String(r.outstanding)],
  ];
}

export interface AdvanceDashRow { tripId: string; name: string; closed: boolean; advances: number; expenses: number; returns: number; outstanding: number; end: string; ageDays: number; aging: "current" | "30+" | "60+" | "90+" | "settled"; overdue: boolean }
/** Days an unreconciled balance has been waiting, counted from the trip's end (0 while the trip is still running). Overdue = still unsettled 30+ days after the trip ended. */
export function advanceAge(end: string, outstanding: number, today: string) {
  if (outstanding === 0) return { ageDays: 0, aging: "settled" as const, overdue: false };
  const ageDays = Math.max(0, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${end}T00:00:00Z`)) / 86400000));
  const aging = ageDays >= 90 ? "90+" as const : ageDays >= 60 ? "60+" as const : ageDays >= 30 ? "30+" as const : "current" as const;
  return { ageDays, aging, overdue: ageDays >= 30 };
}
/** Advance balances across trips: only trips with any advance activity, oldest outstanding first. Totals keep the sign per trip. */
export function advanceDashboard(trips: TravelTrip[], txns: Row[], today = new Date().toISOString().slice(0, 10)) {
  const rows: AdvanceDashRow[] = [];
  for (const t of trips) {
    const r = advanceReconciliation(t, txns);
    if (r.advances === 0 && r.returns === 0) continue;
    rows.push({ tripId: t.id, name: t.name, closed: !!t.closedAt, advances: r.advances, expenses: r.expenses, returns: r.returns, outstanding: r.outstanding, end: t.end, ...advanceAge(t.end, r.outstanding, today) });
  }
  rows.sort((a, b) => Number(b.overdue) - Number(a.overdue) || Math.abs(b.outstanding) - Math.abs(a.outstanding));
  const toReturn = r2(rows.filter((r) => r.outstanding > 0).reduce((s, r) => s + r.outstanding, 0));
  const owedToYou = r2(rows.filter((r) => r.outstanding < 0).reduce((s, r) => s - r.outstanding, 0));
  return { rows, toReturn, owedToYou };
}
