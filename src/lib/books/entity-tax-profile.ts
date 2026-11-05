/**
 * Per-company, per-tax-year facts the owner enters (books.entityTaxProfiles): ownership share, partner capital,
 * accumulated profits and an optional book-profit override. Every field is optional; missing facts stay null so
 * the tax rules flag them instead of assuming. Pure.
 */
export interface EntityTaxYear {
  id: string;
  entityId: string;
  /** Financial year, e.g. "2025-26". */
  fy: string;
  /** Owner's share % — shareholding (company) or profit share (firm/LLP). */
  ownershipPct?: number | null | undefined;
  /** Partner's capital for the 12% interest cap (s.40(b)(iv)). */
  capital?: number | null | undefined;
  /** Accumulated profits available for deemed dividend (s.2(22)(e)). */
  accumulatedProfits?: number | null | undefined;
  /** Book profit as per the entity's accounts, overriding the ledger-derived figure. */
  bookProfit?: number | null | undefined;
  notes?: string | undefined;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Clean values: percentages must be 0–100, amounts finite; anything else becomes null (unknown). */
export function normalise(p: EntityTaxYear): EntityTaxYear {
  const pct = num(p.ownershipPct);
  return { ...p, ownershipPct: pct != null && pct >= 0 && pct <= 100 ? pct : null, capital: num(p.capital), accumulatedProfits: num(p.accumulatedProfits), bookProfit: num(p.bookProfit), notes: p.notes?.trim() || undefined };
}

/** Insert or replace the one entry for (entity, FY). */
export function upsertTaxYear(list: EntityTaxYear[], p: EntityTaxYear): EntityTaxYear[] {
  const clean = normalise(p);
  const rest = list.filter((x) => x.id !== clean.id && !(x.entityId === clean.entityId && x.fy === clean.fy));
  return [...rest, clean].sort((a, b) => a.entityId.localeCompare(b.entityId) || b.fy.localeCompare(a.fy));
}

export function removeTaxYear(list: EntityTaxYear[], id: string): EntityTaxYear[] {
  return list.filter((x) => x.id !== id);
}

/** Copy an entry to another FY (replacing that year's entry, if any). */
export function copyTaxYear(list: EntityTaxYear[], id: string, toFy: string, newId: string): EntityTaxYear[] {
  const src = list.find((x) => x.id === id);
  if (!src || !/^\d{4}-\d{2}$/.test(toFy)) return list;
  return upsertTaxYear(list, { ...src, id: newId, fy: toFy });
}

export function profileFor(list: EntityTaxYear[] | undefined, entityId: string, fy: string): EntityTaxYear | undefined {
  return (list ?? []).find((x) => x.entityId === entityId && x.fy === fy);
}

/** Drop entries for deleted companies; move entries when companies merge (target's own year wins). */
export function dropEntityYears(list: EntityTaxYear[] | undefined, entityId: string): EntityTaxYear[] {
  return (list ?? []).filter((x) => x.entityId !== entityId);
}
