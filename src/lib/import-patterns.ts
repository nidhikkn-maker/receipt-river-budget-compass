import { detectSubscriptions } from './planning';
import { merchantFamily, type ImportRow } from './historical-import';

export interface ImportPattern { key: string; label: string; cadence: number | null; rows: ImportRow[] }

/** Pattern hints never deduplicate, approve, or create recurring commitments. */
export function importPatterns(rows: ImportRow[]): ImportPattern[] {
  const buckets = new Map<string, ImportRow[]>();
  const unmatched: ImportRow[] = [];
  for (const row of rows) {
    const merchant = merchantFamily(row.line.description);
    if (row.duplicate_kind !== 'new' || row.decision === 'excluded' || merchant === 'Unknown merchant'
      || !row.proposal.accountId || !Number.isFinite(Date.parse(row.line.date)) || !Number.isFinite(row.line.amount) || row.line.amount <= 0) {
      unmatched.push(row); continue;
    }
    const key = JSON.stringify([merchant, row.proposal.accountId, row.proposal.currency, row.line.direction ?? 'debit', row.proposal.txnType ?? 'expense']);
    const bucket = buckets.get(key) ?? [];
    bucket.push(row); buckets.set(key, bucket);
  }
  const patterns: ImportPattern[] = [];
  for (const [key, items] of buckets) {
    if (items.length < 2) { unmatched.push(...items); continue; }
    // Same-day payments remain separate but are not evidence of a periodic schedule.
    const uniqueDates = new Set(items.map(row => row.line.date)).size === items.length;
    const candidates = uniqueDates ? detectSubscriptions(items.map(row => ({ merchant: 'pattern', amount: row.line.amount, date: row.line.date }))) : [];
    const cadence = candidates[0]?.everyDays ?? null;
    const frequency = cadence === null ? 'Repeated payments' : cadence <= 8 ? 'Possible weekly pattern' : cadence <= 35 ? 'Possible monthly pattern' : cadence <= 105 ? 'Possible quarterly pattern' : 'Possible yearly pattern';
    patterns.push({ key, label: `${merchantFamily(items[0]?.line.description ?? '')} · ${frequency}`, cadence, rows: items });
  }
  if (unmatched.length) patterns.push({ key: 'no-pattern', label: 'No reliable pattern', cadence: null, rows: unmatched });
  return patterns;
}