import { describe, expect, it } from "vitest";
import { cancelTrip, deleteBlockers, restoreTrip } from "./trip-lifecycle";
import { tripStatus, type TravelTrip } from "./travel";

const trip: TravelTrip = { id: "t1", name: "Kovai Trip", destination: "Coimbatore", start: "2026-11-03", end: "2026-11-03", budget: 0, bookings: [{ id: "b1", kind: "hotel", provider: "H", ref: "", date: "2026-11-03", amount: 3000, status: "unpaid" }] } as TravelTrip;

describe("trip lifecycle", () => {
  it("cancelling marks the trip cancelled and can cancel unpaid bookings, without touching entries", () => {
    const c = cancelTrip(trip, "2026-11-01T00:00:00Z", true);
    expect(tripStatus(c, "2026-11-01")).toBe("cancelled");
    expect(c.bookings?.[0]?.status).toBe("cancelled");
  });
  it("restoring returns to the date-based status", () => {
    expect(tripStatus(restoreTrip(cancelTrip(trip, "x", false)), "2026-11-01")).toBe("upcoming");
  });
  it("deleting is blocked while an advance is outstanding", () => {
    const withAdvance = { ...trip, advances: [{ id: "a", amount: 5000, date: "2026-11-01" }] } as unknown as TravelTrip;
    expect(deleteBlockers(withAdvance, [])).toContain("An advance is not settled yet");
    expect(deleteBlockers(trip, [])).toEqual([]);
  });
});
describe("restored label", () => {
  it("restoring records when it happened so the list can show Restored", () => {
    expect(restoreTrip(cancelTrip(trip, "x", false), "2026-11-02T00:00:00Z").restoredAt).toBe("2026-11-02T00:00:00Z");
  });
});
