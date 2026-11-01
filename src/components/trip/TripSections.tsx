import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Bar as RBar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Card, Row, Bar } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SCOPE_LABEL, CURRENCIES, money, type Scope } from "@/lib/expenses";
import { advanceReconRows, advanceReconciliation, TRAVEL_CATEGORIES, bookingMatches, bookingPaid, bookingOutstanding, tripBudgetDetail, tripInsights, tripReportRows, BOOKING_KINDS, TRIP_TYPES, closeBlockers, tripFinance, validateBooking, bookingPaymentIds, type Booking, type BookingKind, type TravelTrip, type TripType } from "@/lib/travel";
import { useStore } from "@/lib/store";
import { downloadBlob, toPdf } from "@/lib/reports";
import { todayISO } from "@/lib/use-position";
import { tripSummary, tripTag } from "@/lib/intelligence";
import { TripPlanFields } from "@/components/TripPlanFields";
import { BookingDocumentImport } from "./BookingDocumentImport";
import { TripExpenseActions } from "./TripExpenseActions";
import { reviewedBooking, type bookingDraft } from "@/lib/booking-import";

const sel = "h-10 rounded-xl border bg-background px-2 text-sm";
const slug = (name: string) => name.replace(/\W+/g, "-");
/** Rows to a CSV download, quoting every cell. */
const saveCsv = (rows: string[][], filename: string) => downloadBlob(new Blob([rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" }), filename);

export function useTripPut(trip: TravelTrip) {
  const { preferences: pr, savePreferences } = useStore();
  return async (patch: Partial<TravelTrip>, msg?: string) => {
    try { await savePreferences({ ...pr, trips: (pr.trips as TravelTrip[]).map((t) => (t.id === trip.id ? { ...t, ...patch } : t)) }); if (msg) toast.success(msg); } catch (e) { toast.error((e as Error).message); }
  };
}

/** Overview: trip details, travellers, insights, and the add-expense action. */
export function TripOverviewSection({ trip }: { trip: TravelTrip }) {
  const { preferences: pr, savePreferences, transactions, members } = useStore();
  const put = useTripPut(trip);
  const closed = !!trip.closedAt;
  const insights = useMemo(() => tripInsights(trip, transactions, todayISO()), [trip, transactions]);
  const missingCats = TRAVEL_CATEGORIES.filter((c) => !pr.categories.some((x) => x.name.toLowerCase() === c.toLowerCase()));
  const [traveller, setTraveller] = useState("");
  return (
    <>
      <Card title="Trip details">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Trip type</Label><select className={`${sel} w-full`} disabled={closed} value={trip.type ?? "personal"} onChange={(e) => void put({ type: e.target.value as TripType })}>{TRIP_TYPES.map((t) => <option key={t} value={t}>{t === "mixed" ? "Mixed purpose" : SCOPE_LABEL[t]}</option>)}</select></div>
          <div><Label>Purpose</Label><Input className="h-10" disabled={closed} defaultValue={trip.purpose ?? ""} onBlur={(e) => e.target.value !== (trip.purpose ?? "") && void put({ purpose: e.target.value.slice(0, 200) })} /></div>
          <div><Label>Organisation</Label><Input className="h-10" disabled={closed} defaultValue={trip.organisation ?? ""} onBlur={(e) => e.target.value !== (trip.organisation ?? "") && void put({ organisation: e.target.value.slice(0, 120) })} /></div>
        </div>
        <div className="mt-3"><Label>Travellers</Label>
          <div className="mt-1 flex flex-wrap gap-2">{(trip.travellers ?? []).map((t) => <span key={t} className="rounded-full bg-secondary px-3 py-1 text-xs">{t}{!closed && <button type="button" aria-label={`Remove ${t}`} className="ml-1" onClick={() => void put({ travellers: (trip.travellers ?? []).filter((x) => x !== t) })}>×</button>}</span>)}</div>
          {!closed && <div className="mt-2 flex gap-2"><Input className="h-10" value={traveller} onChange={(e) => setTraveller(e.target.value)} placeholder="Name" list="members" /><datalist id="members">{members.map((m) => <option key={m.id} value={m.name} />)}</datalist><Button type="button" variant="outline" onClick={() => { const n = traveller.trim(); if (!n || (trip.travellers ?? []).includes(n)) return; void put({ travellers: [...(trip.travellers ?? []), n.slice(0, 60)] }); setTraveller(""); }}>Add</Button></div>}
        </div>
        <TripPlanFields trip={trip} />
        {!closed && missingCats.length > 0 && <Button variant="outline" className="mt-3 w-full" onClick={() => void savePreferences({ ...pr, categories: [...pr.categories, ...missingCats.map((name) => ({ name, archived: false }))] }).then(() => toast.success("Travel categories added"))}>Add travel categories ({missingCats.join(", ")})</Button>}
        {!closed && <Button asChild variant="gold" className="mt-3 w-full"><Link to="/new" search={{ trip: trip.id }}>Add an expense to this trip</Link></Button>}
      </Card>
      {insights.length > 0 && <Card title="Trip insights"><ul className="list-disc space-y-1 pl-5 text-sm">{insights.map((i) => <li key={i}>{i}</li>)}</ul></Card>}
    </>
  );
}

/** Bookings: compact cards with type-relevant details; the entry form stays collapsed until needed. */
export function TripBookingsSection({ trip }: { trip: TravelTrip }) {
  const { transactions, setTags, documents, preferences, savePreferences } = useStore();
  const put = useTripPut(trip);
  const closed = !!trip.closedAt;
  const matches = useMemo(() => bookingMatches(trip, transactions), [trip, transactions]);
  const f = useMemo(() => tripFinance(trip, transactions), [trip, transactions]);
  const [showForm, setShowForm] = useState(false);
  const [bk, setBk] = useState<ReturnType<typeof bookingDraft>>({ kind: "flight", provider: "", ref: "", date: trip.start, amount: "", due: "", cancel: "", traveller: "", location: "", currency: "INR", rate: "1", confirmation: "pending", document: "", note: "" });

  const addBooking = async () => {
    let b: Booking;
    try { b = reviewedBooking(crypto.randomUUID(), bk); } catch (e) { toast.error((e as Error).message); return; }
    try {
      await savePreferences({ ...preferences, trips: (preferences.trips as TravelTrip[]).map((t) => t.id === trip.id ? { ...t, bookings: [...(t.bookings ?? []), b] } : t) });
      toast.success("Booking added — not counted as spent until paid");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save booking"); return; }
    setBk({ ...bk, provider: "", ref: "", amount: "", due: "", cancel: "", document: "", note: "" });
    setShowForm(false);
  };

  return (
    <Card title="Bookings" action={!closed && <Button size="sm" variant="gold" onClick={() => setShowForm((s) => !s)} aria-expanded={showForm}>{showForm ? "Close form" : "Add booking"}</Button>}>
      {!closed && <BookingDocumentImport tripName={trip.name} onDraft={(draft) => { setBk(draft); setShowForm(true); }} />}
      {(trip.bookings ?? []).length === 0 && !showForm && <p className="text-sm text-muted-foreground">No bookings yet. Add flights, hotels, trains and other reservations here — they only affect balances once paid.</p>}
      {(trip.bookings ?? []).map((b) => (
        <div key={b.id} className="flex flex-wrap items-center gap-2 border-b py-2 text-sm last:border-0">
          <div className="min-w-0 flex-1"><b className="capitalize">{b.kind}</b> · {b.provider} {b.ref && <span className="text-muted-foreground">#{b.ref}</span>}<div className="text-xs text-muted-foreground">{b.date} · {money(b.amount)} · {b.status === "cancelled" ? "Cancelled" : b.status === "paid" ? "Paid — linked to entry" : bookingPaid(b, transactions) > 0 ? `Part paid ${money(bookingPaid(b, transactions))} · ${money(bookingOutstanding(b, transactions))} still due` : "Not paid (no effect on balances)"}</div><div className="text-xs text-muted-foreground">{b.traveller} {b.location && `· ${b.location}`} · {b.confirmation ?? "pending"}{b.currency && b.currency !== "INR" && ` · ${b.currency} ${b.originalAmount} × ${b.planningRate}`}</div>{b.dueDate && <div className="text-xs text-muted-foreground">Payment due {b.dueDate}</div>}{b.cancelTerms && <div className="text-xs text-muted-foreground">Cancellation: {b.cancelTerms}</div>}{b.documentIds?.map(id => <Link key={id} to="/vault" className="block text-xs text-primary">{documents.find(d => d.id === id)?.title ?? "Attached document"}</Link>)}</div>
          {!closed && b.status === "unpaid" && <><Button asChild size="sm" variant="gold"><Link to="/new" search={{ trip: trip.id, booking: b.id }}>Record payment</Link></Button><Button size="sm" variant="ghost" onClick={() => void put({ bookings: (trip.bookings ?? []).map((x) => (x.id === b.id ? { ...x, status: "cancelled" as const } : x)) })}>Cancel</Button></>}
          {b.status === "paid" && b.expenseId && <Button asChild size="sm" variant="outline"><Link to="/new" search={{ edit: b.expenseId }}>View entry</Link></Button>}
          {!closed && b.status !== "cancelled" && <select aria-label={`Confirmation for ${b.provider || b.ref}`} className={sel} value={b.confirmation ?? "pending"} onChange={e => void put({ bookings: (trip.bookings ?? []).map(x => x.id === b.id ? { ...x, confirmation: e.target.value as "pending" | "confirmed" } : x) })}><option value="pending">Unconfirmed</option><option value="confirmed">Confirmed</option></select>}
          {!closed && <select aria-label={`Link existing payment for ${b.provider || b.ref}`} className={`${sel} max-w-full`} value="" onChange={async e => {
            const entry = transactions.find(x => x.id === e.target.value); if (!entry) return;
            const ids = [...new Set([...bookingPaymentIds(b), entry.id])];
            await setTags(entry.id, [...new Set([...(entry.tags ?? []), tripTag(trip)])]);
            await put({ bookings: (trip.bookings ?? []).map(x => x.id === b.id ? { ...x, expenseId: x.expenseId ?? entry.id, expenseIds: ids, status: b.status === "cancelled" ? "cancelled" as const : bookingPaid({ ...b, expenseIds: ids }, transactions) >= b.amount - 0.005 ? "paid" as const : "unpaid" as const } : x) }, "Existing payment linked");
          }}><option value="">Link payment / refund…</option>{transactions.filter(e => ["expense", "refund"].includes(e.txnType ?? "expense") && !(trip.bookings ?? []).flatMap(bookingPaymentIds).includes(e.id)).map(e => <option key={e.id} value={e.id}>{e.date} · {e.title} · {money(e.amount)}</option>)}</select>}
        </div>
      ))}
      {!closed && matches.map((m) => { const b = trip.bookings?.find((x) => x.id === m.bookingId); const e = transactions.find((x) => x.id === m.entryId); if (!b || !e) return null; return (
        <div key={m.bookingId} className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-secondary p-2 text-xs">
          <span className="flex-1">Looks like the {b.kind} booking was paid: {e.date} · {e.merchant ?? e.title} · {money(e.amount)}</span>
          <Button size="sm" onClick={async () => { try { await setTags(e.id, [...new Set([...(e.tags ?? []), tripTag(trip)])]); const ids = [...new Set([...bookingPaymentIds(b), e.id])]; await put({ bookings: (trip.bookings ?? []).map((x) => (x.id === b.id ? { ...x, status: bookingPaid({ ...b, expenseIds: ids }, transactions) >= b.amount - 0.005 ? "paid" as const : "unpaid" as const, expenseId: x.expenseId ?? e.id, expenseIds: ids } : x)) }, "Booking linked to the payment"); } catch (err) { toast.error((err as Error).message); } }}>Link</Button>
        </div>); })}
      {f.paidUnlinked.length > 0 && <p className="text-xs text-destructive">{f.paidUnlinked.length} paid booking(s) point to an entry not tagged to this trip.</p>}
      {!closed && showForm && <div className="mt-2 grid gap-2 border-t pt-3 sm:grid-cols-5">
        <select className={sel} value={bk.kind} onChange={(e) => setBk({ ...bk, kind: e.target.value as BookingKind })}>{BOOKING_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        <Input className="h-10" aria-label="Booking provider" placeholder="Provider" value={bk.provider} onChange={(e) => setBk({ ...bk, provider: e.target.value })} />
        <Input className="h-10" aria-label="Booking reference" placeholder="Booking ref" value={bk.ref} onChange={(e) => setBk({ ...bk, ref: e.target.value })} />
        <Input className="h-10" aria-label="Booking date" type="date" value={bk.date} onChange={(e) => setBk({ ...bk, date: e.target.value })} />
        <Input className="h-10" aria-label="Booking amount" type="number" placeholder="Original amount" value={bk.amount} onChange={(e) => setBk({ ...bk, amount: e.target.value })} />
        <Input className="h-10" type="date" aria-label="Payment due date" value={bk.due} onChange={(e) => setBk({ ...bk, due: e.target.value })} placeholder="Payment due" />
        <Input className="h-10 sm:col-span-4" placeholder="Cancellation terms (e.g. free until 24h before)" value={bk.cancel} onChange={(e) => setBk({ ...bk, cancel: e.target.value })} />
        <Input aria-label="Booking traveller" placeholder="Traveller" value={bk.traveller} onChange={e => setBk({ ...bk, traveller: e.target.value })} />
        <Input aria-label="Booking location" placeholder="Location" value={bk.location} onChange={e => setBk({ ...bk, location: e.target.value })} />
        <select aria-label="Booking currency" className={sel} value={bk.currency} onChange={e => setBk({ ...bk, currency: e.target.value, rate: e.target.value === "INR" ? "1" : bk.rate })}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select>
        <Input aria-label="Booking planning exchange rate" type="number" value={bk.rate} onChange={e => setBk({ ...bk, rate: e.target.value })} />
        <Input aria-label="Booking notes" placeholder="Notes / times" value={bk.note} onChange={e => setBk({ ...bk, note: e.target.value })} />
        <select aria-label="Booking attachment" className={`${sel} min-w-0`} value={bk.document} onChange={e => setBk({ ...bk, document: e.target.value })}><option value="">Attach vault document…</option>{documents.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select>
        <Button type="button" variant="outline" className="sm:col-span-5" onClick={addBooking}>Add booking</Button>
      </div>}
    </Card>
  );
}

/** Itinerary: chronological day timeline; the entry form opens on demand. */
export function TripItinerarySection({ trip }: { trip: TravelTrip }) {
  const { documents } = useStore();
  const put = useTripPut(trip);
  const closed = !!trip.closedAt;
  const [showForm, setShowForm] = useState(false);
  const [it, setIt] = useState({ date: trip.start, time: "", title: "", place: "", who: "", note: "", booking: "", document: "" });
  const items = [...(trip.itinerary ?? [])].sort((a, b) => `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`));
  return (
    <Card title="Itinerary" action={!closed && <Button size="sm" variant="gold" onClick={() => setShowForm((s) => !s)} aria-expanded={showForm}>{showForm ? "Close form" : "Add item"}</Button>}>
      {items.length === 0 && !showForm && <p className="text-sm text-muted-foreground">No plans yet. Add day-by-day activities, linked bookings and notes.</p>}
      {items.map((i) => (
        <div key={i.id} className="border-b py-2 text-sm last:border-0">
          <div className="flex items-start gap-2"><span className="w-28 shrink-0 text-xs text-muted-foreground">{i.date} {i.time}</span><div className="min-w-0 flex-1"><span className="block truncate">{i.title}{i.place && <span className="text-muted-foreground"> · {i.place}</span>}{i.travellers?.length ? <span className="text-muted-foreground"> · {i.travellers.join(", ")}</span> : null}</span>{i.note && <span className="block truncate text-xs text-muted-foreground">{i.note}</span>}</div>{!closed && <Button size="sm" variant="ghost" onClick={() => void put({ itinerary: (trip.itinerary ?? []).filter((x) => x.id !== i.id) })}>Remove</Button>}</div>
          {i.bookingId && <div className="text-xs text-muted-foreground">Booking: {(trip.bookings ?? []).find(b => b.id === i.bookingId)?.ref || (trip.bookings ?? []).find(b => b.id === i.bookingId)?.provider}</div>}
          {i.documentIds?.map(id => <Link key={id} to="/vault" className="block text-xs text-primary">{documents.find(d => d.id === id)?.title ?? "Linked document"}</Link>)}
        </div>
      ))}
      {!closed && showForm && <div className="mt-2 grid gap-2 border-t pt-3 sm:grid-cols-4">
        <Input className="h-10" type="date" value={it.date} onChange={(e) => setIt({ ...it, date: e.target.value })} />
        <Input className="h-10" type="time" value={it.time} onChange={(e) => setIt({ ...it, time: e.target.value })} />
        <Input className="h-10" placeholder="What" value={it.title} onChange={(e) => setIt({ ...it, title: e.target.value })} />
        <Input className="h-10" placeholder="Where" value={it.place} onChange={(e) => setIt({ ...it, place: e.target.value })} />
        <Input className="h-10" placeholder="Who (comma separated)" value={it.who} onChange={(e) => setIt({ ...it, who: e.target.value })} />
        <Input className="h-10 sm:col-span-3" placeholder="Note (reference, reminder, link)" value={it.note} onChange={(e) => setIt({ ...it, note: e.target.value })} />
        <select aria-label="Itinerary booking" className={`${sel} min-w-0 sm:col-span-2`} value={it.booking} onChange={e => setIt({ ...it, booking: e.target.value })}><option value="">Booking reference…</option>{(trip.bookings ?? []).map(b => <option key={b.id} value={b.id}>{b.provider} {b.ref}</option>)}</select>
        <select aria-label="Itinerary document" className={`${sel} min-w-0 sm:col-span-2`} value={it.document} onChange={e => setIt({ ...it, document: e.target.value })}><option value="">Linked document…</option>{documents.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select>
        <Button type="button" variant="outline" className="sm:col-span-4" onClick={() => { if (!it.title.trim()) { toast.error("Describe the plan"); return; } const who = it.who.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8); void put({ itinerary: [...(trip.itinerary ?? []), { id: crypto.randomUUID(), date: it.date, title: it.title.trim().slice(0, 120), ...(it.time ? { time: it.time } : {}), ...(it.place.trim() ? { place: it.place.trim().slice(0, 120) } : {}), ...(who.length ? { travellers: who } : {}), ...(it.note.trim() ? { note: it.note.trim().slice(0, 300) } : {}), bookingId: it.booking || null, documentIds: it.document ? [it.document] : [] }] }, "Added to itinerary"); setIt({ ...it, title: "", place: "", time: "", who: "", note: "", booking: "", document: "" }); setShowForm(false); }}>Add to itinerary</Button>
      </div>}
    </Card>
  );
}

/** Expenses: trip-tagged entries, daily chart, category/currency totals, and candidate entries to attach. */
export function TripExpensesSection({ trip }: { trip: TravelTrip }) {
  const { transactions } = useStore();
  const s = useMemo(() => tripSummary(trip, transactions), [trip, transactions]);
  return (
    <>
      <TripExpenseActions trip={trip} />
      {s.daily.length > 0 && <Card title="Daily spending"><div className="h-40"><ResponsiveContainer><BarChart data={s.daily}><XAxis dataKey="date" tickFormatter={(d: string) => d.slice(8)} fontSize={11} /><Tooltip formatter={(v: number) => money(v)} /><RBar dataKey="amount" fill="var(--gold)" radius={4} /></BarChart></ResponsiveContainer></div></Card>}
      {s.categories.length > 0 && <Card title="By category">{s.categories.map((c) => <Row key={c.category} label={c.category} value={money(c.amount)} />)}</Card>}
      {s.currencies.length > 0 && <Card title="By currency (rate used)">{s.currencies.map((c) => <Row key={c.currency} label={`${c.currency} ${c.original.toLocaleString()} @ ${c.rates.join(", ") || "1"}`} value={money(c.inr)} />)}</Card>}
    </>
  );
}

/** Budget & Settlements: budget vs actual, category lines, advances, reimbursements, reconciliation. */
export function TripBudgetSection({ trip }: { trip: TravelTrip }) {
  const { preferences: pr, transactions } = useStore();
  const put = useTripPut(trip);
  const closed = !!trip.closedAt;
  const f = useMemo(() => tripFinance(trip, transactions), [trip, transactions]);
  const bd = useMemo(() => tripBudgetDetail(trip, transactions), [trip, transactions]);
  const recon = useMemo(() => advanceReconciliation(trip, transactions), [trip, transactions]);
  const [adv, setAdv] = useState({ amount: "", source: "", date: trip.start });
  const [bl, setBl] = useState({ category: "", amount: "" });
  const ws = Object.entries(f.byWorkspace) as [Scope, number][];
  return (
    <>
      <Card title="Budget and money" action={<Button size="sm" variant="outline" onClick={() => saveCsv(tripReportRows(trip, transactions), `trip-${slug(trip.name)}.csv`)}>CSV</Button>}>
        <Row label="Spent (in your records)" value={money(f.total)} />
        <Row label="Booked, not yet paid" value={money(f.committed)} />
        <Row label="Spent + booked" value={money(f.projected)} />
        {trip.budget > 0 && <Row label={f.remainingAfterCommitted >= 0 ? "Left after bookings" : "Over budget after bookings"} value={money(Math.abs(f.remainingAfterCommitted))} />}
        {ws.length > 0 && <div className="mt-2 text-xs text-muted-foreground">By workspace: {ws.map(([w, v]) => `${SCOPE_LABEL[w]} ${money(v)}`).join(" · ")}</div>}
        {(bd.hasPlan || !closed) && (
          <div className="mt-3 border-t pt-2">
            <div className="text-xs font-medium">Category budgets</div>
            {bd.lines.length === 0 && <p className="text-xs text-muted-foreground">No category budgets yet — add one to see where the trip plan stands line by line.</p>}
            {bd.lines.map((l) => (
              <div key={l.category} className="flex items-center gap-2 border-b py-1.5 text-sm last:border-0">
                <span className="min-w-0 flex-1 truncate">{l.category}</span>
                <span className="font-mono text-xs text-muted-foreground">{money(l.budget)} plan</span>
                <span className={`font-mono text-xs ${l.over ? "text-destructive" : "text-muted-foreground"}`}>{l.over ? `${money(-l.left)} over` : `${money(l.left)} left`}</span>
                {!closed && <Button size="sm" variant="ghost" aria-label={`Remove ${l.category} budget`} onClick={() => void put({ budgetLines: (trip.budgetLines ?? []).filter((x) => x.category !== l.category) })}>×</Button>}
              </div>
            ))}
            {bd.contingency > 0 && <Row label="Contingency allowance" value={money(bd.contingency)} />}
            {bd.unbudgeted > 0 && <Row label="Spent outside the budget lines" value={money(bd.unbudgeted)} />}
            {bd.planned > 0 && <Row label={bd.remaining >= 0 ? "Left of the whole plan" : "Over the whole plan"} value={money(Math.abs(bd.remaining))} />}
            {!closed && (
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <select className={sel} value={bl.category} onChange={(e) => setBl({ ...bl, category: e.target.value })}><option value="">Category…</option>{pr.categories.filter((c) => !c.archived).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</select>
                <Input className="h-10" type="number" placeholder="Budget ₹" value={bl.amount} onChange={(e) => setBl({ ...bl, amount: e.target.value })} />
                <Button type="button" variant="outline" onClick={() => { const n = Number(bl.amount); if (!bl.category || !(n > 0)) { toast.error("Pick a category and an amount above zero"); return; } if ((trip.budgetLines ?? []).some((x) => x.category === bl.category)) { toast.error("That category already has a budget"); return; } void put({ budgetLines: [...(trip.budgetLines ?? []), { category: bl.category, amount: n }] }, "Category budget added"); setBl({ category: "", amount: "" }); }}>Add line</Button>
                <Input className="h-10" type="number" placeholder="Contingency ₹" defaultValue={trip.contingency || ""} onBlur={(e) => { const n = Number(e.target.value) || 0; if (n < 0) { toast.error("Contingency can't be negative"); return; } if (n !== (trip.contingency ?? 0)) void put({ contingency: n }, "Contingency updated"); }} />
                <p className="text-xs text-muted-foreground sm:col-span-2">Contingency is extra room on top of the trip budget, held back for surprises.</p>
              </div>
            )}
          </div>
        )}
        <Row label="Reimbursement pending" value={money(f.reimbursablePending)} />
        <Row label="Reimbursement received" value={money(f.reimbursed)} />
        <p className="mt-1 text-xs text-muted-foreground">Reimbursements received settle the original spend; they're never counted as income.</p>
      </Card>

      <Card title="Travel advances">
        <p className="mb-2 text-xs text-muted-foreground">Money given to you in advance for business or official travel. It isn't income or spending; it's compared with the business and official share of this trip.</p>
        {(trip.advances ?? []).map((a) => (
          <div key={a.id} className="flex items-center gap-2 border-b py-2 text-sm last:border-0"><span className="flex-1">{a.date} · {a.source} · {money(a.amount)}{a.settledAt && <span className="text-muted-foreground"> · settled {a.settledAt.slice(0, 10)}</span>}</span>{!closed && !a.settledAt && <Button size="sm" variant="outline" onClick={() => void put({ advances: (trip.advances ?? []).map((x) => (x.id === a.id ? { ...x, settledAt: new Date().toISOString() } : x)) }, "Advance marked settled")}>Mark settled</Button>}</div>
        ))}
        {f.advanced > 0 && <Row label={f.advanceBalance >= 0 ? "To return from advance" : "Still owed to you"} value={money(Math.abs(f.advanceBalance))} />}
        {!closed && <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Input className="h-10" type="number" placeholder="Amount ₹" value={adv.amount} onChange={(e) => setAdv({ ...adv, amount: e.target.value })} />
          <Input className="h-10" placeholder="From (e.g. MOVAC)" value={adv.source} onChange={(e) => setAdv({ ...adv, source: e.target.value })} />
          <Input className="h-10" type="date" value={adv.date} onChange={(e) => setAdv({ ...adv, date: e.target.value })} />
          <Button type="button" variant="outline" className="sm:col-span-3" onClick={() => { const n = Number(adv.amount); if (!(n > 0) || !adv.source.trim()) { toast.error("Enter the amount and who gave it"); return; } void put({ advances: [...(trip.advances ?? []), { id: crypto.randomUUID(), date: adv.date, amount: n, source: adv.source.trim().slice(0, 80) }] }, "Advance recorded"); setAdv({ ...adv, amount: "", source: "" }); }}>Record advance</Button>
        </div>}
      </Card>

      <Card title="Advance reconciliation" action={<Button size="sm" variant="outline" onClick={() => saveCsv(advanceReconRows(trip, transactions), `trip-${slug(trip.name)}-advances.csv`)}>CSV</Button>}>
        {recon.lines.length === 0 ? <p className="text-sm text-muted-foreground">No advances, business or official expenses, or returns on this trip yet.</p> : <>
          <div className="mb-2 text-xs text-muted-foreground">Advances received, compared with the business and official share of trip spending and anything you've returned.</div>
          {recon.lines.map((l, i) => <div key={i} className="flex gap-2 border-b py-1.5 text-sm last:border-0"><span className="w-24 shrink-0 text-muted-foreground">{l.date}</span><span className="flex-1 truncate">{l.label}</span><span className="font-mono">{l.kind === "advance" ? "+" : "−"}{money(l.amount)}</span></div>)}
          <div className="mt-2 border-t pt-2">
            <Row label="Advances received" value={money(recon.advances)} />
            <Row label="Trip expenses (business/official)" value={money(recon.expenses)} />
            <Row label="Returned" value={money(recon.returns)} />
            <Row label={recon.outstanding > 0 ? "Outstanding — to return" : recon.outstanding < 0 ? "Outstanding — owed to you" : "Fully reconciled"} value={money(Math.abs(recon.outstanding))} />
          </div>
          {recon.outstanding > 0 && !closed && <Button asChild variant="outline" size="sm" className="mt-2"><Link to="/new" search={{ kind: "advance_settlement", amount: recon.outstanding, trip: trip.id }}>Record return of {money(recon.outstanding)}</Link></Button>}
        </>}
      </Card>
    </>
  );
}

/** Reports: every trip report in one place — statement, claim, summary PDF and CSV exports. */
export function TripReportsSection({ trip }: { trip: TravelTrip }) {
  const { transactions } = useStore();
  const s = useMemo(() => tripSummary(trip, transactions), [trip, transactions]);
  const pdf = async () => {
    const rows = [["Summary", "Total", money(s.total)], ["Summary", "Per day", money(s.perDay)], ["Summary", "Budget variance", money(s.variance)], ["Summary", "Reimbursable", money(s.reimbursable)],
      ...s.categories.map((c) => ["Category", c.category, money(c.amount)]), ...s.currencies.map((c) => ["Currency", `${c.currency} ${c.original} @ ${c.rates.join("/") || "1"}`, money(c.inr)]),
      ...s.entries.map((e) => ["Entry", `${e.date} ${e.merchant ?? e.title} (${e.currency} ${e.originalAmount} @ ${e.fxRate})`, money(e.amount)])];
    downloadBlob(await toPdf({ title: `Trip: ${trip.name}`, headers: ["Section", "Item", "INR"], rows }, `${trip.destination} · ${trip.start} to ${trip.end}`), `trip-${slug(trip.name)}.pdf`);
  };
  return (
    <Card title="Trip reports">
      <div className="grid gap-2">
        <Link to="/expenditure-statement" search={{ trip: trip.id }} className="block rounded-xl border bg-card p-3 text-sm font-semibold text-primary">Detailed expenditure statement (PDF with original bills) →</Link>
        <Link to="/claim-submission" search={{ trip: trip.id }} className="block rounded-xl border bg-card p-3 text-sm font-semibold text-primary">Expense claim submission report →</Link>
        <Button variant="outline" onClick={pdf}>Download trip summary PDF</Button>
        <Button variant="outline" onClick={() => saveCsv(tripReportRows(trip, transactions), `trip-${slug(trip.name)}.csv`)}>Download trip CSV</Button>
        <Button variant="outline" onClick={() => saveCsv(advanceReconRows(trip, transactions), `trip-${slug(trip.name)}-advances.csv`)}>Download advances CSV</Button>
      </div>
    </Card>
  );
}

/** Closure lives under More: validates blockers before financial closure, and supports cancel/reopen. */
export function TripClosureCard({ trip }: { trip: TravelTrip }) {
  const { transactions } = useStore();
  const put = useTripPut(trip);
  const closed = !!trip.closedAt;
  const cancelled = !!trip.cancelledAt;
  const blockers = useMemo(() => closeBlockers(trip, transactions), [trip, transactions]);
  const f = useMemo(() => tripFinance(trip, transactions), [trip, transactions]);
  if (cancelled) return <Card title="Trip cancelled"><p className="text-sm">Cancelled on {trip.cancelledAt?.slice(0, 10)}. Records are unchanged.</p><Button variant="outline" className="mt-2" onClick={() => void put({ cancelledAt: null }, "Cancellation removed")}>Undo cancellation</Button></Card>;
  return (
    <Card title={closed ? "Trip closed" : "Close trip"}>
      {closed ? <><p className="text-sm">Closed on {trip.closedAt?.slice(0, 10)}. Final spend {money(f.total)}. Closing didn't add any entries.</p><Button variant="outline" className="mt-2" onClick={() => void put({ closedAt: null }, "Trip reopened")}>Reopen</Button></>
        : <>{blockers.length ? <ul className="list-disc pl-5 text-sm text-muted-foreground">{blockers.map((b) => <li key={b}>{b}</li>)}</ul> : <p className="text-sm text-muted-foreground">Everything is settled.</p>}
          <div className="mt-2 flex gap-2"><Button className="flex-1" disabled={blockers.length > 0} onClick={() => void put({ closedAt: new Date().toISOString() }, "Trip closed")}>Close trip</Button><Button variant="ghost" onClick={() => { if (confirm("Cancel this trip? Records stay; the trip is marked cancelled.")) void put({ cancelledAt: new Date().toISOString() }, "Trip cancelled"); }}>Cancel trip</Button></div></>}
    </Card>
  );
}
