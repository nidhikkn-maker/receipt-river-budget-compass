import { expect, it } from "vitest";
import { confirmationItems } from "./travel-inbox";
import type { VaultDoc } from "./documents";
const doc = { id: "original", notes: "Booking confirmation · Work trip" } as VaultDoc;
it("keeps unlinked confirmations pending and clears pending status after booking review", () => {
  const trip = { id: "t", name: "Work trip", destination: "", start: "", end: "", budget: 0, currencies: [], bookings: [{ id: "b", kind: "flight" as const, date: "", provider: "", ref: "", amount: 0, status: "unpaid" as const, documentIds: ["original"] }] };
  expect(confirmationItems([doc], [{ ...trip, bookings: [] }])[0]?.linked).toBe(false);
  expect(confirmationItems([doc], [trip])[0]?.linked).toBe(true);
});