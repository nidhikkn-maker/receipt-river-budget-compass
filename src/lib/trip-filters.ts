import type { TravelTrip } from "./travel";

export interface TripFilters {
  workspaces: string[];
  travellers: string[];
  organisations: string[];
  destinations: string[];
  from: string;
  to: string;
}
export const emptyTripFilters = (): TripFilters => ({ workspaces: [], travellers: [], organisations: [], destinations: [], from: "", to: "" });
/** OR inside each selection, AND across fields; dates overlap the trip, inclusively. */
export function matchesTripFilters(trip: TravelTrip, filters: TripFilters) {
  const workspaces = new Set([trip.type ?? "personal", trip.primaryWorkspace ?? (trip.type === "mixed" ? "" : trip.type ?? "personal"), ...(trip.workspaceBudgets ?? []).map((line) => line.workspace)]);
  return (!filters.workspaces.length || filters.workspaces.some((w) => workspaces.has(w)))
    && (!filters.travellers.length || filters.travellers.some((name) => trip.travellers?.includes(name)))
    && (!filters.organisations.length || filters.organisations.includes(trip.organisation ?? ""))
    && (!filters.destinations.length || filters.destinations.includes(trip.destination))
    && (!filters.from || trip.end >= filters.from)
    && (!filters.to || trip.start <= filters.to);
}