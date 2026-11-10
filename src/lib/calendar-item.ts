/**
 * B04 Calendar item detail: pure rules that describe one calendar event from the records PlanCalendar already uses
 * (scheduled payments, loan EMIs, document expiry, trips). Read-only: nothing here changes a record.
 */
import { addMonths, dueStatus, FREQ_LABEL, KIND_LABEL, occurrences, type Commitment } from "./planning";
import type { Account } from "./ledger";
import type { VaultDoc } from "./documents";
import type { EntityProfile } from "./entities";
import type { NotificationSettings } from "./notification-settings";

export const CALENDAR_KINDS = ["commitment", "loan", "document", "trip"] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];
export interface CalendarItemRef { kind: CalendarKind; id: string }

export function parseCalendarItemId(v: unknown): CalendarItemRef | null {
  if (typeof v !== "string") return null;
  const at = v.indexOf(":");
  const kind = v.slice(0, at), id = v.slice(at + 1);
  return at > 0 && (CALENDAR_KINDS as readonly string[]).includes(kind) && /^[\w-]{1,64}$/.test(id) ? { kind: kind as CalendarKind, id } : null;
}

export interface CalendarLoan { id: string; name: string; emi: number; nextDue: string; status: string; accountId: string | null; provider: string }
export interface CalendarTrip { id: string; name: string; destination: string; start: string; end: string; travellers?: string[] | undefined; organisation?: string | undefined; closedAt?: string | null | undefined; cancelledAt?: string | null | undefined }
export interface CalendarData {
  commitments: Commitment[]; loans: CalendarLoan[]; documents: VaultDoc[]; accounts: Account[]; trips: CalendarTrip[];
  entities: EntityProfile[]; entityAccounts: Record<string, string[]>; reminderDays: number; notifications: NotificationSettings; today: string;
}
export interface CalendarItemDetail {
  title: string; kindLabel: string; date: string; amount: number | null; direction: "in" | "out" | null; status: string;
  owner: string; account: string | null; source: { label: string; href: string };
  recurrence: string; upcoming: string[];
  reminder: { on: boolean; text: string }; snooze: string; sync: string;
}

const ownerOfAccount = (d: CalendarData, accountId: string | null): string => {
  if (!accountId) return "You (personal)";
  const ent = Object.entries(d.entityAccounts).find(([, ids]) => ids.includes(accountId))?.[0];
  return d.entities.find((e) => e.id === ent)?.name ?? "You (personal)";
};
const accName = (d: CalendarData, id: string | null) => (id ? d.accounts.find((a) => a.id === id)?.name ?? "Account not found" : null);
const reminder = (d: CalendarData, type: keyof NotificationSettings, what: string) => d.notifications[type]
  ? { on: true, text: `Phone reminder ${d.reminderDays === 0 ? "on the day" : `${d.reminderDays} day${d.reminderDays === 1 ? "" : "s"} before`} (${what}), on devices where phone alerts are turned on.` }
  : { on: false, text: `Phone reminders for ${what} are turned off in Notification settings.` };
const SNOOZE = "Proposed — snoozing a single reminder is not available yet.";
const NO_SYNC = "Not synced to an outside calendar. External calendar sync is not available yet.";

export function calendarItemDetail(ref: CalendarItemRef, d: CalendarData, date?: string): CalendarItemDetail | null {
  const yearOn = (from: string) => { const t = new Date(Date.parse(from) + 366 * 864e5).toISOString().slice(0, 10); return t; };
  if (ref.kind === "commitment") {
    const c = d.commitments.find((x) => x.id === ref.id); if (!c) return null;
    const next = occurrences([c], d.today, yearOn(d.today)).map((o) => o.date).filter((x, i, a) => a.indexOf(x) === i).slice(0, 6);
    const st = dueStatus(c, d.today);
    return { title: c.name, kindLabel: KIND_LABEL[c.kind], date: date ?? c.nextDue, amount: c.amount, direction: c.direction, status: { overdue: "Overdue", due_soon: "Due soon", scheduled: "Scheduled", paused: "Paused", cancelled: "Cancelled", completed: "Completed" }[st],
      owner: ownerOfAccount(d, c.accountId), account: accName(d, c.accountId), source: { label: "Open in Plan", href: `/plan#commitment-${c.id}` },
      recurrence: c.frequency === "custom" ? `Every ${c.intervalDays ?? "?"} days` : FREQ_LABEL[c.frequency], upcoming: c.status === "active" ? next : [],
      reminder: reminder(d, "payments", "payments"), snooze: SNOOZE, sync: NO_SYNC };
  }
  if (ref.kind === "loan") {
    const l = d.loans.find((x) => x.id === ref.id); if (!l) return null;
    const next = l.status === "active" ? Array.from({ length: 6 }, (_, i) => addMonths(l.nextDue, i)) : [];
    return { title: `${l.name} EMI`, kindLabel: "Loan EMI", date: date ?? l.nextDue, amount: l.emi, direction: "out", status: l.status === "active" ? (l.nextDue < d.today ? "Overdue" : "Scheduled") : "Closed",
      owner: ownerOfAccount(d, l.accountId), account: accName(d, l.accountId), source: { label: "Open loan in Wealth", href: "/wealth" },
      recurrence: "Monthly", upcoming: next, reminder: reminder(d, "payments", "loan EMIs"), snooze: SNOOZE, sync: NO_SYNC };
  }
  if (ref.kind === "document") {
    const doc = d.documents.find((x) => x.id === ref.id); if (!doc || !doc.expiresOn) return null;
    return { title: `${doc.title} expires`, kindLabel: "Document renewal", date: doc.expiresOn, amount: null, direction: null, status: doc.expiresOn < d.today ? "Expired" : "Valid",
      owner: d.entities.find((e) => e.id === doc.entityId)?.name ?? "You (personal)", account: accName(d, doc.accountId), source: { label: "Open in DocuRepo", href: "/vault" },
      recurrence: "Once (expiry date)", upcoming: [doc.expiresOn], reminder: reminder(d, "documents", "document renewals"), snooze: SNOOZE, sync: NO_SYNC };
  }
  const t = d.trips.find((x) => x.id === ref.id); if (!t) return null;
  return { title: t.name, kindLabel: "Trip", date: date ?? t.start, amount: null, direction: null, status: t.cancelledAt ? "Cancelled" : t.closedAt ? "Closed" : t.end < d.today ? "Finished" : t.start <= d.today ? "Under way" : "Planned",
    owner: t.organisation ? `${t.organisation}${t.travellers?.length ? ` · ${t.travellers.join(", ")}` : ""}` : t.travellers?.length ? t.travellers.join(", ") : "You (personal)", account: null,
    source: { label: "Open trip", href: `/trips/${encodeURIComponent(t.id)}` }, recurrence: `Once · ${t.start} to ${t.end}`, upcoming: [t.start],
    reminder: reminder(d, "trips", "trip plans and bookings"), snooze: SNOOZE, sync: "Not synced automatically. The trip itinerary can be saved as a calendar (.ics) file from the trip." };
}
