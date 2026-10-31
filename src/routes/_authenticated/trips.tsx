import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Bar as RBar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Plane, Trash2 } from "lucide-react";
import { PageTitle } from "@/components/AppShell";
import { Bar, Card, Row } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CURRENCIES, money } from "@/lib/expenses";
import { tripSummary, tripTag, type Trip } from "@/lib/intelligence";
import { downloadBlob, toCsv, toPdf } from "@/lib/reports";
import { useStore } from "@/lib/store";
import { TravelPanel } from "@/components/TravelPanel";
import { TRIP_TYPES, advanceDashboard, type TravelTrip, type TripType } from "@/lib/travel";
import { TRAVEL_CUTS, TRAVEL_CUT_LABEL, travelReport, type TravelCut } from "@/lib/travel-reports";
import { todayISO } from "@/lib/use-position";
import { PlanCalendar } from "@/components/PlanCalendar";

export const Route = createFileRoute("/_authenticated/trips")({
  validateSearch: (search: Record<string, unknown>): { trip?: string } => ({ trip: typeof search.trip === "string" ? search.trip : undefined }),
  head: () => ({
    meta: [
      { title: "Trips — travel spending · Ledgerline" },
      { name: "description", content: "Trip budgets, multi-currency spending with the exchange rate used, daily and category totals, and reimbursables." },
      { property: "og:title", content: "Trips · Ledgerline" },
      { property: "og:description", content: "Track every trip's spending in its original currency and INR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Trips,
});

function Trips() {
  const { preferences: pr, savePreferences, transactions, setTags, memberName, accounts } = useStore();
  const today = todayISO();
  const [cut, setCut] = useState<TravelCut>("trip");
  const [form, setForm] = useState({ name: "", destination: "", start: today, end: today, budget: 0, currencies: "INR", type: "personal" as TripType });
  const search = Route.useSearch();
  const [openId, setOpenId] = useState<string | null>(search.trip ?? pr.trips[0]?.id ?? null);
  const add = async () => {
    if (!form.name.trim()) { toast.error("Name the trip"); return; }
    if (!form.start || !form.end || !Number.isFinite(form.budget) || form.budget < 0) { toast.error("Choose dates and a non-negative budget"); return; }
    const currencies = form.currencies.split(",").map((c) => c.trim().toUpperCase());
    if (currencies.some((c) => !(CURRENCIES as readonly string[]).includes(c))) { toast.error("Enter supported currency codes"); return; }
    if (transactions.some((e) => (e.tags ?? []).some((tag) => tag.toLowerCase() === `Trip: ${form.name.trim()}`.toLowerCase())) && !pr.trips.some((t) => t.name.toLowerCase() === form.name.trim().toLowerCase())) { toast.error("This name is still attached to earlier entries; choose a new trip name"); return; }
    if (form.end < form.start) { toast.error("End date is before start date"); return; }
    if (pr.trips.some((t) => t.name.toLowerCase() === form.name.trim().toLowerCase())) { toast.error("A trip with this name exists"); return; }
    const t: TravelTrip = { type: form.type, travellers: [], bookings: [], itinerary: [], advances: [], id: crypto.randomUUID(), name: form.name.trim(), destination: form.destination, start: form.start, end: form.end, budget: form.budget, currencies: [...new Set(currencies)] };
    try { await savePreferences({ ...pr, trips: [t, ...pr.trips] }); setOpenId(t.id); void navigate({ search: { trip: t.id }, replace: true }); toast.success("Trip created"); } catch (e) { toast.error((e as Error).message); }
  };
  const trip = pr.trips.find((t) => t.id === (search.trip ?? openId));
  const dash = useMemo(() => advanceDashboard(pr.trips as TravelTrip[], transactions, today), [pr.trips, transactions, today]);
  const report = useMemo(() => travelReport(cut, pr.trips as TravelTrip[], transactions, { memberName, accountName: (id) => accounts.find((a) => a.id === id)?.name ?? "Unassigned" }), [cut, pr.trips, transactions, memberName, accounts]);
  const [dashFilter, setDashFilter] = useState<"all" | "open" | "overdue">("all");
  const dashRows = dash.rows.filter((r) => dashFilter === "all" || (dashFilter === "open" ? r.outstanding !== 0 : r.overdue));
  const navigate = Route.useNavigate();
  const openTrip = (id: string) => { setOpenId(id); void navigate({ search: { trip: id }, replace: true }); requestAnimationFrame(() => document.getElementById("trip-detail")?.scrollIntoView({ behavior: "smooth" })); };
  return (
    <div>
      <PageTitle eyebrow="Travel" title="Travel Manager" sub="Each entry keeps the exchange rate from its bill date. Changing today's rate never rewrites a trip." />
      <details className="mb-6 border-y py-3"><summary className="cursor-pointer font-display text-lg font-bold">Travel & payment calendar</summary><div className="mt-4"><PlanCalendar /></div></details>
      {dash.rows.length > 0 && (
        <Card title="Advance balances" className="mb-4">
          <p className="mb-2 text-xs text-muted-foreground">Outstanding advance money across trips — what you still hold to return, or what's still owed to you.</p>
          <div className="mb-2 flex flex-wrap gap-2">
            {([["all", `All ${dash.rows.length}`], ["open", `Unreconciled ${dash.rows.filter((r) => r.outstanding !== 0).length}`], ["overdue", `Overdue ${dash.rows.filter((r) => r.overdue).length}`]] as const).map(([k, label]) => (
              <Button key={k} size="sm" variant={dashFilter === k ? "default" : "outline"} aria-pressed={dashFilter === k} onClick={() => setDashFilter(k)}>{label}</Button>
            ))}
          </div>
          {dashRows.length === 0 && <p className="py-2 text-xs text-muted-foreground">{dashFilter === "overdue" ? "Nothing overdue — no balance has waited 30+ days after a trip ended." : "No unreconciled balances."}</p>}
          {dashRows.map((r) => (
            <div key={r.tripId} className="flex items-center gap-2 border-b py-2 text-sm last:border-0">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.name}{r.closed && <span className="ml-1 text-xs text-muted-foreground">(closed)</span>}</div>
                <div className="text-xs text-muted-foreground">advances {money(r.advances)} · spent {money(r.expenses)} · returned {money(r.returns)}</div>
                {r.aging !== "settled" && <div className={`text-xs ${r.overdue ? "font-medium text-destructive" : "text-muted-foreground"}`}>{r.aging === "current" ? (r.ageDays === 0 ? "trip ongoing or just ended" : `${r.ageDays} days since trip ended`) : `Overdue · ${r.ageDays} days since trip ended (${r.aging})`}</div>}
              </div>
              <span className={`shrink-0 font-mono text-sm ${r.outstanding > 0 ? "text-destructive" : r.outstanding < 0 ? "text-primary" : "text-muted-foreground"}`}>
                {r.outstanding > 0 ? `return ${money(r.outstanding)}` : r.outstanding < 0 ? `owed ${money(-r.outstanding)}` : "settled"}
              </span>
              <Button size="sm" variant="outline" onClick={() => openTrip(r.tripId)}>Reconcile</Button>
            </div>
          ))}
          <div className="mt-2 border-t pt-2">
            {dash.toReturn > 0 && <Row label="Total to return" value={money(dash.toReturn)} />}
            {dash.owedToYou > 0 && <Row label="Total still owed to you" value={money(dash.owedToYou)} />}
            {dash.toReturn === 0 && dash.owedToYou === 0 && <p className="text-xs text-muted-foreground">Every advance is fully reconciled.</p>}
          </div>
        </Card>
      )}
      {pr.trips.length > 0 && <div className="mb-4 flex gap-2 overflow-x-auto pb-1">{pr.trips.map((t) => <Button key={t.id} variant={t.id === trip?.id ? "default" : "outline"} onClick={() => openTrip(t.id)}><Plane className="mr-1 h-4 w-4" />{t.name}</Button>)}</div>}
      {trip && <div id="trip-detail"><TravelPanel key={trip.id} trip={trip as TravelTrip} /></div>}
      {trip && <TripView trip={trip} txns={transactions} setTags={setTags} onDelete={async () => { if (!confirm("Delete this trip? Entries stay, the trip label is kept on them.")) return; await savePreferences({ ...pr, trips: pr.trips.filter((x) => x.id !== trip.id) }); setOpenId(null); void navigate({ search: {}, replace: true }); }} />}
      {pr.trips.length > 0 && (
        <Card title="Travel reports" action={<div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => downloadBlob(new Blob([toCsv(report)], { type: "text/csv" }), `travel-${cut}.csv`)}>CSV</Button><Button size="sm" variant="outline" onClick={() => void toPdf(report, `All trips · generated ${today}`).then((b) => downloadBlob(b, `travel-${cut}.pdf`))}>PDF</Button></div>}>
          <p className="mb-2 text-xs text-muted-foreground">Every trip's spending, grouped the way you need. Amounts come straight from your records, so each report adds up to the same total.</p>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">{TRAVEL_CUTS.map((k) => <Button key={k} size="sm" variant={cut === k ? "default" : "outline"} onClick={() => setCut(k)}>{TRAVEL_CUT_LABEL[k]}</Button>)}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground">{report.headers.map((h) => <th key={h} className="whitespace-nowrap py-1 pr-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>{report.rows.slice(0, 14).map((r, i) => <tr key={i} className={`border-b last:border-0 ${String(r[0]).startsWith("Total") ? "font-semibold" : ""}`}>{r.map((c, j) => <td key={j} className={`whitespace-nowrap py-1.5 pr-3 ${j > 0 ? "text-right font-mono" : ""}`}>{c}</td>)}</tr>)}</tbody>
            </table>
            {report.rows.length > 14 && <p className="mt-1 text-xs text-muted-foreground">{report.rows.length - 14} more row(s) in the download.</p>}
          </div>
        </Card>
      )}
      <Card title="New trip">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Trip name</Label><Input className="h-11" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dubai Dec 2026" /></div>
          <div><Label>Destination</Label><Input className="h-11" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} /></div>
          <div><Label>Start</Label><Input type="date" className="h-11" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
          <div><Label>End</Label><Input type="date" className="h-11" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
          <div><Label>Budget (₹)</Label><Input type="number" className="h-11" value={form.budget || ""} onChange={(e) => setForm({ ...form, budget: Number(e.target.value) || 0 })} /></div>
          <div><Label>Trip type</Label><select className="h-11 w-full rounded-xl border bg-background px-2" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TripType })}>{TRIP_TYPES.map((t) => <option key={t} value={t}>{t[0]!.toUpperCase() + t.slice(1)}</option>)}</select></div>
          <div><Label>Currencies (comma separated)</Label><Input className="h-11" value={form.currencies} onChange={(e) => setForm({ ...form, currencies: e.target.value })} /></div>
        </div>
        <Button variant="gold" className="mt-3 w-full" onClick={add}>Create trip</Button>
      </Card>
    </div>
  );
}

