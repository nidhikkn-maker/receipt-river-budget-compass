import { addDays } from "./planning";
import { bookingOutstanding, type TravelTrip } from "./travel";

type Transactions = Parameters<typeof bookingOutstanding>[1];
export interface TravelCalendarItem {
  id: string;
  tripId: string;
  date: string;
  name: string;
  amount: number;
  direction: "out";
  kind: "trip" | "booking" | "itinerary";
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
    for (const activity of trip.itinerary ?? []) if (activity.date >= from && activity.date <= through) items.push({ id: `itinerary:${trip.id}:${activity.id}`, tripId: trip.id, date: activity.date, name: `${activity.time ?? ""} ${activity.title} · ${trip.name}`.trim(), amount: 0, direction: "out", kind: "itinerary" });
    const end = trip.end < through ? trip.end : through;
    for (let date = trip.start > from ? trip.start : from; date <= end; date = addDays(date, 1)) {
      items.push({ id: `trip:${trip.id}:${date}`, tripId: trip.id, date, name: `${trip.name}${trip.destination ? ` · ${trip.destination}` : ""}`, amount: 0, direction: "out", kind: "trip" });
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}