import type { VaultDoc } from "./documents";
import type { TravelTrip } from "./travel";
export interface TravelMessage { id: string; title: string; text: string; tripId: string | null; source: string; createdAt: string; reviewed: boolean }
export function confirmationItems(documents: VaultDoc[], trips: TravelTrip[]) {
  const linked = new Set(trips.flatMap((t) => (t.bookings ?? []).flatMap((b) => b.documentIds ?? [])));
  return documents.filter((d) => d.notes.startsWith("Booking confirmation · ")).map((doc) => ({ doc, linked: linked.has(doc.id), trip: trips.find((t) => doc.notes === `Booking confirmation · ${t.name}`) }));
}