function TripView({ trip, txns, setTags, onDelete }: { trip: Trip; txns: ReturnType<typeof useStore>["transactions"]; setTags: (id: string, t: string[]) => Promise<void>; onDelete: () => void }) {
  const s = useMemo(() => tripSummary(trip, txns), [trip, txns]);
  const tag = tripTag(trip);
  const candidates = txns.filter((t) => (t.txnType ?? "expense") === "expense" && t.date >= trip.start && t.date <= trip.end && !(t.tags ?? []).includes(tag));
  const toggle = async (id: string, on: boolean) => { const t = txns.find((x) => x.id === id); if (!t) return; try { await setTags(id, on ? [...new Set([...(t.tags ?? []), tag])] : (t.tags ?? []).filter((x) => x !== tag)); } catch (e) { toast.error((e as Error).message); } };
  const markReimb = async (id: string) => { const t = txns.find((x) => x.id === id); if (!t) return; const r = "Purpose: Reimbursable"; try { await setTags(id, (t.tags ?? []).includes(r) ? (t.tags ?? []).filter((x) => x !== r) : [...(t.tags ?? []), r]); } catch (e) { toast.error((e as Error).message); } };
  const pdf = async () => {
    const rows = [["Summary", "Total", money(s.total)], ["Summary", "Per day", money(s.perDay)], ["Summary", "Budget variance", money(s.variance)], ["Summary", "Reimbursable", money(s.reimbursable)],
      ...s.categories.map((c) => ["Category", c.category, money(c.amount)]), ...s.currencies.map((c) => ["Currency", `${c.currency} ${c.original} @ ${c.rates.join("/") || "1"}`, money(c.inr)]),
      ...s.entries.map((e) => ["Entry", `${e.date} ${e.merchant ?? e.title} (${e.currency} ${e.originalAmount} @ ${e.fxRate})`, money(e.amount)])];
    downloadBlob(await toPdf({ title: `Trip: ${trip.name}`, headers: ["Section", "Item", "INR"], rows }, `${trip.destination} · ${trip.start} to ${trip.end}`), `trip-${trip.name.replace(/\W+/g, "-")}.pdf`);
  };
  return (
    <>
      <Card title={`${trip.name}${trip.destination ? ` · ${trip.destination}` : ""}`} action={<Button size="icon" variant="ghost" aria-label="Delete trip" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>}>
        <div className="text-xs text-muted-foreground">{trip.start} → {trip.end} · {s.days} days · {trip.currencies.join(", ")}</div>
        <div className="my-2 font-display text-3xl font-bold">{money(s.total)}</div>
        {trip.budget > 0 && <><Bar pct={(s.total / trip.budget) * 100} /><div className="mt-1 text-xs">{s.overBudget ? <b className="text-destructive">{money(-s.variance)} over budget</b> : `${money(s.variance)} left of ${money(trip.budget)}`}</div></>}
        <Row label="Per day" value={money(s.perDay)} />
        <Row label="Reimbursable" value={money(s.reimbursable)} />
        <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={pdf}>Download summary PDF</Button><Button size="sm" variant="outline" asChild><Link to="/new">Add entry</Link></Button></div>
        <p className="mt-2 text-[11px] text-muted-foreground">Tip: add the tag “{tag}” to a new entry, or pick entries below.</p>
      </Card>
      {s.daily.length > 0 && <Card title="Daily spending"><div className="h-40"><ResponsiveContainer><BarChart data={s.daily}><XAxis dataKey="date" tickFormatter={(d: string) => d.slice(8)} fontSize={11} /><Tooltip formatter={(v: number) => money(v)} /><RBar dataKey="amount" fill="var(--gold)" radius={4} /></BarChart></ResponsiveContainer></div></Card>}
      {s.categories.length > 0 && <Card title="By category">{s.categories.map((c) => <Row key={c.category} label={c.category} value={money(c.amount)} />)}</Card>}
      {s.currencies.length > 0 && <Card title="By currency (rate used)">{s.currencies.map((c) => <Row key={c.currency} label={`${c.currency} ${c.original.toLocaleString()} @ ${c.rates.join(", ") || "1"}`} value={money(c.inr)} />)}</Card>}
      <Card title={`Trip entries (${s.entries.length})`}>
        {s.entries.map((e) => <div key={e.id} className="flex items-center justify-between gap-2 border-b py-1.5 text-sm last:border-0"><span className="min-w-0 truncate">{e.date} · {e.merchant ?? e.title}{e.currency !== "INR" && <span className="text-xs text-muted-foreground"> · {e.currency} {e.originalAmount} @ {e.fxRate}</span>}</span><span className="flex shrink-0 items-center gap-1"><span className="font-mono font-semibold">{money(e.amount)}</span><Button size="sm" variant="ghost" onClick={() => markReimb(e.id)}>{(e.tags ?? []).includes("Purpose: Reimbursable") ? "Reimb ✓" : "Reimb"}</Button><Button size="sm" variant="ghost" onClick={() => toggle(e.id, false)}>Remove</Button></span></div>)}
      </Card>
      {candidates.length > 0 && <Card title="Entries during these dates">{candidates.slice(0, 40).map((e) => <div key={e.id} className="flex items-center justify-between gap-2 py-1 text-sm"><span className="min-w-0 truncate">{e.date} · {e.merchant ?? e.title} · {money(e.amount)}</span><Button size="sm" variant="outline" onClick={() => toggle(e.id, true)}>Add</Button></div>)}</Card>}
    </>
  );
}
