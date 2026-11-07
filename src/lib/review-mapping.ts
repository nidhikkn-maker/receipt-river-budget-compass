import type { Expense } from './expenses';
import type { FinancialReview } from './financial-review';
import type { FinancePreferences } from './preferences';
import { tripActionSnapshot } from './trip-actions';
import type { TravelTrip } from './travel';

export type ReviewMappingAction = 'trip' | 'organisation' | 'activity';
export function mappingPreview(rows: FinancialReview[], action: ReviewMappingAction, value: string, tripId: string, prefs: FinancePreferences) {
  const trip = (prefs.trips as TravelTrip[]).find(t => t.id === tripId && !t.closedAt && !t.cancelledAt);
  if (action !== 'activity' && !trip) throw Error('Choose an open trip. Organisation batches currently apply to expenses already linked to that trip.');
  if (action === 'organisation' && !prefs.tags.some(t => t.group === 'Organisation' && t.name === value)) throw Error('Choose a configured organisation.');
  if (action === 'activity' && !prefs.tags.some(t => `${t.group}: ${t.name}` === value && ['Project', 'Event', 'Purpose', 'Client'].includes(t.group))) throw Error('Choose a configured activity.');
  if (!rows.length || rows.length > 500) throw Error('Select between 1 and 500 transactions.');
  const records: Expense[] = [], excluded: { id: string; title: string; reason: string }[] = [];
  const tag = trip ? `Trip: ${trip.name}` : '';
  for (const row of rows) {
    const e = row.transaction;
    const linked = !!trip && (e.tripId === trip.id || (e.tags ?? []).includes(tag));
    const reason = (e.txnType ?? 'expense') !== 'expense' ? 'Expense entries only' : row.group === 'conflict' ? 'Resolve duplicate or split conflicts first' :
      action === 'trip' && ((e.tripId && e.tripId !== trip?.id) || e.tags?.some(t => t.startsWith('Trip: ') && t !== tag)) ? 'Already linked to another trip' :
      action === 'organisation' && !linked ? 'Not linked to the selected trip' :
      action === 'organisation' && (e.workspaceAllocations?.length || (e.reimbursementStatus ?? 'none') !== 'none' || Object.keys(e.reimbursement ?? {}).length) ? 'Split responsibility or a claim requires individual review' :
      action === 'trip' && linked ? 'Already linked' : action === 'activity' && e.tags?.includes(value) ? 'Already linked' :
      action === 'organisation' && e.department === value ? 'Organisation already assigned' : '';
    if (reason) excluded.push({ id: e.id, title: e.title, reason }); else records.push({ ...e });
  }
  if (!records.length) throw Error('No selected transactions are eligible for this mapping.');
  return { action, value: action === 'trip' ? tag : value, tripId, records, excluded, snapshots: records.map(tripActionSnapshot), fingerprint: JSON.stringify(records),
    configuration: JSON.stringify({ trip: trip ?? null, tags: prefs.tags }), selected: rows.length };
}
export type ReviewMappingPreview = ReturnType<typeof mappingPreview>;
export function mappingStillCurrent(preview: ReviewMappingPreview, transactions: Expense[], prefs: FinancePreferences) {
  const trip = (prefs.trips as TravelTrip[]).find(t => t.id === preview.tripId && !t.closedAt && !t.cancelledAt);
  return JSON.stringify(preview.records.map(e => transactions.find(t => t.id === e.id))) === preview.fingerprint &&
    JSON.stringify({ trip: trip ?? null, tags: prefs.tags }) === preview.configuration;
}