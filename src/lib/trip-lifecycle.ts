import { tripFinance, type TravelTrip } from "./travel";
import { tripTag } from "./intelligence";

type Row = Parameters<typeof tripFinance>[1][number];

/** Entries linked to a trip by picker or legacy tag. */
export function tripLinkedEntries<T extends Row>(trip: TravelTrip, txns: T[]): T[] {
  const tag = tripTag(trip);
  return txns.filter((x) => x.tripId === trip.id || (x.tags ?? []).includes(tag));
}

/** What cancelling touches. Cancelling never removes entries or payments. */
export function cancelImpact(trip: TravelTrip, txns: Row[]) {
  const f = tripFinance(trip, txns);
  return {
    unpaidBookings: (trip.bookings ?? []).filter((b) => b.status === "unpaid").length,
    outstandingAdvance: Math.abs(f.advanceBalance),
    linkedEntries: tripLinkedEntries(trip, txns).length,
  };
}

export function cancelTrip(trip: TravelTrip, now: string, cancelUnpaidBookings: boolean): TravelTrip {
  const next: TravelTrip = { ...trip, cancelledAt: now };
  if (cancelUnpaidBookings && trip.bookings) next.bookings = trip.bookings.map((b) => (b.status === "unpaid" ? { ...b, status: "cancelled" as const } : b));
  return next;
}

export function restoreTrip(trip: TravelTrip): TravelTrip {
  return { ...trip, cancelledAt: null };
}

/** Deleting a trip only unlinks entries; blocked while money is still open. */
export function deleteBlockers(trip: TravelTrip, txns: Row[]): string[] {
  const f = tripFinance(trip, txns);
  const out: string[] = [];
  if (Math.abs(f.advanceBalance) > 0.005) out.push("An advance is not settled yet");
  if (f.reimbursablePending > 0.005) out.push("A reimbursement claim is still pending");
  return out;
}
