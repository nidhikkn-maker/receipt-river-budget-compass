import { useState } from 'react';
import { useStore } from '@/lib/store';
import type { FinancialReview } from '@/lib/financial-review';
import { mappingPreview, mappingStillCurrent, type ReviewMappingAction, type ReviewMappingPreview } from '@/lib/review-mapping';
import type { TravelTrip } from '@/lib/travel';
import { money } from '@/lib/expenses';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

export function ReviewMappingPanel({ rows, onSaved }: { rows: FinancialReview[]; onSaved: (excluded: string[]) => void }) {
  const store = useStore();
  const [action, setAction] = useState<ReviewMappingAction>('activity');
  const [value, setValue] = useState(''), [tripId, setTripId] = useState('');
  const [preview, setPreview] = useState<ReviewMappingPreview | null>(null), [error, setError] = useState('');
  const trips = (store.preferences.trips as TravelTrip[]).filter(t => !t.closedAt && !t.cancelledAt);
  const options = store.preferences.tags.filter(t => action === 'organisation' ? t.group === 'Organisation' : ['Project','Event','Purpose','Client'].includes(t.group));
  const prepare = () => { try { setPreview(mappingPreview(rows, action, value, tripId, store.preferences)); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to prepare mapping'); } };
  const apply = async () => {
    if (!preview) return;
    try {
      if (!mappingStillCurrent(preview, store.transactions, store.preferences)) throw Error('Records or configuration changed. Prepare a new preview.');
      await store.applyReviewMapping(preview);
      onSaved(preview.excluded.map(e => e.id)); setPreview(null); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save mapping'); }
  };
  return <div className="space-y-3">
    {action === 'organisation' && !preview && <p className="text-xs text-muted-foreground">Bulk organisation changes are available for one open trip. Split responsibility and active claims require individual review.</p>}
    {!preview ? <><Select value={action} onValueChange={v => { setAction(v as ReviewMappingAction); setValue(''); }}><SelectTrigger aria-label="Mapping action"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="activity">Link project or activity</SelectItem><SelectItem value="trip">Link trip</SelectItem><SelectItem value="organisation">Assign organisation within a trip</SelectItem></SelectContent></Select>
    {action !== 'activity' && <Select value={tripId} onValueChange={setTripId}><SelectTrigger aria-label="Mapping trip"><SelectValue placeholder="Choose open trip" /></SelectTrigger><SelectContent>{trips.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>}
    {action !== 'trip' && <Select value={value} onValueChange={setValue}><SelectTrigger aria-label="Mapping value"><SelectValue placeholder={action === 'organisation' ? 'Configured organisation' : 'Configured activity'} /></SelectTrigger><SelectContent>{options.map(t => <SelectItem key={`${t.group}:${t.name}`} value={action === 'organisation' ? t.name : `${t.group}: ${t.name}`}>{t.name}</SelectItem>)}</SelectContent></Select>}
    <Button onClick={prepare}>Preview mapping</Button></> : <><h3 className="font-semibold">Confirm mapping</h3><p className="text-sm">{preview.selected} selected · {preview.records.length} included · {preview.excluded.length} excluded</p><p className="text-sm">{preview.value}</p><p className="text-xs text-muted-foreground">Amounts, account ownership, payment sources, currency rates and claims remain unchanged. Organisation and activity reports may change. Other issues remain under review.</p><ul className="max-h-64 divide-y overflow-y-auto text-sm">{preview.records.map(e => <li key={e.id} className="py-2"><p>{e.title} · {money(e.amount)}</p><p className="text-xs text-muted-foreground">{preview.action === 'organisation' ? e.department || 'Unknown organisation' : (e.tags ?? []).join(', ') || 'No activity'} → {preview.value}</p></li>)}</ul>{!!preview.excluded.length && <details><summary className="cursor-pointer text-sm">Excluded transactions</summary><ul className="text-xs">{preview.excluded.map(e => <li key={e.id}>{e.title}: {e.reason}</li>)}</ul></details>}<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button><Button onClick={apply} loadingText="Applying mapping…">{error ? 'Unable to Save — Retry' : 'Confirm & Apply Mapping'}</Button></div></>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}