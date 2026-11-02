import { describe, expect, it } from "vitest";
import { copyItem, itineraryConflicts, itineraryDays, outsideTrip, tripReadiness } from "./trip-itinerary";
import type { ItineraryItem, TravelTrip } from "./travel";

const i = (id: string, date: string, time?: string, travellers?: string[]): ItineraryItem => ({ id, date, title: id, ...(time ? { time } : {}), ...(travellers ? { travellers } : {}) });

describe("trip itinerary", () => {
  it("groups by day in time order", () => {
    const d = itineraryDays([i("b", "2026-05-02", "09:00"), i("a", "2026-05-01"), i("c", "2026-05-02", "08:00")]);
    expect(d.map((x) => x.date)).toEqual(["2026-05-01", "2026-05-02"]);
    expect(d[1]!.items.map((x) => x.id)).toEqual(["c", "b"]);
  });
  it("flags same-time clashes only for shared travellers", () => {
    expect([...itineraryConflicts([i("a", "2026-05-01", "09:00", ["KK"]), i("b", "2026-05-01", "09:00", ["KK"])])].sort()).toEqual(["a", "b"]);
    expect(itineraryConflicts([i("a", "2026-05-01", "09:00", ["KK"]), i("b", "2026-05-01", "09:00", ["Wife"])]).size).toBe(0);
    expect(itineraryConflicts([i("a", "2026-05-01"), i("b", "2026-05-01")]).size).toBe(0);
  });
  it("flags items outside trip dates", () => {
    expect([...outsideTrip({ start: "2026-05-01", end: "2026-05-03" }, [i("a", "2026-04-30"), i("b", "2026-05-02")])]).toEqual(["a"]);
  });
  it("copies with a new id and date", () => {
    const c = copyItem(i("a", "2026-05-01"), "2026-05-02", "z");
    expect(c).toMatchObject({ id: "z", date: "2026-05-02", title: "a" });
  });
  it("readiness counts saved data", () => {
    const r = tripReadiness({ id: "t", name: "T", start: "2026-05-01", end: "2026-05-03", budget: 0, destination: "Goa" } as TravelTrip);
    expect(r.done).toBe(2);
    expect(r.missing).toContain("Set a budget");
  });
});

import { itineraryPdfRows } from "./trip-itinerary";
describe("itinerary PDF", () => {
  it("lists plans by day then bookings, without amounts", () => {
    const rows = itineraryPdfRows({ id: "t", name: "T", start: "2026-05-01", end: "2026-05-02", budget: 0, itinerary: [{ id: "a", date: "2026-05-01", time: "09:00", title: "Museum" }], bookings: [{ id: "h", kind: "hotel", provider: "Taj", ref: "R1", date: "2026-05-01", amount: 9000, status: "unpaid" }] } as unknown as TravelTrip);
    expect(rows).toEqual([["Day 1 · 2026-05-01", "09:00", "Museum"], ["Booking", "2026-05-01", "hotel · Taj · #R1 · Unconfirmed"]]);
    expect(rows.flat().join(" ")).not.toContain("9000");
  });
});

import { calendarEvents, tripCalendar } from "./trip-itinerary";
import { dueCheckIns, tripReminderItems } from "./push-rules";
describe("trip calendar and check-ins", () => {
  const t = { id: "t", name: "Goa", start: "2026-05-01", end: "2026-05-02", budget: 0, itinerary: [{ id: "a", date: "2026-05-01", time: "09:30", title: "Beach, sunrise" }, { id: "b", date: "2026-05-02", title: "Free day" }], bookings: [{ id: "h", kind: "hotel", provider: "Taj", ref: "R1", date: "2026-05-01", amount: 9000, status: "unpaid", checkInAt: "2026-05-01T08:30:00.000Z" }, { id: "x", kind: "flight", provider: "AI", ref: "", date: "2026-05-01", amount: 1, status: "cancelled" }] } as unknown as TravelTrip;
  it("exports plans and active bookings without amounts", () => {
    const ics = tripCalendar(t, "2026-04-01T00:00:00Z");
    expect(ics).toContain("DTSTART:20260501T093000");
    expect(ics).toContain("SUMMARY:Beach\\, sunrise");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260502");
    expect(ics).toContain("DTSTART:20260501T083000Z");
    expect(ics).not.toContain("flight");
    expect(ics).not.toContain("9000");
  });
  it("check-in reminder fires once its time arrives, not before or long after", () => {
    const at = Date.parse("2026-05-01T08:30:00Z");
    expect(dueCheckIns([t as never], at - 60_000, 15)).toEqual([]);
    expect(dueCheckIns([t as never], at + 5 * 60_000, 15).map((x) => x.key)).toEqual(["checkin:h:2026-05-01T08:30:00.000Z"]);
    expect(dueCheckIns([t as never], at + 20 * 60_000, 15)).toEqual([]);
  });
  it("applies per-event title and note edits only to the exported file", () => {
    const ics = tripCalendar(t, "2026-04-01T00:00:00Z", { "plan-a": { title: "Sunrise walk", note: "Meet at lobby" } });
    expect(ics).toContain("SUMMARY:Sunrise walk");
    expect(ics).toContain("DESCRIPTION:Meet at lobby");
    expect(ics).not.toContain("Beach\\, sunrise");
    expect(ics).toContain("SUMMARY:Check-in: hotel · Taj #R1");
  });
  it("lists exportable events with their default titles and saved notes", () => {
    expect(calendarEvents(t).map((e) => e.uid)).toEqual(["plan-a", "plan-b", "booking-h"]);
  });
  it("skips bookings whose reminder is turned off", () => {
    const off = { ...t, bookings: [{ ...t.bookings[0], reminderOff: true }] };
    const at = Date.parse("2026-05-01T08:30:00Z");
    expect(dueCheckIns([off as never], at + 5 * 60_000, 15)).toEqual([]);
    expect(tripReminderItems([off as never], "2026-05-01").filter((i) => i.key.includes("booking"))).toEqual([]);
  });
});
