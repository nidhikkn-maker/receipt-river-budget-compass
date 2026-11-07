import { addDays } from "./planning";
import { bookingOutstanding, closeBlockers, type TravelTrip } from "./travel";

type Transactions = Parameters<typeof bookingOutstanding>[1];
export interface TravelCalendarItem {
  id: string;
  tripId: string;
  date: string;
  name: string;
  amount: number;
  direction: "out";
  kind: "trip" | "booking" | "itinerary";
  reviewStatus?: "pending" | "completed";
  reviewReason?: string;
}

export function bookingDeadlines(trips: TravelTrip[], transactions: Transactions): TravelCalendarItem[] {
  return trips.flatMap((trip) => (trip.bookings ?? []).flatMap((booking) => {
    const amount = bookingOutstanding(booking, transactions);
    if (!booking.dueDate || amount <= 0) return [];
    return [{ id: `booking:${trip.id}:${booking.id}`, tripId: trip.id, date: booking.dueDate,
      name: `${trip.name} · ${booking.provider || booking.ref} payment`, amount, direction: "out" as const, kind: "booking" as const }];
  })).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function bookingReminders(trips: TravelTrip[], transactions: Transactions, today: string, leadDays: number) {
  const end = addDays(today, Math.min(30, Math.max(0, leadDays)));
  return bookingDeadlines(trips, transactions).filter((item) => item.date <= end)
    .map((item) => ({ ...item, overdue: item.date < today }));
}

export function travelCalendarItems(trips: TravelTrip[], transactions: Transactions, from: string, through: string): TravelCalendarItem[] {
  const items = bookingDeadlines(trips, transactions).filter((item) => item.date >= from && item.date <= through);
  for (const trip of trips) {
    const blockers = closeBlockers(trip, transactions);
    const completed = !!trip.closedAt && blockers.length === 0;
    const reason = blockers.length ? blockers.join("; ") : completed ? "Trip closed with no outstanding settlement issues." : trip.cancelledAt ? "Trip cancelled; review any remaining records." : "Trip has not been closed after review.";
    for (const booking of trip.bookings ?? []) {
      if (!booking.dueDate || booking.dueDate < from || booking.dueDate > through || booking.status === "cancelled") continue;
      const amount = bookingOutstanding(booking, transactions);
      if (amount <= 0) items.push({ id: `booking:${trip.id}:${booking.id}`, tripId: trip.id, date: booking.dueDate, name: `${trip.name} · ${booking.provider || booking.ref} payment`, amount: 0, direction: "out", kind: "booking", reviewStatus: booking.confirmation === "pending" ? "pending" : "completed", reviewReason: booking.confirmation === "pending" ? "Payment covered; booking confirmation still pending." : "Booking payment is covered." });
    }
    for (const item of items.filter(item => item.tripId === trip.id && item.kind === "booking" && item.amount > 0)) { item.reviewStatus = "pending"; item.reviewReason = "Booking payment is still outstanding."; }
    for (const activity of trip.itinerary ?? []) if (activity.date >= from && activity.date <= through) items.push({ id: `itinerary:${trip.id}:${activity.id}`, tripId: trip.id, date: activity.date, name: `${activity.time ?? ""} ${activity.title} · ${trip.name}`.trim(), amount: 0, direction: "out", kind: "itinerary" });
    const end = trip.end < through ? trip.end : through;
    for (let date = trip.start > from ? trip.start : from; date <= end; date = addDays(date, 1)) {
      items.push({ id: `trip:${trip.id}:${date}`, tripId: trip.id, date, name: `${trip.name}${trip.destination ? ` · ${trip.destination}` : ""}`, amount: 0, direction: "out", kind: "trip" });
    }
    for (const item of items.filter(item => item.tripId === trip.id && item.kind !== "booking")) { item.reviewStatus = completed ? "completed" : "pending"; item.reviewReason = reason; }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}