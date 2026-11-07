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

/** Drop entries for a deleted company. */
export function dropEntityYears(list: EntityTaxYear[] | undefined, entityId: string): EntityTaxYear[] {
  return (list ?? []).filter((x) => x.entityId !== entityId);
}

/** Merge: the merged-away company's years move to the target, except years the target already has. */
export function mergeEntityYears(list: EntityTaxYear[] | undefined, from: string, into: string): EntityTaxYear[] {
  const all = list ?? [];
  const has = new Set(all.filter((x) => x.entityId === into).map((x) => x.fy));
  return all.filter((x) => x.entityId !== from || !has.has(x.fy)).map((x) => (x.entityId === from ? { ...x, entityId: into } : x));
}

/**
 * Compliance checks on one entry. "errors" stop saving (impossible values); "warnings" are shown but saving
 * stays allowed, because no field is mandatory.
 */
export function profileIssues(p: { fy: string; ownershipPct?: number | null; capital?: number | null; accumulatedProfits?: number | null; bookProfit?: number | null }): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  const m = /^(\d{4})-(\d{2})$/.exec(p.fy);
  if (!m) errors.push("Tax year looks like 2025-26");
  else if ((Number(m[1]) + 1) % 100 !== Number(m[2])) errors.push(`Tax year ${p.fy} should end the year after it starts`);
  if (p.ownershipPct != null && (p.ownershipPct < 0 || p.ownershipPct > 100)) errors.push("Ownership share is between 0 and 100");
  if (p.capital != null && p.capital < 0) warnings.push("Partner capital is negative — the 12% interest cap will treat it as nil");
  if (p.accumulatedProfits != null && p.accumulatedProfits < 0) warnings.push("Past accumulated profits are negative — no deemed dividend can arise");
  if (p.ownershipPct == null) warnings.push("Share not entered — deemed-dividend and profit-share checks will be flagged as unknown");
  if (p.bookProfit != null && p.bookProfit < 0) warnings.push("Book profit is a loss — partner remuneration is limited to ₹3,00,000");
  return { errors, warnings };
}
