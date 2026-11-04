/** Closed periods and the automation policy [§34, §55–57]. Pure rules. */
import type { ClosedPeriod, PeriodEvent } from "./types";

/** The closed period that contains a date, if any. */
export function closedPeriodFor(date: string, periods: ClosedPeriod[]): ClosedPeriod | null {
  return periods.find((p) => date >= p.from && date <= p.to) ?? null;
}

/** Why an entry dated `date` (and, for a change, its previous date) cannot be saved, or null. */
export function periodBlocker(periods: ClosedPeriod[], date: string, previousDate?: string | null): string | null {
  for (const d of [date, previousDate].filter((x): x is string => !!x)) {
    const p = closedPeriodFor(d, periods);
    if (p) return `${d} is in a closed period (${p.from} to ${p.to}). Reopen it on the Audit page first.`;
  }
  return null;
}

export function closePeriod(periods: ClosedPeriod[], log: PeriodEvent[], from: string, to: string, note: string, today: string, id: string): { periods: ClosedPeriod[]; log: PeriodEvent[] } {
  if (!(from <= to)) throw new Error("The period must start on or before it ends");
  if (periods.some((p) => from <= p.to && to >= p.from)) throw new Error("This overlaps a period that is already closed");
  return { periods: [...periods, { id, from, to, closedOn: today, note: note.trim() }].sort((a, b) => a.from.localeCompare(b.from)), log: [...log, { at: today, action: "closed", periodId: id, reason: note.trim() }] };
}

/** Reopening is restricted: it needs a written reason and is logged permanently [§57]. */
export function reopenPeriod(periods: ClosedPeriod[], log: PeriodEvent[], id: string, reason: string, today: string): { periods: ClosedPeriod[]; log: PeriodEvent[] } {
  if (reason.trim().length < 5) throw new Error("Write why this period is being reopened");
  if (!periods.some((p) => p.id === id)) throw new Error("That period isn't closed");
  return { periods: periods.filter((p) => p.id !== id), log: [...log, { at: today, action: "reopened", periodId: id, reason: reason.trim() }] };
}

export type PolicyLevel = "automatic" | "confirm" | "restricted";
/** The approved automation policy, word for word from v6.0 §55–57. */
export const POLICY: { level: PolicyLevel; items: string[] }[] = [
  { level: "automatic", items: ["Document classification", "Data extraction", "Merchant recognition", "Entity matching", "Document linking", "Duplicate detection", "Draft report generation", "Reminder generation", "Read-only regulatory monitoring", "Calculation previews"] },
  { level: "confirm", items: ["Opening balances", "Asset capitalisation", "Transaction reclassification", "Property and tenant associations", "Depreciation posting", "Tax treatment changes", "Historical corrections", "Reimbursement settlements"] },
  { level: "restricted", items: ["Closed-period changes", "Shared database migrations", "Financial statement finalisation", "Statutory filing", "Statutory certification", "Production deployment"] },
];
export function policyFor(action: string): PolicyLevel | null {
  return POLICY.find((p) => p.items.includes(action))?.level ?? null;
}
