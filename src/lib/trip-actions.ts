import type { Expense } from "./expenses";
import { tripTag } from "./intelligence";
import type { TravelTrip } from "./travel";
export type TripAction = "link" | "unlink" | "add_tag" | "organisation" | "reimbursable";
export function tripExpenses(trip: TravelTrip, rows: Expense[]) {
  return rows.filter((e) => (e.txnType ?? "expense") === "expense" && (e.tripId === trip.id || (e.tags ?? []).includes(tripTag(trip))));
}
export function tripActionSnapshot(e: Expense) {
  return { id: e.id, tags: e.tags ?? [], tripId: e.tripId ?? null, department: e.department ?? null, amount: e.amount, date: e.date, reimbursementStatus: e.reimbursementStatus ?? "none" };
}
export function selectMatching(selected: string[], visible: string[]) { return [...new Set([...selected, ...visible])]; }