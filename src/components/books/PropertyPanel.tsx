/** Property management (v6 §35–41): Owner → Property → Building → Floor → Unit, leases, tenant ledger, costs, occupancy. */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Fold } from "@/components/Fold";
import { useStore } from "@/lib/store";
import { allocateReceipts, allUnits, costSummary, leaseAlerts, nextEscalation, occupancy, propertyFollowUps, propertyValue, rentFor, tenantLedger } from "@/lib/books/property";
import { shareValue } from "@/lib/assets";
import { fyOf, fyRange } from "@/lib/entities";
import { leaseUnknowns, type Lease, type Property, type PropertyCostKind } from "@/lib/books/types";
import { useBooks } from "./useBooks";

const optNum = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));
const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const today = () => new Date().toISOString().slice(0, 10);
const COST: Record<PropertyCostKind, string> = { maintenance: "Maintenance", utility: "Utilities", propertyTax: "Property tax", insurance: "Insurance", improvement: "Capital improvement", vendor: "Vendor", other: "Other" };

export function PropertyPanel() {
  const { books, save, preferences } = useBooks();
  const { transactions, accounts, loans, documents } = useStore();
  const entities = preferences.entities ?? [];
  const assets = preferences.assets ?? [];
  const [newName, setNewName] = useState("");
  const [lease, setLease] = useState<Lease | null>(null);
  const [cost, setCost] = useState<Record<string, { kind: PropertyCostKind; vendor: string; amount: string; date: string }>>({});
  const months = useMemo(() => [5, 4, 3, 2, 1, 0].map((i) => { const d = new Date(); d.setDate(15); d.setMonth(d.getMonth() - i); return d.toISOString().slice(0, 7); }), []);
  // Every credit is a candidate (not only entries already tagged income), so a deposit misfiled as income is still kept apart [§39].
  const income = useMemo(() => transactions.filter((t) => ["income", "transfer", "reimbursement"].includes(t.txnType ?? "expense")).map((t) => ({ id: t.id, date: t.date, amount: t.amount, text: `${t.title} ${t.merchant ?? ""} ${t.description}`, accountId: t.txnType === "transfer" ? t.toAccountId : t.accountId, ...(t.currency ? { currency: t.currency } : {}) })), [transactions]);
  const alloc = useMemo(() => allocateReceipts(books.leases, books.properties, income), [books.leases, books.properties, income]);
  const allLeases = { leases: books.leases, properties: books.properties };
  const occ = occupancy(books.properties, books.leases, today());
  const fy = fyOf(today()); const { start, end } = fyRange(fy);
  const upd = (p: Property) => save({ properties: books.properties.map((x) => (x.id === p.id ? p : x)) });

  return (
    <Fold id="property" title="Property management" hint={`${books.properties.length} properties · ${books.leases.length} leases`} defaultOpen={books.properties.length > 0}>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Link to="/statements" search={{ context: "property" }} className="rounded-md border px-3 py-2 font-semibold text-primary">Add property from deed</Link>
          <Link to="/statements" search={{ context: "property" }} className="rounded-md border px-3 py-2 text-primary">Upload lease, tax or utility bill</Link>
        </div>
        <div className="flex gap-2"><Input aria-label="New property name" placeholder="Or type a property name" value={newName} onChange={(e) => setNewName(e.target.value)} /><Button variant="outline" disabled={!newName.trim()} onClick={async () => { await save({ properties: [...books.properties, { id: crypto.randomUUID(), name: newName.trim(), address: "", buildings: [], docIds: [] }] }); setNewName(""); }}>Add</Button></div>
        {alloc.ambiguous.length > 0 && <p className="text-xs text-destructive">{alloc.ambiguous.length} receipt(s) fit more than one lease equally and are left unallocated — add the rent account to each lease to separate them.</p>}
        {books.properties.map((p) => {
          const asset = assets.find((a) => a.id === p.assetId);
          const val = propertyValue(p, asset ? shareValue(asset, fy) : null);
          const o = occ.find((x) => x.propertyId === p.id);
          const cs = costSummary(books.propertyCosts, p.id, start, end);
          const leases = books.leases.filter((l) => l.propertyId === p.id);
          const units = allUnits(p);
          const ledgers = Object.fromEntries(leases.map((l) => [l.id, tenantLedger(l, p, income, months, allLeases)]));
          const follow = propertyFollowUps(p, books.leases, books.propertyCosts, ledgers, today());
          const links = p.links ?? {};
          return <div key={p.id} className="space-y-2 rounded-xl border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="font-semibold">{p.name}</p><p className="text-xs text-muted-foreground">{entities.find((e) => e.id === p.ownerEntityId)?.name ?? "Owner not set"} · {val.value == null ? "no valuation" : `${inr(val.value)} (${val.source})`} · occupancy {o?.occupied}/{o?.total}</p>{p.address && <p className="text-xs text-muted-foreground">{p.address}</p>}</div>
              <select aria-label={`Owner of ${p.name}`} className="rounded-md border bg-background px-2 py-1 text-xs" value={p.ownerEntityId ?? ""} onChange={(e) => upd({ ...p, ownerEntityId: e.target.value || undefined })}><option value="">Owner…</option>{entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
            </div>
            <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Buildings, floors & units ({units.length})</summary>
              {p.buildings.map((b) => <div key={b.id} className="ml-2 mt-1"><b>{b.name}</b>{b.floors.map((f) => <div key={f.id} className="ml-3">{f.name}: {f.units.map((u) => u.name).join(", ") || "no units"}
                <Button size="sm" variant="ghost" className="h-6" onClick={() => { const n = window.prompt("Unit name (e.g. 2A)"); if (n) void upd({ ...p, buildings: p.buildings.map((x) => (x.id === b.id ? { ...x, floors: x.floors.map((y) => (y.id === f.id ? { ...y, units: [...y.units, { id: crypto.randomUUID(), name: n }] } : y)) } : x)) }); }}>+ unit</Button></div>)}
                <Button size="sm" variant="ghost" className="h-6" onClick={() => { const n = window.prompt("Floor name (e.g. Ground)"); if (n) void upd({ ...p, buildings: p.buildings.map((x) => (x.id === b.id ? { ...x, floors: [...x.floors, { id: crypto.randomUUID(), name: n, units: [] }] } : x)) }); }}>+ floor</Button></div>)}
              <Button size="sm" variant="ghost" className="h-6" onClick={() => { const n = window.prompt("Building name"); if (n) void upd({ ...p, buildings: [...p.buildings, { id: crypto.randomUUID(), name: n, floors: [] }] }); }}>+ building</Button>
              <label className="mt-1 block">Linked asset (cost & depreciation live there)<select className="w-full rounded-md border bg-background px-1 py-1" value={p.assetId ?? ""} onChange={(e) => upd({ ...p, assetId: e.target.value || undefined })}><option value="">None</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
              <div className="mt-1 grid grid-cols-2 gap-1">
                <label>Property loan<select className="w-full rounded-md border bg-background px-1 py-1" value={links.loanId ?? ""} onChange={(e) => upd({ ...p, links: { ...links, loanId: e.target.value || undefined } })}><option value="">None</option>{loans.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
                <label>Deposits held in<select className="w-full rounded-md border bg-background px-1 py-1" value={links.depositAccountId ?? ""} onChange={(e) => upd({ ...p, links: { ...links, depositAccountId: e.target.value || undefined } })}><option value="">Not set</option>{accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
                <label className="col-span-2">Insurance & tax documents<select multiple className="h-20 w-full rounded-md border bg-background px-1 py-1" value={[...(links.insuranceDocIds ?? []), ...(links.taxDocIds ?? [])]} onChange={(e) => { const ids = [...e.target.selectedOptions].map((o) => o.value); upd({ ...p, links: { ...links, insuranceDocIds: ids.filter((id) => documents.find((d) => d.id === id)?.docType === "insurance"), taxDocIds: ids.filter((id) => documents.find((d) => d.id === id)?.docType !== "insurance") } }); }}>{documents.filter((d) => ["insurance", "tax_return", "utility_bill", "bill", "property_deed", "other"].includes(d.docType)).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
                <Input aria-label="Property GSTIN" className="h-8" placeholder="GSTIN for rent (if any)" defaultValue={links.gstin ?? ""} onBlur={(e) => { const g = e.target.value.trim().toUpperCase(); if (g !== (links.gstin ?? "")) void upd({ ...p, links: { ...links, gstin: g || undefined } }); }} />
              </div>
              {p.notes && <p className="mt-1 text-muted-foreground">{p.notes}</p>}
              <div className="mt-1 flex gap-1"><Input aria-label="Valuation" className="h-8" type="number" placeholder="Latest valuation ₹" onBlur={(e) => { const v = Number(e.target.value); if (v > 0) void upd({ ...p, valuation: { value: v, date: today(), source: "entered by you" } }); }} /></div>
            </details>
            {follow.length > 0 && <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">{follow.slice(0, 8).map((f) => <li key={f}>{f}</li>)}</ul>}
            {leases.map((l) => { const led = ledgers[l.id] ?? []; const unknown = leaseUnknowns(l); const esc = nextEscalation(l, today()); const al = leaseAlerts(l, today()); const unit = units.find((u) => u.id === l.unitId); return <div key={l.id} className="rounded-lg bg-secondary/50 p-2 text-xs">
              <p className="font-semibold">{l.tenant}{unit ? ` · ${unit.building} ${unit.floor} ${unit.name}` : ""} · {inr(rentFor(l, today().slice(0, 7)) || l.rent)}/month · deposit {l.deposit == null ? "not stated" : inr(l.deposit)}</p>
              <p className="text-muted-foreground">{l.start} → {l.end} · due day {l.dueDay ?? "?"} · notice {l.noticeDays == null ? "?" : `${l.noticeDays} days`}{esc ? ` · rises to ${inr(esc.rent)} on ${esc.date}` : ""}{l.gst ? " · GST on rent" : ""}</p>
              {unknown.length > 0 && <p className="text-destructive">Needs answer: {unknown.join(", ")} — not printed on the lease. <button className="underline" onClick={() => setLease(l)}>Answer</button></p>}
              {al.length > 0 && <p className="text-destructive">{al.join(" · ")}</p>}
              <div className="mt-1 flex flex-wrap gap-1">{led.filter((r) => r.status !== "none").map((r) => <span key={r.month} className={`rounded-full px-2 py-0.5 ${r.status === "paid" || r.status === "advance" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>{r.month}: {inr(r.rent)}/{inr(r.due)}{r.balance > 0 ? ` · ${inr(r.balance)} due` : r.balance < 0 ? ` · ${inr(-r.balance)} ahead` : ""}{r.deposit ? ` · deposit ${inr(r.deposit)}` : ""}</span>)}</div>
              <div className="mt-1 flex gap-1"><Button size="sm" variant="ghost" className="h-6" onClick={() => setLease(l)}>Edit</Button><Button size="sm" variant="ghost" className="h-6" onClick={() => { const d = window.prompt("Renew until (YYYY-MM-DD)", l.end); if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d > l.end) void save({ leases: books.leases.map((x) => (x.id === l.id ? { ...x, end: d } : x)) }); }}>Renew</Button></div>
            </div>; })}
            <Button size="sm" variant="outline" onClick={() => setLease({ id: crypto.randomUUID(), propertyId: p.id, tenant: "", start: today(), end: today(), rent: 0, paymentTerms: "" })}>Add tenant manually</Button>
            <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Costs FY {fy}: running {inr(cs.running)} · improvements {inr(cs.capital)}</summary>
              {Object.entries(cs.byKind).map(([k, v]) => <p key={k}>{COST[k as PropertyCostKind]}: {inr(v)}</p>)}
              {(() => { const c = cost[p.id] ?? { kind: "maintenance" as PropertyCostKind, vendor: "", amount: "", date: today() }; return <div className="mt-1 grid grid-cols-2 gap-1">
                <select aria-label="Cost type" className="rounded-md border bg-background px-1" value={c.kind} onChange={(e) => setCost({ ...cost, [p.id]: { ...c, kind: e.target.value as PropertyCostKind } })}>{Object.entries(COST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <Input aria-label="Vendor" className="h-8" placeholder="Vendor" value={c.vendor} onChange={(e) => setCost({ ...cost, [p.id]: { ...c, vendor: e.target.value } })} />
                <Input aria-label="Cost amount" className="h-8" type="number" placeholder="Amount" value={c.amount} onChange={(e) => setCost({ ...cost, [p.id]: { ...c, amount: e.target.value } })} />
                <Input aria-label="Cost date" className="h-8" type="date" value={c.date} onChange={(e) => setCost({ ...cost, [p.id]: { ...c, date: e.target.value } })} />
                <Button size="sm" variant="outline" className="col-span-2" disabled={!(Number(c.amount) > 0)} onClick={async () => { await save({ propertyCosts: [...books.propertyCosts, { id: crypto.randomUUID(), propertyId: p.id, date: c.date, kind: c.kind, vendor: c.vendor, amount: Number(c.amount) }] }); setCost({ ...cost, [p.id]: { ...c, amount: "", vendor: "" } }); }}>Record cost</Button></div>; })()}
              <p className="mt-1 text-muted-foreground">These are a property register; the payment itself stays the ledger entry so nothing is counted twice.</p>
            </details>
          </div>;
        })}
        {lease && <div className="grid grid-cols-2 gap-2 rounded-xl border p-3 text-xs">
          <p className="col-span-2 font-semibold">Lease</p>
          <Input aria-label="Tenant" className="col-span-2" placeholder="Tenant" value={lease.tenant} onChange={(e) => setLease({ ...lease, tenant: e.target.value })} />
          <label>Start<Input type="date" value={lease.start} onChange={(e) => setLease({ ...lease, start: e.target.value })} /></label>
          <label>End<Input type="date" value={lease.end} onChange={(e) => setLease({ ...lease, end: e.target.value })} /></label>
          <label>Monthly rent<Input type="number" value={lease.rent || ""} onChange={(e) => setLease({ ...lease, rent: Number(e.target.value) || 0 })} /></label>
          <label>Deposit<Input type="number" value={lease.deposit ?? ""} onChange={(e) => setLease({ ...lease, deposit: optNum(e.target.value) })} /></label>
          <label>Escalation %<Input type="number" value={lease.escalationPct ?? ""} onChange={(e) => setLease({ ...lease, escalationPct: optNum(e.target.value) })} /></label>
          <label>Every (months)<Input type="number" value={lease.escalationEveryMonths ?? ""} onChange={(e) => setLease({ ...lease, escalationEveryMonths: optNum(e.target.value) })} /></label>
          <label>Due day<Input type="number" value={lease.dueDay ?? ""} onChange={(e) => { const n = optNum(e.target.value); setLease({ ...lease, dueDay: n == null ? undefined : Math.min(31, Math.max(1, n)) }); }} /></label>
          <label>Notice days<Input type="number" value={lease.noticeDays ?? ""} onChange={(e) => setLease({ ...lease, noticeDays: optNum(e.target.value) })} /></label>
          <label>GST on rent<select className="w-full rounded-md border bg-background px-1 py-1" value={lease.gst == null ? "" : lease.gst ? "yes" : "no"} onChange={(e) => setLease({ ...lease, gst: e.target.value === "" ? undefined : e.target.value === "yes" })}><option value="">Not stated</option><option value="yes">Yes</option><option value="no">No</option></select></label>
          <label>Rent paid into<select className="w-full rounded-md border bg-background px-1 py-1" value={lease.accountId ?? ""} onChange={(e) => setLease({ ...lease, accountId: e.target.value || undefined })}><option value="">Any account</option>{accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label className="col-span-2">Unit<select className="w-full rounded-md border bg-background px-1 py-1" value={lease.unitId ?? ""} onChange={(e) => setLease({ ...lease, unitId: e.target.value || undefined })}><option value="">Whole property</option>{allUnits(books.properties.find((x) => x.id === lease.propertyId) ?? { buildings: [] } as unknown as Property).map((u) => <option key={u.id} value={u.id}>{u.building} {u.floor} {u.name}</option>)}</select></label>
          <div className="col-span-2 flex gap-2"><Button size="sm" disabled={!lease.tenant.trim() || !(lease.rent > 0) || lease.end < lease.start} onClick={async () => { await save({ leases: books.leases.some((x) => x.id === lease.id) ? books.leases.map((x) => (x.id === lease.id ? lease : x)) : [...books.leases, lease] }); setLease(null); toast.success("Lease saved"); }}>Save lease</Button><Button size="sm" variant="ghost" onClick={() => setLease(null)}>Cancel</Button></div>
        </div>}
      </div>
    </Fold>
  );
}
