import type { ItineraryItem, TravelTrip } from "./travel";

const key = (i: ItineraryItem) => `${i.date}${i.time ?? ""}`;

/** Items grouped by day in time order; untimed items sort first within a day. */
export function itineraryDays(items: ItineraryItem[]): { date: string; items: ItineraryItem[] }[] {
  const sorted = [...items].sort((a, b) => key(a).localeCompare(key(b)));
  const out: { date: string; items: ItineraryItem[] }[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && last.date === i.date) last.items.push(i); else out.push({ date: i.date, items: [i] });
  }
  return out;
}

/** Ids of timed items that share the same date and time with a shared (or unspecified) traveller. */
export function itineraryConflicts(items: ItineraryItem[]): Set<string> {
  const ids = new Set<string>();
  for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
    const x = items[a]!, y = items[b]!;
    if (!x.time || x.date !== y.date || x.time !== y.time) continue;
    const tx = x.travellers ?? [], ty = y.travellers ?? [];
    if (!tx.length || !ty.length || tx.some((t) => ty.includes(t))) { ids.add(x.id); ids.add(y.id); }
  }
  return ids;
}

/** Items outside the trip's dates. */
export function outsideTrip(trip: Pick<TravelTrip, "start" | "end">, items: ItineraryItem[]): Set<string> {
  return new Set(items.filter((i) => i.date < trip.start || i.date > trip.end).map((i) => i.id));
}

/** A copy of an item on another day with a fresh id. */
export function copyItem(i: ItineraryItem, date: string, id: string): ItineraryItem {
  return { ...i, id, date };
}

export function mapLink(place: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
}

export interface Readiness { done: number; total: number; missing: string[] }

/** Simple pre-trip checklist from saved trip data only. */
export function tripReadiness(t: TravelTrip): Readiness {
  const active = (t.bookings ?? []).filter((b) => b.status !== "cancelled");
  const checks: [boolean, string][] = [
    [!!t.destination, "Add a destination"],
    [(t.budget ?? 0) > 0, "Set a budget"],
    [(t.travellers ?? []).length > 0, "Add travellers"],
    [active.length > 0, "Add bookings"],
    [active.every((b) => b.confirmation === "confirmed"), "Confirm all bookings"],
    [(t.itinerary ?? []).length > 0, "Plan the itinerary"],
  ];
  return { done: checks.filter((c) => c[0]).length, total: checks.length, missing: checks.filter((c) => !c[0]).map((c) => c[1]) };
}

/** Shareable itinerary rows: plans by day, then bookings. No amounts or payment details. */
export function itineraryPdfRows(t: TravelTrip): string[][] {
  const rows: string[][] = [];
  itineraryDays(t.itinerary ?? []).forEach((d, n) => d.items.forEach((i) => rows.push([`Day ${n + 1} · ${d.date}`, i.time || "Any time", [i.title, i.place, i.travellers?.join(", ")].filter(Boolean).join(" · ")])));
  for (const b of [...(t.bookings ?? [])].filter((b) => b.status !== "cancelled").sort((a, b) => a.date.localeCompare(b.date)))
    rows.push(["Booking", b.date, [b.kind, b.provider, b.ref && `#${b.ref}`, b.location, b.confirmation === "confirmed" ? "Confirmed" : "Unconfirmed"].filter(Boolean).join(" · ")]);
  return rows;
}

const icsText = (s: string) => s.replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
const icsDate = (d: string) => d.replace(/-/g, "");
const icsStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const nextIsoDay = (d: string) => new Date(Date.parse(d + "T00:00:00Z") + 864e5).toISOString().slice(0, 10);

export interface CalendarEvent { uid: string; title: string; note: string; start: string; end: string; location?: string }

/** The events a trip calendar export would contain, in export order. Recomputed from live trip data, so re-exporting always reflects the latest edits. */
export function calendarEvents(t: TravelTrip): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const i of t.itinerary ?? []) {
    if (i.time) { const s = `${icsDate(i.date)}T${i.time.replace(":", "")}00`; out.push({ uid: `plan-${i.id}`, title: i.title, note: i.note ?? "", start: `DTSTART:${s}`, end: `DTEND:${s}`, location: i.place }); }
    else out.push({ uid: `plan-${i.id}`, title: i.title, note: i.note ?? "", start: `DTSTART;VALUE=DATE:${icsDate(i.date)}`, end: `DTEND;VALUE=DATE:${icsDate(nextIsoDay(i.date))}`, location: i.place });
  }
  for (const b of t.bookings ?? []) {
    if (b.status === "cancelled") continue;
    const title = `${b.kind} · ${b.provider}${b.ref ? ` #${b.ref}` : ""}`;
    if (b.checkInAt) out.push({ uid: `booking-${b.id}`, title: `Check-in: ${title}`, note: b.note ?? "", start: `DTSTART:${icsStamp(b.checkInAt)}`, end: `DTEND:${icsStamp(b.checkInAt)}`, location: b.location });
    else out.push({ uid: `booking-${b.id}`, title, note: b.note ?? "", start: `DTSTART;VALUE=DATE:${icsDate(b.date)}`, end: `DTEND;VALUE=DATE:${icsDate(nextIsoDay(b.date))}`, location: b.location });
  }
  return out;
}

/** iCalendar file of itinerary plans and active bookings; timed items keep their local time, check-ins use the saved moment. No amounts. `edits` overrides an event's title/note by uid. */
export function tripCalendar(t: TravelTrip, stamp: string, edits: Record<string, { title?: string; note?: string }> = {}): string {
  const ev = calendarEvents(t).map((e) => {
    const o = edits[e.uid] ?? {};
    return ["BEGIN:VEVENT", `UID:${e.uid}@ledgerline`, `DTSTAMP:${icsStamp(stamp)}`, e.start, e.end, `SUMMARY:${icsText(o.title ?? e.title)}`, ...((o.note ?? e.note) ? [`DESCRIPTION:${icsText(o.note ?? e.note)}`] : []), ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []), "END:VEVENT"].join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ledgerline//Trip//EN", `X-WR-CALNAME:${icsText(t.name)}`, ...ev, "END:VCALENDAR", ""].join("\r\n");
}
