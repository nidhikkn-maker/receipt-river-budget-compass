import { describe, expect, it } from "vitest";
import { emptyTripFilters, matchesTripFilters } from "./trip-filters";
import type { TravelTrip } from "./travel";

const trip: TravelTrip = { id: "one", name: "Conference", destination: "Chennai", start: "2026-11-10", end: "2026-11-15", budget: 10000, currencies: ["INR"], type: "mixed", primaryWorkspace: "business", workspaceBudgets: [{ workspace: "personal", amount: 2000 }], travellers: ["Asha", "Ravi"], organisation: "Acme" };
describe("trip discovery filters", () => {
  it("allows any selected traveller but requires the selected organisation too", () => {
    expect(matchesTripFilters(trip, { ...emptyTripFilters(), travellers: ["Other", "Ravi"], organisations: ["Acme"] })).toBe(true);
    expect(matchesTripFilters(trip, { ...emptyTripFilters(), travellers: ["Ravi"], organisations: ["Other"] })).toBe(false);
  });
  it("finds a mixed trip through its primary workspace or saved workspace budget", () => {
    for (const w of ["business", "personal", "mixed"]) expect(matchesTripFilters(trip, { ...emptyTripFilters(), workspaces: [w] })).toBe(true);
    expect(matchesTripFilters(trip, { ...emptyTripFilters(), workspaces: ["official"] })).toBe(false);
  });
  it("uses inclusive trip date overlap and destination selection", () => {
    expect(matchesTripFilters(trip, { ...emptyTripFilters(), from: "2026-11-15", to: "2026-11-20", destinations: ["Chennai", "Delhi"] })).toBe(true);
    expect(matchesTripFilters(trip, { ...emptyTripFilters(), from: "2026-11-16" })).toBe(false);
    expect(matchesTripFilters(trip, { ...emptyTripFilters(), destinations: ["Delhi"] })).toBe(false);
  });
  it("does not mutate the trip or any financial values", () => {
    const before = JSON.stringify(trip);
    matchesTripFilters(trip, emptyTripFilters());
    expect(JSON.stringify(trip)).toBe(before);
  });
});