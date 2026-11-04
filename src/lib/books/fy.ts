/** Proposed opening balances vs audited closing values [§19]. Differences are shown, never forced. */
import { OPENING_HEADS, type FyRecord, type OpeningHead } from "./types";

export const HEAD_LABEL: Record<OpeningHead, string> = {
  bank: "Bank balances", cash: "Cash", investments: "Investments", fixedAssets: "Fixed assets (gross)", accumulatedDepreciation: "Accumulated depreciation",
  capitalReserves: "Capital & reserves", loans: "Loans", receivables: "Receivables", payables: "Payables", taxBalances: "Tax balances", other: "Other balances",
};
const ASSET_SIDE: OpeningHead[] = ["bank", "cash", "investments", "fixedAssets", "receivables", "taxBalances", "other"];
const LIAB_SIDE: OpeningHead[] = ["capitalReserves", "loans", "payables", "accumulatedDepreciation"];

export interface OpeningLine { head: OpeningHead; audited: number | null; books: number | null; difference: number | null }
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Opening trial balance for the year after `rec.fy`, using audited closing values, compared with what
 * the books currently hold. A head with no audited figure stays null (never invented) [test 4].
 */
export function openingProposal(rec: FyRecord, books: Partial<Record<OpeningHead, number>>): { lines: OpeningLine[]; balanced: boolean | null; gap: number | null; totalsCheck: string | null } {
  const lines = OPENING_HEADS.map((head) => {
    const a = rec.audited[head]; const b = books[head];
    return { head, audited: a ?? null, books: b ?? null, difference: a != null && b != null ? r2(b - a) : null };
  });
  const have = (h: OpeningHead[]) => h.every((x) => rec.audited[x] != null);
  const sum = (h: OpeningHead[]) => r2(h.reduce((s, x) => s + (rec.audited[x] ?? 0), 0));
  const gap = have(ASSET_SIDE.filter((h) => rec.audited[h] != null)) && Object.keys(rec.audited).length ? r2(sum(ASSET_SIDE) - sum(LIAB_SIDE)) : null;
  let totalsCheck: string | null = null;
  if (rec.totalAssets != null && Math.abs(sum(ASSET_SIDE) - (rec.totalAssets - (rec.audited.accumulatedDepreciation ?? 0))) > 1 && Math.abs(sum(ASSET_SIDE) - rec.totalAssets) > 1)
    totalsCheck = `Asset lines add to ${sum(ASSET_SIDE)} but the balance sheet total is ${rec.totalAssets} — a schedule may be missing`;
  return { lines, balanced: gap == null ? null : Math.abs(gap) <= 1, gap, totalsCheck };
}

/** Next financial year label. */
export function nextFy(fy: string): string { const s = Number(fy.slice(0, 4)) + 1; return `${s}-${String((s + 1) % 100).padStart(2, "0")}`; }

/** Confirming copies audited figures as the next year's opening; earlier source figures stay untouched [§20]. */
export function confirmOpening(rec: FyRecord, today: string, chosen?: Partial<Record<OpeningHead, number>>): FyRecord {
  return { ...rec, confirmedOpening: { ...(chosen ?? rec.audited) }, confirmedOn: today };
}
