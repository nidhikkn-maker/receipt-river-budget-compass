import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card, Row } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SCOPE_LABEL, money, type Scope } from "@/lib/expenses";
import { advanceReconRows, advanceReconciliation, TRAVEL_CATEGORIES, bookingMatches, bookingPaid, bookingOutstanding, tripBudgetDetail, tripInsights, tripReportRows, BOOKING_KINDS, TRIP_TYPES, closeBlockers, tripFinance, validateBooking, type Booking, type BookingKind, type TravelTrip, type TripType } from "@/lib/travel";
import { useStore } from "@/lib/store";
import { downloadBlob } from "@/lib/reports";
import { todayISO } from "@/lib/use-position";
import { tripTag } from "@/lib/intelligence";

const sel = "h-10 rounded-xl border bg-background px-2 text-sm";
const slug = (name: string) => name.replace(/\W+/g, "-");
/** Rows to a CSV download, quoting every cell. */
const saveCsv = (rows: string[][], filename: string) => downloadBlob(new Blob([rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" }), filename);

/** Travel Manager panel: type, travellers, bookings, itinerary, advances, budget vs committed, closure. Payments always go through the shared entry form. */
export function TravelPanel({ trip }: { trip: TravelTrip }) {
  const { preferences: pr, savePreferences, transactions, setTags } = useStore();
  const matches = useMemo(() => bookingMatches(trip, transactions), [trip, transactions]);
  const insights = useMemo(() => tripInsights(trip, transactions, todayISO()), [trip, transactions]);
  const missingCats = TRAVEL_CATEGORIES.filter((c) => !pr.categories.some((x) => x.name.toLowerCase() === c.toLowerCase()));
  const f = useMemo(() => tripFinance(trip, transactions), [trip, transactions]);
  const bd = useMemo(() => tripBudgetDetail(trip, transactions), [trip, transactions]);
  const recon = useMemo(() => advanceReconciliation(trip, transactions), [trip, transactions]);
  const blockers = useMemo(() => closeBlockers(trip, transactions), [trip, transactions]);
  const put = async (patch: Partial<TravelTrip>, msg?: string) => {
    try { await savePreferences({ ...pr, trips: (pr.trips as TravelTrip[]).map((t) => (t.id === trip.id ? { ...t, ...patch } : t)) }); if (msg) toast.success(msg); } catch (e) { toast.error((e as Error).message); }
  };
  const closed = !!trip.closedAt;
  const [traveller, setTraveller] = useState("");
  const [bk, setBk] = useState({ kind: "flight" as BookingKind, provider: "", ref: "", date: trip.start, amount: "", due: "", cancel: "" });
  const [it, setIt] = useState({ date: trip.start, time: "", title: "", place: "", who: "", note: "" });
  const [adv, setAdv] = useState({ amount: "", source: "", date: trip.start });
  const [bl, setBl] = useState({ category: "", amount: "" });

  const addBooking = () => {
    const b: Booking = { id: crypto.randomUUID(), kind: bk.kind, provider: bk.provider.trim(), ref: bk.ref.trim(), date: bk.date, amount: Number(bk.amount) || 0, status: "unpaid", dueDate: bk.due || null, cancelTerms: bk.cancel.trim() || null };
    try { validateBooking(b); } catch (e) { toast.error((e as Error).message); return; }
    void put({ bookings: [...(trip.bookings ?? []), b] }, "Booking added — not counted as spent until paid");
    setBk({ ...bk, provider: "", ref: "", amount: "", due: "", cancel: "" });
  };
  const ws = Object.entries(f.byWorkspace) as [Scope, number][];

  return (
    <>
      <Card title="Trip details">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Trip type</Label><select className={`${sel} w-full`} disabled={closed} value={trip.type ?? "personal"} onChange={(e) => void put({ type: e.target.value as TripType })}>{TRIP_TYPES.map((t) => <option key={t} value={t}>{t === "mixed" ? "Mixed purpose" : SCOPE_LABEL[t]}</option>)}</select></div>
          <div><Label>Purpose</Label><Input className="h-10" disabled={closed} defaultValue={trip.purpose ?? ""} onBlur={(e) => e.target.value !== (trip.purpose ?? "") && void put({ purpose: e.target.value.slice(0, 200) })} /></div>
        </div>
        <div className="mt-3"><Label>Travellers</Label>
          <div className="mt-1 flex flex-wrap gap-2">{(trip.travellers ?? []).map((t) => <span key={t} className="rounded-full bg-secondary px-3 py-1 text-xs">{t}{!closed && <button type="button" aria-label={`Remove ${t}`} className="ml-1" onClick={() => void put({ travellers: (trip.travellers ?? []).filter((x) => x !== t) })}>×</button>}</span>)}</div>
          {!closed && <div className="mt-2 flex gap-2"><Input className="h-10" value={traveller} onChange={(e) => setTraveller(e.target.value)} placeholder="Name" list="members" /><datalist id="members">{useStore().members.map((m) => <option key={m.id} value={m.name} />)}</datalist><Button type="button" variant="outline" onClick={() => { const n = traveller.trim(); if (!n || (trip.travellers ?? []).includes(n)) return; void put({ travellers: [...(trip.travellers ?? []), n.slice(0, 60)] }); setTraveller(""); }}>Add</Button></div>}
        </div>
        {!closed && missingCats.length > 0 && <Button variant="outline" className="mt-3 w-full" onClick={() => void savePreferences({ ...pr, categories: [...pr.categories, ...missingCats.map((name) => ({ name, archived: false }))] }).then(() => toast.success("Travel categories added"))}>Add travel categories ({missingCats.join(", ")})</Button>}
        {!closed && <Button asChild variant="gold" className="mt-3 w-full"><Link to="/new" search={{ trip: trip.id }}>Add an expense to this trip</Link></Button>}
      </Card>

      {insights.length > 0 && <Card title="Trip insights"><ul className="list-disc space-y-1 pl-5 text-sm">{insights.map((i) => <li key={i}>{i}</li>)}</ul></Card>}
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

      <Card title="Bookings">
        {(trip.bookings ?? []).map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-2 border-b py-2 text-sm last:border-0">
            <div className="min-w-0 flex-1"><b className="capitalize">{b.kind}</b> · {b.provider} {b.ref && <span className="text-muted-foreground">#{b.ref}</span>}<div className="text-xs text-muted-foreground">{b.date} · {money(b.amount)} · {b.status === "cancelled" ? "Cancelled" : b.status === "paid" ? "Paid — linked to entry" : bookingPaid(b, transactions) > 0 ? `Part paid ${money(bookingPaid(b, transactions))} · ${money(bookingOutstanding(b, transactions))} still due` : "Not paid (no effect on balances)"}</div>{b.dueDate && <div className="text-xs text-muted-foreground">Payment due {b.dueDate}</div>}{b.cancelTerms && <div className="text-xs text-muted-foreground">Cancellation: {b.cancelTerms}</div>}</div>
            {!closed && b.status === "unpaid" && <><Button asChild size="sm" variant="gold"><Link to="/new" search={{ trip: trip.id, booking: b.id }}>Record payment</Link></Button><Button size="sm" variant="ghost" onClick={() => void put({ bookings: (trip.bookings ?? []).map((x) => (x.id === b.id ? { ...x, status: "cancelled" as const } : x)) })}>Cancel</Button></>}
            {b.status === "paid" && b.expenseId && <Button asChild size="sm" variant="outline"><Link to="/new" search={{ edit: b.expenseId }}>View entry</Link></Button>}
          </div>
        ))}
        {!closed && matches.map((m) => { const b = trip.bookings!.find((x) => x.id === m.bookingId)!; const e = transactions.find((x) => x.id === m.entryId)!; return (
          <div key={m.bookingId} className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-secondary p-2 text-xs">
            <span className="flex-1">Looks like the {b.kind} booking was paid: {e.date} · {e.merchant ?? e.title} · {money(e.amount)}</span>
            <Button size="sm" onClick={async () => { try { await setTags(e.id, [...new Set([...(e.tags ?? []), tripTag(trip)])]); await put({ bookings: (trip.bookings ?? []).map((x) => (x.id === b.id ? { ...x, status: "paid" as const, expenseId: e.id } : x)) }, "Booking linked to the payment"); } catch (err) { toast.error((err as Error).message); } }}>Link</Button>
          </div>); })}
        {f.paidUnlinked.length > 0 && <p className="text-xs text-destructive">{f.paidUnlinked.length} paid booking(s) point to an entry not tagged to this trip.</p>}
        {!closed && <div className="mt-2 grid gap-2 sm:grid-cols-5">
          <select className={sel} value={bk.kind} onChange={(e) => setBk({ ...bk, kind: e.target.value as BookingKind })}>{BOOKING_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
          <Input className="h-10" placeholder="Provider" value={bk.provider} onChange={(e) => setBk({ ...bk, provider: e.target.value })} />
          <Input className="h-10" placeholder="Booking ref" value={bk.ref} onChange={(e) => setBk({ ...bk, ref: e.target.value })} />
          <Input className="h-10" type="date" value={bk.date} onChange={(e) => setBk({ ...bk, date: e.target.value })} />
          <Input className="h-10" type="number" placeholder="Amount ₹" value={bk.amount} onChange={(e) => setBk({ ...bk, amount: e.target.value })} />
          <Input className="h-10" type="date" aria-label="Payment due date" value={bk.due} onChange={(e) => setBk({ ...bk, due: e.target.value })} placeholder="Payment due" />
          <Input className="h-10 sm:col-span-4" placeholder="Cancellation terms (e.g. free until 24h before)" value={bk.cancel} onChange={(e) => setBk({ ...bk, cancel: e.target.value })} />
          <Button type="button" variant="outline" className="sm:col-span-5" onClick={addBooking}>Add booking</Button>
        </div>}
      </Card>

      <Card title="Itinerary">
        {[...(trip.itinerary ?? [])].sort((a, b) => `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`)).map((i) => (
          <div key={i.id} className="border-b py-2 text-sm last:border-0">
            <div className="flex items-start gap-2"><span className="w-28 shrink-0 text-xs text-muted-foreground">{i.date} {i.time}</span><div className="min-w-0 flex-1"><span className="block truncate">{i.title}{i.place && <span className="text-muted-foreground"> · {i.place}</span>}{i.travellers?.length ? <span className="text-muted-foreground"> · {i.travellers.join(", ")}</span> : null}</span>{i.note && <span className="block truncate text-xs text-muted-foreground">{i.note}</span>}</div>{!closed && <Button size="sm" variant="ghost" onClick={() => void put({ itinerary: (trip.itinerary ?? []).filter((x) => x.id !== i.id) })}>Remove</Button>}</div>
            {(i.travellers?.length || i.note) && <div className="pl-28 text-xs text-muted-foreground">{i.travellers?.length && <span>{i.travellers.join(", ")}{i.note ? " · " : ""}</span>}{i.note}</div>}
          </div>
        ))}
        {!closed && <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <Input className="h-10" type="date" value={it.date} onChange={(e) => setIt({ ...it, date: e.target.value })} />
          <Input className="h-10" type="time" value={it.time} onChange={(e) => setIt({ ...it, time: e.target.value })} />
          <Input className="h-10" placeholder="What" value={it.title} onChange={(e) => setIt({ ...it, title: e.target.value })} />
          <Input className="h-10" placeholder="Where" value={it.place} onChange={(e) => setIt({ ...it, place: e.target.value })} />
          <Input className="h-10" placeholder="Who (comma separated)" value={it.who} onChange={(e) => setIt({ ...it, who: e.target.value })} />
          <Input className="h-10 sm:col-span-3" placeholder="Note (reference, reminder, link)" value={it.note} onChange={(e) => setIt({ ...it, note: e.target.value })} />
          <Button type="button" variant="outline" className="sm:col-span-4" onClick={() => { if (!it.title.trim()) { toast.error("Describe the plan"); return; } const who = it.who.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8); void put({ itinerary: [...(trip.itinerary ?? []), { id: crypto.randomUUID(), date: it.date, title: it.title.trim().slice(0, 120), ...(it.time ? { time: it.time } : {}), ...(it.place.trim() ? { place: it.place.trim().slice(0, 120) } : {}), ...(who.length ? { travellers: who } : {}), ...(it.note.trim() ? { note: it.note.trim().slice(0, 300) } : {}) }] }, "Added to itinerary"); setIt({ ...it, title: "", place: "", time: "", who: "", note: "" }); }}>Add to itinerary</Button>
        </div>}
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

      <Card title={closed ? "Trip closed" : "Close trip"}>
        {closed ? <><p className="text-sm">Closed on {trip.closedAt!.slice(0, 10)}. Final spend {money(f.total)}. Closing didn't add any entries.</p><Button variant="outline" className="mt-2" onClick={() => void put({ closedAt: null }, "Trip reopened")}>Reopen</Button></>
          : <>{blockers.length ? <ul className="list-disc pl-5 text-sm text-muted-foreground">{blockers.map((b) => <li key={b}>{b}</li>)}</ul> : <p className="text-sm text-muted-foreground">Everything is settled.</p>}
            <Button className="mt-2 w-full" disabled={blockers.length > 0} onClick={() => void put({ closedAt: new Date().toISOString() }, "Trip closed")}>Close trip</Button></>}
      </Card>
    </>
  );
}
