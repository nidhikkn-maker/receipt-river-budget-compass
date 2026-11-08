import { useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { receiptAsset } from '@/lib/receipt-handoff';
import { ASSET_KINDS, type AssetKind } from '@/lib/assets';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function ReceiptAssetHandoff({ entryId }: { entryId: string }) {
  const { transactions, documents, preferences, savePreferences } = useStore();
  const entry = transactions.find(e => e.id === entryId);
  const id = useRef(crypto.randomUUID()).current;
  const [kind, setKind] = useState<AssetKind>('other');
  const [name, setName] = useState(entry?.title ?? '');
  const [date, setDate] = useState(entry?.date ?? '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const existing = (preferences.assets ?? []).find(a => a.transactionId === entryId || a.paymentId === entryId);
  if (!entry) return <p role="status">Refreshing the saved purchase — reopen this step once it appears in Activity.</p>;
  return <section aria-label="Asset from saved purchase" className="space-y-3 text-left">
    <h3 className="font-semibold">Something I own</h3>
    <p className="text-sm text-muted-foreground">The saved payment and its original bill stay linked. This does not make another payment.</p>
    {existing || saved ? <p role="status">Already linked to Things I own.</p> : <>
      <label className="block text-sm">Asset name<Input value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="block text-sm">Kind<select className="h-11 w-full rounded-md border bg-background px-2" value={kind} onChange={e => setKind(e.target.value as AssetKind)}>{Object.entries(ASSET_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="block text-sm">Put to use<Input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button disabled={!name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)} onClick={async () => {
        try {
          setError('');
          const asset = receiptAsset(entry, preferences.assets ?? [], documents, id, kind);
          const next = { ...asset, name: name.trim(), inUse: date };
          await savePreferences({ ...preferences, assets: [...(preferences.assets ?? []).filter(a => a.id !== asset.id), next] });
          setSaved(true);
        } catch (e) { setError(e instanceof Error ? e.message : 'Could not link the asset. Your details are kept.'); }
      }}>Link saved purchase to asset</Button>
    </>}
  </section>;
}