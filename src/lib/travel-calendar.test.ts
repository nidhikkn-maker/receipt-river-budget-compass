import { describe, expect, it } from "vitest";
import { bookingReminders, travelCalendarItems } from "./travel-calendar";
import type { TravelTrip } from "./travel";

const trip: TravelTrip = { id: "t", name: "Conference", destination: "Chennai", start: "2026-10-30", end: "2026-11-02", budget: 10000, currencies: ["INR"], bookings: [
  { id: "hotel", kind: "hotel", provider: "Hotel", ref: "", date: "2026-11-01", dueDate: "2026-10-30", amount: 5000, status: "unpaid", expenseId: "payment" },
  { id: "flight", kind: "flight", provider: "Airline", ref: "", date: "2026-11-02", dueDate: "2026-11-03", amount: 2000, status: "unpaid" },
] };
const txns = [{ id: "payment", amount: 2000, date: "2026-10-29", title: "Deposit", merchant: null, category: "Travel", tags: [], txnType: "expense" as const }];

describe("booking reminders", () => {
  it("shows upcoming due dates and overdue balances net of partial payments", () => {
    expect(bookingReminders([trip], txns, "2026-10-31", 3)).toMatchObject([
      { date: "2026-10-30", amount: 3000, overdue: true },
      { date: "2026-11-03", amount: 2000, overdue: false },
    ]);
  });
  it("does not remind for paid, cancelled or fully covered bookings", () => {
    const settled = { ...trip, bookings: (trip.bookings ?? []).map((b, i) => ({ ...b, status: i === 0 ? "paid" as const : "cancelled" as const })) };
    expect(bookingReminders([settled], txns, "2026-10-31", 30)).toEqual([]);
    expect(bookingReminders([{ ...trip, bookings: (trip.bookings ?? []).slice(0, 1) }], txns.map(x => ({ ...x, amount: 5000 })), "2026-10-31", 3)).toEqual([]);
  });
  it("respects zero lead days while keeping overdue balances visible", () => {
    expect(bookingReminders([trip], txns, "2026-10-31", 0).map((i) => i.id)).toEqual(["booking:t:hotel"]);
  });
});

describe("travel calendar", () => {
  it("includes each trip day in the visible month and unpaid booking deadlines", () => {
    const items = travelCalendarItems([trip], txns, "2026-11-01", "2026-11-30");
    expect(items.filter((i) => i.kind === "trip").map((i) => i.date)).toEqual(["2026-11-01", "2026-11-02"]);
    expect(items.filter((i) => i.kind === "booking")).toMatchObject([{ date: "2026-11-03", amount: 2000, tripId: "t" }]);
  });
  it("includes operational itinerary activities without adding spending", () => {
    const items = travelCalendarItems([{ ...trip, itinerary: [{ id: "meeting", date: "2026-11-02", time: "10:00", title: "Client meeting" }] }], txns, "2026-11-01", "2026-11-30");
    expect(items.filter(i => i.kind === "itinerary")).toMatchObject([{ date: "2026-11-02", name: "10:00 Client meeting · Conference", amount: 0 }]);
  });
});