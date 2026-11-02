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

/** iCalendar file of itinerary plans and active bookings; timed items keep their local time, check-ins use the saved moment. No amounts. */
export function tripCalendar(t: TravelTrip, stamp: string): string {
  const ev: string[] = [];
  const add = (uid: string, summary: string, start: string, end: string, location?: string) =>
    ev.push(["BEGIN:VEVENT", `UID:${uid}@ledgerline`, `DTSTAMP:${icsStamp(stamp)}`, start, end, `SUMMARY:${icsText(summary)}`, ...(location ? [`LOCATION:${icsText(location)}`] : []), "END:VEVENT"].join("\r\n"));
  for (const i of t.itinerary ?? []) {
    if (i.time) { const s = `${icsDate(i.date)}T${i.time.replace(":", "")}00`; add(`plan-${i.id}`, i.title, `DTSTART:${s}`, `DTEND:${s}`, i.place); }
    else add(`plan-${i.id}`, i.title, `DTSTART;VALUE=DATE:${icsDate(i.date)}`, `DTEND;VALUE=DATE:${icsDate(nextIsoDay(i.date))}`, i.place);
  }
  for (const b of t.bookings ?? []) {
    if (b.status === "cancelled") continue;
    const title = `${b.kind} · ${b.provider}${b.ref ? ` #${b.ref}` : ""}`;
    if (b.checkInAt) add(`booking-${b.id}`, `Check-in: ${title}`, `DTSTART:${icsStamp(b.checkInAt)}`, `DTEND:${icsStamp(b.checkInAt)}`, b.location);
    else add(`booking-${b.id}`, title, `DTSTART;VALUE=DATE:${icsDate(b.date)}`, `DTEND;VALUE=DATE:${icsDate(nextIsoDay(b.date))}`, b.location);
  }
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ledgerline//Trip//EN", `X-WR-CALNAME:${icsText(t.name)}`, ...ev, "END:VCALENDAR", ""].join("\r\n");
}
