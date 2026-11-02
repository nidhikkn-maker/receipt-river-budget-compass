import { z } from "zod";
import { addDays, type Commitment } from "./planning";
import { cardCycle } from "./cards";
import { cardEmisOf, type PositionLoan } from "./position";
import type { Account, Txn } from "./ledger";

/** Restrict outbound sends even when a subscription was inserted directly through the Data API. */
export function validPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com" || url.hostname === "web.push.apple.com" || /^wns\d*\.notify\.windows\.com$/.test(url.hostname));
  } catch { return false; }
}
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(2048).refine(validPushEndpoint, "Unsupported notification service"),
  keys: z.object({
    p256dh: z.string().regex(/^B[A-Za-z0-9_-]{86}=?$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}(==)?$/),
  }),
  userAgent: z.string().max(300).default(""),
});

export interface ReminderItem { key: string; date: string; kind: "payment" | "document" | "trip" }
export function paymentReminderItems(input: {
  today: string; leadDays: number; enabled: boolean; commitments: Commitment[]; loans: PositionLoan[];
  accounts: Account[]; transactions: Txn[]; documents: { id: string; expiresOn: string | null }[];
  trips?: TripReminderSource[];
}): ReminderItem[] {
  if (!input.enabled) return [];
  const end = addDays(input.today, Math.min(30, Math.max(0, Math.round(input.leadDays))));
  const items: ReminderItem[] = [];
  for (const c of input.commitments) if (c.status === "active" && c.direction === "out" && c.amount > 0 && c.nextDue <= end) items.push({ key: `commitment:${c.id}:${c.nextDue}`, date: c.nextDue, kind: "payment" });
  for (const l of input.loans) if (l.status !== "closed" && l.loanType !== "credit_card_emi" && l.emi > 0 && l.principal > 0 && l.nextDue <= end) items.push({ key: `loan:${l.id}:${l.nextDue}`, date: l.nextDue, kind: "payment" });
  const emis = cardEmisOf(input.loans);
  for (const a of input.accounts.filter(a => !a.archived && a.kind === "credit_card")) {
    const cycle = cardCycle(a, input.transactions, emis, input.today);
    if (cycle.remainingDue > 0 && cycle.dueDate && cycle.dueDate <= end) items.push({ key: `card:${a.id}:${cycle.dueDate}`, date: cycle.dueDate, kind: "payment" });
  }
  for (const d of input.documents) if (d.expiresOn && d.expiresOn <= end) items.push({ key: `document:${d.id}:${d.expiresOn}`, date: d.expiresOn, kind: "document" });
  items.push(...tripReminderItems(input.trips ?? [], input.today));
  return items.sort((a,b) => a.date.localeCompare(b.date));
}

export interface TripReminderSource { id: string; closedAt?: string | null; cancelledAt?: string | null; itinerary?: { id: string; date: string }[]; bookings?: { id: string; date: string; status: string; kind: string; reminderOff?: boolean }[] }
/** Itinerary plans and booking check-ins today or tomorrow, for open trips only. Independent of payment reminder settings. */
export function tripReminderItems(trips: TripReminderSource[], today: string): ReminderItem[] {
  const end = addDays(today, 1); const out: ReminderItem[] = [];
  for (const t of trips) {
    if (t.closedAt || t.cancelledAt) continue;
    for (const i of t.itinerary ?? []) if (i.date >= today && i.date <= end) out.push({ key: `trip-plan:${t.id}:${i.id}:${i.date}`, date: i.date, kind: "trip" });
    for (const b of t.bookings ?? []) if (b.status !== "cancelled" && !b.reminderOff && b.date >= today && b.date <= end) out.push({ key: `trip-checkin:${t.id}:${b.id}:${b.date}`, date: b.date, kind: "trip" });
  }
  return out;
}

/** Lock-screen notifications deliberately omit names, amounts and account details. */
export function privateReminderPayload(count: number, test = false) {
  return { title: "Ledgerline", body: test ? "Notifications are working on this device." : `${count} payment, renewal or trip reminder${count === 1 ? "" : "s"} to review.`, url: "/plan", tag: test ? "ledgerline-test" : "ledgerline-reminders" };
}
export interface CheckInSource { id: string; closedAt?: string | null; cancelledAt?: string | null; bookings?: { id: string; status: string; checkInAt?: string | null; reminderOff?: boolean }[] }
/** Bookings whose saved check-in moment fell within the last `windowMin` minutes (inclusive of now). */
export function dueCheckIns(trips: CheckInSource[], nowMs: number, windowMin: number): { key: string; at: string }[] {
  const out: { key: string; at: string }[] = [];
  for (const t of trips) {
    if (t.closedAt || t.cancelledAt) continue;
    for (const b of t.bookings ?? []) {
      if (b.status === "cancelled" || b.reminderOff || !b.checkInAt) continue;
      const at = Date.parse(b.checkInAt);
      if (Number.isFinite(at) && at <= nowMs && at > nowMs - windowMin * 60_000) out.push({ key: `checkin:${b.id}:${b.checkInAt}`, at: b.checkInAt });
    }
  }
  return out;
}
export function checkInPayload(count: number) {
  return { title: "Ledgerline", body: count === 1 ? "A trip check-in is due now." : `${count} trip check-ins are due now.`, url: "/trips", tag: "ledgerline-checkin" };
}
