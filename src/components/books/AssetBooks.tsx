/** Asset lifecycle, QR labels and the full depreciation engine (v6 §28–34). */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Fold } from "@/components/Fold";
import { ASSET_KINDS, type Asset } from "@/lib/assets";
import { fyOf } from "@/lib/entities";
import { annualBook, blockSchedule, bookVsTax, monthlyBook, postJournals, prepareJournals } from "@/lib/books/depreciation";
import type { AssetEventKind } from "@/lib/books/types";
import { useBooks } from "./useBooks";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const today = () => new Date().toISOString().slice(0, 10);
const EVENT: Record<AssetEventKind, string> = { received: "Received", capitalised: "Capitalised", location: "Moved location", custodian: "New custodian", maintenance: "Maintenance", transfer: "Transferred", verified: "Physically verified", impairment: "Impairment", revaluation: "Revaluation", disposal: "Disposed" };

/** QR label encoding the asset tag and id, for printing and stick-on verification. */
export function AssetQr({ a }: { a: Asset }) {
  const [svg, setSvg] = useState("");
  useEffect(() => { let live = true; import("qrcode").then((q) => q.toString(`LEDGERLINE-ASSET:${a.tag || a.id}`, { type: "svg", margin: 1, width: 120 })).then((s) => { if (live) setSvg(s); }).catch(() => undefined); return () => { live = false; }; }, [a.id, a.tag]);
  if (!svg) return null;
  return <figure className="inline-block rounded-lg border bg-background p-1 text-center text-[10px]"><span className="block size-24 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} /><figcaption>{a.tag || a.id.slice(0, 8)}</figcaption></figure>;
}

export function AssetLifecycle({ a }: { a: Asset }) {
  const { books, save } = useBooks();
  const [kind, setKind] = useState<AssetEventKind>("maintenance");
  const [note, setNote] = useState("");
  const events = books.assetEvents.filter((e) => e.assetId === a.id).sort((x, y) => y.date.localeCompare(x.date));
  const months = monthlyBook(a, today().slice(0, 7)).slice(-12);
  return (
    <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Lifecycle, label & monthly depreciation ({events.length} events)</summary>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        <AssetQr a={a} />
        <div className="min-w-0 flex-1 space-y-1">
          {events.map((e) => <p key={e.id}>{e.date} · {EVENT[e.kind]}{e.value ? ` · ${inr(e.value)}` : ""}{e.note ? ` · ${e.note}` : ""}</p>)}
          <div className="flex flex-wrap gap-1"><select aria-label="Event" className="rounded-md border bg-background px-1" value={kind} onChange={(e) => setKind(e.target.value as AssetEventKind)}>{Object.entries(EVENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input aria-label="Event note" className="min-w-0 flex-1 rounded-md border bg-background px-2" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button size="sm" variant="outline" className="h-7" onClick={async () => { await save({ assetEvents: [...books.assetEvents, { id: crypto.randomUUID(), assetId: a.id, date: today(), kind, note }] }); setNote(""); toast.success("Recorded"); }}>Add</Button></div>
          <p className="text-muted-foreground">Disposal, revaluation and impairment are recorded here; set "Sold on" and sale value on the asset to stop depreciation.</p>
        </div>
      </div>
      {months.length > 0 && <table className="mt-2 w-full"><thead><tr className="text-muted-foreground"><th className="text-left">Month</th><th className="text-right">Depreciation</th><th className="text-right">Accumulated</th><th className="text-right">Net book value</th></tr></thead>
        <tbody>{months.map((m) => <tr key={m.month}><td>{m.month}</td><td className="text-right">{inr(m.depreciation)}</td><td className="text-right">{inr(m.accumulated)}</td><td className="text-right">{inr(m.nbv)}</td></tr>)}</tbody></table>}
    </details>
  );
}

export function DepreciationBooks() {
  const { books, save, preferences } = useBooks();
  const assets = (preferences.assets ?? []).filter((a) => a.kind !== "property");
  const fy = fyOf(today());
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); });
  const blocks = blockSchedule(assets, fy);
  const vs = bookVsTax(assets, fy);
  const prepared = books.journals.filter((j) => j.status === "prepared");
  return (
    <Fold id="depreciation" title="Depreciation books" hint={`FY ${fy} · ${prepared.length} journal${prepared.length === 1 ? "" : "s"} waiting to post`}>
      <div className="space-y-3 text-xs">
        <p className="font-semibold">Income-tax blocks (WDV)</p>
        <table className="w-full"><thead><tr className="text-muted-foreground"><th className="text-left">Block</th><th className="text-right">Opening</th><th className="text-right">Additions</th><th className="text-right">Disposals</th><th className="text-right">Depreciation</th><th className="text-right">Closing</th></tr></thead>
          <tbody>{blocks.map((b) => <tr key={b.kind}><td>{ASSET_KINDS[b.kind]} {b.rate}%</td><td className="text-right">{inr(b.opening)}</td><td className="text-right">{inr(b.additionsFull + b.additionsHalf)}{b.additionsHalf ? "*" : ""}</td><td className="text-right">{inr(b.disposals)}</td><td className="text-right">{inr(b.depreciation)}</td><td className="text-right">{inr(b.closing)}</td></tr>)}</tbody></table>
        <p className="text-muted-foreground">* used under 180 days in the year — half rate.</p>
        <p className="font-semibold">Book vs tax · FY {fy}</p>
        <table className="w-full"><thead><tr className="text-muted-foreground"><th className="text-left">Asset</th><th className="text-right">Book</th><th className="text-right">Tax</th><th className="text-right">Difference</th><th className="text-right">Net book value</th></tr></thead>
          <tbody>{vs.map((v) => { const a = assets.find((x) => x.id === v.assetId)!; return <tr key={v.assetId}><td>{v.name}</td><td className="text-right">{inr(v.book)}</td><td className="text-right">{inr(v.tax)}</td><td className="text-right">{inr(v.difference)}</td><td className="text-right">{inr(annualBook(a, fy).nbv)}</td></tr>; })}</tbody></table>
        <div className="flex flex-wrap items-end gap-2">
          <label>Month<input type="month" className="block rounded-md border bg-background px-2 py-1" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
          <Button size="sm" variant="outline" onClick={async () => { const r = prepareJournals(assets, month, books.journals, books.closedPeriods, () => crypto.randomUUID()); if (r.exceptions.length) toast.message(r.exceptions.join(" · ")); if (r.journals.length) { await save({ journals: [...books.journals, ...r.journals] }); toast.success(`${r.journals.length} journal${r.journals.length > 1 ? "s" : ""} prepared`); } else if (!r.exceptions.length) toast.message("Nothing new to prepare for this month"); }}>Prepare depreciation</Button>
          {prepared.length > 0 && <Button size="sm" onClick={async () => { try { await save({ journals: postJournals(books.journals, prepared.map((j) => j.id), books.closedPeriods, today()) }); toast.success("Depreciation posted to the asset books"); } catch (e) { toast.error((e as Error).message); } }}>Approve & post {prepared.length}</Button>}
        </div>
        {prepared.map((j) => <p key={j.id}>{j.period} · {assets.find((a) => a.id === j.assetId)?.name} · {inr(j.amount)} — Dr Depreciation / Cr Accumulated depreciation</p>)}
        <p className="text-muted-foreground">Posted journals update the asset books only; they are non-cash and never create bank entries. Closed periods are refused.</p>
      </div>
    </Fold>
  );
}
