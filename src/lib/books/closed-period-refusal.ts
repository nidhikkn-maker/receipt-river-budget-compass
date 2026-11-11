import type { Asset } from "@/lib/assets";
import type { ClosedPeriod } from "./types";

/**
 * R-E-I17: the database guard (0069 guard_books_registers) refuses a register change whose dates reach a closed period
 * with "<field> financial facts overlap a closed period; reopen it first". This only translates that refusal, after the
 * database made it, into words naming the closed period; it is not an app-side pre-check (WS-E's closed-period rule in
 * books/asset-register.ts replaces the pre-check side once merged). Nothing here decides what is saved.
 */
const REFUSAL = /financial facts overlap a closed period/i;

export const isClosedPeriodRefusal = (error: unknown): boolean =>
  REFUSAL.test(error instanceof Error ? error.message : typeof error === "string" ? error : String((error as { message?: unknown } | null)?.message ?? ""));

/** When an asset's register record starts, as 0069 reads it: coalesce(purchaseDate, capitalisedOn, inUse). */
export const assetRegisterStart = (a: Pick<Asset, "purchaseDate" | "capitalisedOn" | "inUse">): string | undefined =>
  [a.purchaseDate, a.capitalisedOn, a.inUse].find((d): d is string => d !== undefined && d !== null);

/** The first closed period (by start) overlapping from..to (0069 compares lo <= period.to AND hi >= period.from). */
export function overlappingClosedPeriod(closed: readonly ClosedPeriod[] | undefined, from: string, to = "9999-12-31"): ClosedPeriod | null {
  return [...(closed ?? [])].sort((x, y) => x.from.localeCompare(y.from)).find((p) => from <= p.to && to >= p.from) ?? null;
}

/**
 * The words to show for a 0069 refusal, or null when the error is something else (show it as it is).
 * `from`/`to` are the dates of the record the user tried to save (an asset: its register start, open-ended).
 */
export function closedPeriodRefusalMessage(error: unknown, closed: readonly ClosedPeriod[] | undefined, from: string | undefined, to?: string): string | null {
  if (!isClosedPeriodRefusal(error)) return null;
  const p = from ? overlappingClosedPeriod(closed, from, to) : null;
  const period = p ? ` (${p.from} to ${p.to})` : "";
  return `This date is in a closed period${period}; an authorised accounting adjustment is needed, or the period reopened with a written reason. The record was not saved.`;
}

/** The same, for a save of a whole asset list: names the period reached by the first new or changed asset. */
export function closedAssetRefusalMessage(error: unknown, closed: readonly ClosedPeriod[] | undefined, before: readonly Asset[] | undefined, after: readonly Asset[] | undefined): string | null {
  if (!isClosedPeriodRefusal(error)) return null;
  const stored = new Map((before ?? []).map((a) => [a.id, JSON.stringify(a)]));
  const changed = (after ?? []).filter((a) => stored.get(a.id) !== JSON.stringify(a));
  const reaching = changed.map(assetRegisterStart).find((d) => d !== undefined && !!overlappingClosedPeriod(closed, d));
  return closedPeriodRefusalMessage(error, closed, reaching);
}
