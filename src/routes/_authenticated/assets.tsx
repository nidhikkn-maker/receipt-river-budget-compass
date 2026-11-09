import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { fyOf } from "@/lib/entities";
import { PropertyPanel } from "@/components/books/PropertyPanel";
import { AssetLifecycle, DepreciationBooks } from "@/components/books/AssetBooks";
import { AssetCheck } from "@/components/books/AssetCheck";
import { Link } from "@tanstack/react-router";
import { DEFAULT_LIFE } from "@/lib/books/intake";
import { openSmartAdd } from "@/lib/smart-add-event";
import { assetFollowUps, ASSET_KINDS, TAX_RATES, bookSchedule, rentCheck, shareValue, taxSchedule, type Asset, type AssetKind } from "@/lib/assets";
import { Fold } from "@/components/Fold";
import { ArchiveDialog, type ArchiveRequest } from "@/components/ArchiveDialog";
import { archiveEventLine, archiveHistory, archiveInList, isArchived, restoreInList } from "@/lib/archive";

export const Route = createFileRoute("/_authenticated/assets")({
  head: () => ({ meta: [
    { title: "Things I own — property, vehicles & equipment · Thapal" },
    { name: "description", content: "Property ownership shares, fixed assets, rent received and book and income-tax depreciation by year." },
    { property: "og:title", content: "Things I own — property, vehicles & equipment · Thapal" },
    { property: "og:description", content: "Property ownership shares, fixed assets, rent received and book and income-tax depreciation by year." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Assets,
});

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const today = () => new Date().toISOString().slice(0, 10);
const blank = (): Asset => ({ id: crypto.randomUUID(), name: "", kind: "property", cost: 0, inUse: today(), sharePct: 100, bookMethod: "slm", bookRatePct: 0 });

function Assets() {
  const { preferences, savePreferences, transactions, documents, userId } = useStore();
  const list = preferences.assets ?? [];
  // Archived assets keep every figure: they stay in book value, depreciation and net worth (P0-001).
  const active = list.filter((a) => !isArchived(a));
  const archived = list.filter((a) => isArchived(a));
  const [archiveReq, setArchiveReq] = useState<ArchiveRequest | null>(null);
  const entities = preferences.entities ?? [];
  const [edit, setEdit] = useState<Asset | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const fy = fyOf(today());
  const months = useMemo(() => { const d = new Date(); return [0, 1, 2].map((i) => new Date(d.getFullYear(), d.getMonth() - i, 15).toISOString().slice(0, 7)); }, []);
  const income = useMemo(() => transactions.filter((t) => t.txnType === "income").map((t) => ({ date: t.date, amount: t.amount, text: `${t.title} ${t.merchant ?? ""} ${t.description}` })), [transactions]);
  const total = list.filter((a) => !a.soldOn).reduce((s, a) => s + shareValue(a, fy), 0);

  const valid = edit && edit.name.trim() && edit.cost > 0 && /^\d{4}-\d{2}-\d{2}$/.test(edit.inUse);
  const save = async () => {
    if (!edit || !valid) return;
    const next = list.some((x) => x.id === edit.id) ? list.map((x) => (x.id === edit.id ? edit : x)) : [...list, edit];
    await savePreferences({ ...preferences, assets: next }); toast.success("Asset saved"); setEdit(null);
  };
  // No delete: an asset is archived (status + who/when/why) and can be restored; nothing else in the record changes.
  const archiveOrRestore = async (req: ArchiveRequest, reason: string) => {
    setArchiveReq(null);
    const who = { by: userId, at: new Date().toISOString(), reason };
    try {
      const assets = req.mode === "archive" ? archiveInList(list, req.id, who) : restoreInList(list, req.id, who);
      await savePreferences({ ...preferences, assets });
      toast.success(req.mode === "archive" ? "Asset archived — figures unchanged" : "Asset restored");
      setEdit(null);
    } catch (e) { toast.error((e as Error).message || "Nothing was changed. Try again."); }
  };
  const num = (v: string) => Math.max(0, Number(v) || 0);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <PageTitle title="Property & assets" sub={`Your share of book value now: ${inr(total)} · FY ${fy}${archived.length ? ` · includes ${archived.length} archived` : ""}`} />
      <PropertyPanel />
      {!edit && <div className="flex flex-wrap gap-2"><Button onClick={() => openSmartAdd('assets')}>Add asset from invoice</Button><Button variant="outline" onClick={() => setEdit(blank())}>Add manually</Button><AssetCheck /></div>}

      {edit && (
        <div className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
          <Input placeholder="Name (e.g. Anna Nagar flat)" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <select className="w-full rounded-md border bg-background px-3 py-2" value={edit.kind} onChange={(e) => { const kind = e.target.value as AssetKind; setEdit({ ...edit, kind, bookRatePct: kind === "property" ? 0 : edit.bookRatePct || TAX_RATES[kind] }); }}>
            {Object.entries(ASSET_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <label>Cost ₹<Input type="number" value={edit.cost || ""} onChange={(e) => setEdit({ ...edit, cost: num(e.target.value) })} /></label>
            <label>Put to use<Input type="date" value={edit.inUse} onChange={(e) => setEdit({ ...edit, inUse: e.target.value })} /></label>
            <label>Your share %<Input type="number" value={edit.sharePct} onChange={(e) => setEdit({ ...edit, sharePct: Math.min(100, num(e.target.value)) })} /></label>
            <label>Owned by
              <select className="mt-0 w-full rounded-md border bg-background px-3 py-2" value={edit.ownerEntityId ?? ""} onChange={(e) => setEdit({ ...edit, ownerEntityId: e.target.value || undefined })}>
                <option value="">—</option>{entities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            {edit.kind !== "property" && <>
              <label>Book method
                <select className="w-full rounded-md border bg-background px-3 py-2" value={edit.bookMethod} onChange={(e) => setEdit({ ...edit, bookMethod: e.target.value as "slm" | "wdv" })}>
                  <option value="slm">Straight line</option><option value="wdv">Written down</option>
                </select>
              </label>
              <label>Book rate %<Input type="number" value={edit.bookRatePct} onChange={(e) => setEdit({ ...edit, bookRatePct: Math.min(100, num(e.target.value)) })} /></label>
              <label>Useful life (years)<Input type="number" placeholder={String(DEFAULT_LIFE[edit.kind])} value={edit.usefulLifeYears ?? ""} onChange={(e) => setEdit({ ...edit, usefulLifeYears: num(e.target.value) || undefined })} /></label>
              <label>Residual value %<Input type="number" value={edit.residualPct ?? ""} onChange={(e) => setEdit({ ...edit, residualPct: Math.min(100, num(e.target.value)) || undefined })} /></label>
              <label>Department<Input value={edit.department ?? ""} onChange={(e) => setEdit({ ...edit, department: e.target.value || undefined })} /></label>
              <label>Warranty until<Input type="date" value={edit.warrantyUntil ?? ""} onChange={(e) => setEdit({ ...edit, warrantyUntil: e.target.value || undefined })} /></label>
            </>}
            <label>Rent per month ₹<Input type="number" value={edit.monthlyRent ?? ""} onChange={(e) => setEdit({ ...edit, monthlyRent: num(e.target.value) || undefined })} /></label>
            <label>Asset tag / ID<Input value={edit.tag ?? ""} onChange={(e) => setEdit({ ...edit, tag: e.target.value || undefined })} /></label>
            <label>Location<Input value={edit.location ?? ""} onChange={(e) => setEdit({ ...edit, location: e.target.value || undefined })} /></label>
            <label>Custodian<Input value={edit.custodian ?? ""} onChange={(e) => setEdit({ ...edit, custodian: e.target.value || undefined })} /></label>
            <label>Condition
              <select className="w-full rounded-md border bg-background px-3 py-2" value={edit.condition ?? "ok"} onChange={(e) => setEdit({ ...edit, condition: e.target.value as Asset["condition"] })}>
                <option value="ok">OK</option><option value="damaged">Damaged</option><option value="missing">Missing</option>
              </select>
            </label>
            {edit.monthlyRent ? <>
              <label>Tenant<Input value={edit.tenant ?? ""} onChange={(e) => setEdit({ ...edit, tenant: e.target.value || undefined })} /></label>
              <label>Lease ends<Input type="date" value={edit.leaseEnd ?? ""} onChange={(e) => setEdit({ ...edit, leaseEnd: e.target.value || undefined })} /></label>
              <label>Deposit held ₹<Input type="number" value={edit.deposit ?? ""} onChange={(e) => setEdit({ ...edit, deposit: num(e.target.value) || undefined })} /></label>
            </> : null}
            <label>Sold on<Input type="date" value={edit.soldOn ?? ""} onChange={(e) => setEdit({ ...edit, soldOn: e.target.value || undefined })} /></label>
            {edit.soldOn && <label>Sale value ₹<Input type="number" value={edit.saleValue ?? ""} onChange={(e) => setEdit({ ...edit, saleValue: num(e.target.value) || undefined })} /></label>}
          </div>
          <label className="block">Deed / invoice in DocuRepo
            <select className="w-full rounded-md border bg-background px-3 py-2" value={edit.docId ?? ""} onChange={(e) => setEdit({ ...edit, docId: e.target.value || undefined })}>
              <option value="">None</option>{documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={!valid}>Save</Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            {list.some((x) => x.id === edit.id && !isArchived(x)) && <Button variant="ghost" onClick={() => setArchiveReq({ mode: "archive", id: edit.id, name: edit.name, noun: "asset" })}>Archive</Button>}
          </div>
        </div>
      )}

      {list.length === 0 && !edit && <p className="text-sm text-muted-foreground">Add property deeds, vehicles, computers and other assets to see ownership and depreciation.</p>}
      {active.map((a) => {
        const book = bookSchedule(a, fy), tax = taxSchedule(a, fy), rent = rentCheck(a, income, months);
        const doc = documents.find((d) => d.id === a.docId);
        return (
          <div key={a.id} className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{a.name}{a.soldOn ? " (sold)" : ""}</p>
                <p className="text-xs text-muted-foreground">{ASSET_KINDS[a.kind]} · cost {inr(a.cost)} · {a.sharePct}% yours · now {inr(shareValue(a, fy))}{doc ? ` · ${doc.title}` : " · no deed/invoice linked"}</p>
              </div>
              <div className="flex gap-1">
                {a.kind !== "property" && !a.soldOn && <Button size="sm" variant="ghost" onClick={async () => { await savePreferences({ ...preferences, assets: list.map((x) => (x.id === a.id ? { ...x, lastVerified: today(), condition: "ok" as const } : x)) }); toast.success("Marked as checked today"); }}>Checked today</Button>}
                <Button size="sm" variant="outline" onClick={() => setEdit(a)}>Edit</Button>
              </div>
            </div>
            {(a.tag || a.location || a.custodian || a.tenant) && <p className="text-xs text-muted-foreground">{[a.tag && `Tag ${a.tag}`, a.location, a.custodian && `with ${a.custodian}`, a.department && `dept ${a.department}`, a.tenant && `Tenant ${a.tenant}${a.leaseEnd ? ` till ${a.leaseEnd}` : ""}${a.deposit ? ` · deposit ${inr(a.deposit)}` : ""}`].filter(Boolean).join(" · ")}</p>}
            {assetFollowUps(a, today()).length > 0 && <p className="text-xs text-destructive">{assetFollowUps(a, today()).join(" · ")}</p>}
            {rent.length > 0 && <div className="flex flex-wrap gap-1">{rent.map((m) => <span key={m.month} title={m.deposits ? `Deposit ${inr(m.deposits)} kept separate` : undefined} className={`rounded-full px-2 py-0.5 text-xs ${m.status === "paid" || m.status === "advance" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>{m.month}: {inr(m.received)} / {inr(m.expected)}{m.status === "advance" ? ` · ${inr(-m.balance)} ahead` : m.balance > 0 ? ` · ${inr(m.balance)} due` : ""}{m.deposits ? ` · deposit ${inr(m.deposits)}` : ""}</span>)}</div>}
            {a.kind !== "property" && <AssetLifecycle a={a} />}
            {(book.length > 0 || tax.length > 0) && <Button size="sm" variant="ghost" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? "Hide" : "Show"} depreciation</Button>}
            {open === a.id && (
              <table className="w-full text-xs">
                <thead><tr className="text-muted-foreground"><th className="text-left">FY</th><th className="text-right">Book</th><th className="text-right">Book value</th><th className="text-right">Tax ({TAX_RATES[a.kind]}%)</th><th className="text-right">Tax WDV</th></tr></thead>
                <tbody>{book.map((b, i) => <tr key={b.fy}><td>{b.fy}</td><td className="text-right">{inr(b.depreciation)}</td><td className="text-right">{inr(b.closing)}</td><td className="text-right">{tax[i] ? inr(tax[i]!.depreciation) : "—"}</td><td className="text-right">{tax[i] ? inr(tax[i]!.closing) : "—"}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        );
      })}
      <Fold id="archived-assets" title={`Archived assets (${archived.length})`} hint="Still counted in book value, depreciation and net worth">
        <div className="space-y-2 text-sm">
          {archived.length === 0 && <p className="text-xs text-muted-foreground">No archived assets. Archive keeps a record you no longer use; it never deletes it.</p>}
          {archived.map((a) => {
            const book = bookSchedule(a, fy), tax = taxSchedule(a, fy);
            const doc = documents.find((d) => d.id === a.docId);
            const history = archiveHistory(a);
            const current = history.filter((e) => e.action === "archived").at(-1);
            return (
              <div key={a.id} className="space-y-2 rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{a.name}{a.soldOn ? " (sold)" : ""} <span className="ml-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-normal text-secondary-foreground">Archived</span></p>
                    <p className="text-xs text-muted-foreground">{ASSET_KINDS[a.kind]} · cost {inr(a.cost)} · {a.sharePct}% yours · now {inr(shareValue(a, fy))}{doc ? ` · ${doc.title}` : " · no deed/invoice linked"}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setArchiveReq({ mode: "restore", id: a.id, name: a.name, noun: "asset" })}>Restore</Button>
                </div>
                {current && <p className="text-xs">{archiveEventLine(current, userId)} · Reason: {a.archiveReason ?? current.reason}</p>}
                <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Archive history ({history.length})</summary>
                  <ul className="mt-1 space-y-0.5">{history.map((e, i) => <li key={`${e.at}-${i}`}>{archiveEventLine(e, userId)} · {e.reason}</li>)}</ul>
                </details>
                {(book.length > 0 || tax.length > 0) && <Button size="sm" variant="ghost" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? "Hide" : "Show"} depreciation</Button>}
                {open === a.id && (
                  <table className="w-full text-xs">
                    <thead><tr className="text-muted-foreground"><th className="text-left">FY</th><th className="text-right">Book</th><th className="text-right">Book value</th><th className="text-right">Tax ({TAX_RATES[a.kind]}%)</th><th className="text-right">Tax WDV</th></tr></thead>
                    <tbody>{book.map((b, i) => <tr key={b.fy}><td>{b.fy}</td><td className="text-right">{inr(b.depreciation)}</td><td className="text-right">{inr(b.closing)}</td><td className="text-right">{tax[i] ? inr(tax[i]!.depreciation) : "—"}</td><td className="text-right">{tax[i] ? inr(tax[i]!.closing) : "—"}</td></tr>)}</tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      </Fold>
      <ArchiveDialog request={archiveReq} onCancel={() => setArchiveReq(null)} onConfirm={(reason) => { if (archiveReq) void archiveOrRestore(archiveReq, reason); }} />
      <DepreciationBooks />
      <p className="text-xs text-muted-foreground">Tax figures use standard block rates as a guide; confirm with your accountant before filing.</p>
    </div>
  );
}
