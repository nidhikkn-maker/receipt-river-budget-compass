import { useState } from 'react';
import { useStore } from '@/lib/store';
import type { FinancialReview } from '@/lib/financial-review';
import { mappingPreview, mappingStillCurrent, type ReviewMappingAction, type ReviewMappingPreview } from '@/lib/review-mapping';
import type { TravelTrip } from '@/lib/travel';
import { money } from '@/lib/expenses';
import { Button } from './ui/button';
import { Link } from '@tanstack/react-router';
import { metadataPreview, metadataStillCurrent, type MetadataPreview } from '@/lib/review-metadata';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

export function ReviewMappingPanel({ rows, onSaved }: { rows: FinancialReview[]; onSaved: (excluded: string[]) => void }) {
  const store = useStore();
  const [action, setAction] = useState<ReviewMappingAction>('activity');
  const [value, setValue] = useState(''), [tripId, setTripId] = useState('');
  const [preview, setPreview] = useState<ReviewMappingPreview | null>(null), [error, setError] = useState('');
  const [orgPreview, setOrgPreview] = useState<MetadataPreview | null>(null), [opId, setOpId] = useState('');
  const NO_TRIP = '__none__';
  const trips = (store.preferences.trips as TravelTrip[]).filter(t => !t.closedAt && !t.cancelledAt);
  const options = store.preferences.tags.filter(t => action === 'organisation' ? t.group === 'Organisation' : ['Project','Event','Purpose','Client'].includes(t.group));
  const prepare = () => { try {
    if (action === 'organisation' && (!tripId || tripId === NO_TRIP)) { if (!value) throw Error('Choose an organisation.'); const p = metadataPreview(rows, new Map(rows.map(r => [r.transaction.id, { organisation: value }])), store.preferences, store.accounts); setOrgPreview(p); setOpId(crypto.randomUUID()); setError(''); return; } setPreview(mappingPreview(rows, action, value, tripId, store.preferences)); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to prepare mapping'); } };
  const apply = async () => {
    if (!preview) return;
    try {
      if (!mappingStillCurrent(preview, store.transactions, store.preferences)) throw Error('Records or configuration changed. Prepare a new preview.');
      await store.applyReviewMapping(preview);
      onSaved(preview.excluded.map(e => e.id)); setPreview(null); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save mapping'); }
  };
  const applyOrg = async () => {
    if (!orgPreview) return;
    try {
      if (!metadataStillCurrent(orgPreview, store.transactions, store.preferences, store.accounts)) throw Error('Records or configuration changed. Prepare a new preview.');
      await store.applyReviewMetadata(orgPreview, opId);
      onSaved(orgPreview.excluded.map(e => e.id)); setOrgPreview(null); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save mapping'); }
  };
  if (orgPreview) return <div className="space-y-3"><h3 className="font-semibold">Confirm organisation</h3><p className="text-sm">{orgPreview.selected} selected · {orgPreview.records.length} included · {orgPreview.excluded.length} excluded</p><p className="text-sm">{value}</p><p className="text-xs text-muted-foreground">Amounts, accounts, currency rates and claims remain unchanged. You can undo this from mapping history.</p><ul className="max-h-64 divide-y overflow-y-auto text-sm">{orgPreview.records.map(e => <li key={e.id} className="py-2"><p>{e.title} · {money(e.amount)}</p><p className="text-xs text-muted-foreground">{e.department || 'Unknown organisation'} → {value}</p></li>)}</ul>{!!orgPreview.excluded.length && <details><summary className="cursor-pointer text-sm">Excluded transactions</summary><ul className="text-xs">{orgPreview.excluded.map(e => <li key={e.id}>{e.title}: {e.reason}</li>)}</ul></details>}<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setOrgPreview(null)}>Cancel</Button><Button onClick={applyOrg} loadingText="Applying…">{error ? 'Unable to Save — Retry' : 'Confirm & Apply Organisation'}</Button></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>;
  return <div className="space-y-3">
    {action === 'organisation' && !preview && <p className="text-xs text-muted-foreground">Trip is optional. Leave it as “No trip” to assign the organisation only. Split responsibility and active claims require individual review.</p>}
    {!preview ? <><Select value={action} onValueChange={v => { setAction(v as ReviewMappingAction); setValue(''); }}><SelectTrigger aria-label="Mapping action"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="activity">Link project or activity</SelectItem><SelectItem value="trip">Link trip</SelectItem><SelectItem value="organisation">Assign organisation (trip optional)</SelectItem></SelectContent></Select>
    {action !== 'activity' && <Select value={tripId} onValueChange={setTripId}><SelectTrigger aria-label="Mapping trip"><SelectValue placeholder={action === 'organisation' ? 'No trip (optional)' : 'Choose open trip'} /></SelectTrigger><SelectContent>{action === 'organisation' && <SelectItem value={NO_TRIP}>No trip — organisation only</SelectItem>}{trips.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>}
    {action !== 'trip' && <Select value={value} onValueChange={setValue}><SelectTrigger aria-label="Mapping value"><SelectValue placeholder={action === 'organisation' ? 'Configured organisation' : 'Configured activity'} /></SelectTrigger><SelectContent>{options.map(t => <SelectItem key={`${t.group}:${t.name}`} value={action === 'organisation' ? t.name : `${t.group}: ${t.name}`}>{t.name}</SelectItem>)}</SelectContent></Select>}
    {!options.length && action !== 'trip' && <p className="text-xs text-muted-foreground">No {action === 'organisation' ? 'organisations' : 'activities'} set up yet.</p>}
    <div className="flex flex-wrap gap-3 text-xs"><Link to="/trips" className="text-primary underline">+ Create a trip</Link><Link to="/settings" className="text-primary underline">+ Add an organisation or activity</Link></div>
    <Button onClick={prepare}>Preview mapping</Button></> : <><h3 className="font-semibold">Confirm mapping</h3><p className="text-sm">{preview.selected} selected · {preview.records.length} included · {preview.excluded.length} excluded</p><p className="text-sm">{preview.value}</p><p className="text-xs text-muted-foreground">Amounts, account ownership, payment sources, currency rates and claims remain unchanged. Organisation and activity reports may change. Other issues remain under review.</p><ul className="max-h-64 divide-y overflow-y-auto text-sm">{preview.records.map(e => <li key={e.id} className="py-2"><p>{e.title} · {money(e.amount)}</p><p className="text-xs text-muted-foreground">{preview.action === 'organisation' ? e.department || 'Unknown organisation' : (e.tags ?? []).join(', ') || 'No activity'} → {preview.value}</p></li>)}</ul>{!!preview.excluded.length && <details><summary className="cursor-pointer text-sm">Excluded transactions</summary><ul className="text-xs">{preview.excluded.map(e => <li key={e.id}>{e.title}: {e.reason}</li>)}</ul></details>}<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button><Button onClick={apply} loadingText="Applying mapping…">{error ? 'Unable to Save — Retry' : 'Confirm & Apply Mapping'}</Button></div></>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}