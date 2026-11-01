import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, CalendarPlus, Camera, FileText, MoreHorizontal, Plus, Receipt } from "lucide-react";
import { Card, Row } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { SCOPE_LABEL, money } from "@/lib/expenses";
import { tripSummary } from "@/lib/intelligence";
import { useStore } from "@/lib/store";
import { tripFinance, tripStatus, TRIP_STATUS_LABEL, type TravelTrip } from "@/lib/travel";
import { todayISO } from "@/lib/use-position";
import { TripOverviewSection, TripBookingsSection, TripItinerarySection, TripExpensesSection, TripBudgetSection, TripReportsSection, TripClosureCard } from "@/components/trip/TripSections";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "itinerary", label: "Itinerary" },
  { id: "bookings", label: "Bookings" },
  { id: "expenses", label: "Expenses" },
  { id: "budget", label: "Budget & Settlements" },
  { id: "reports", label: "Reports" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export const Route = createFileRoute("/_authenticated/trips/$tripId")({
  validateSearch: (search: Record<string, unknown>): { section?: SectionId } => {
    const s = search["section"];
    return SECTIONS.some((x) => x.id === s) ? { section: s as SectionId } : {};
  },
  head: () => ({
    meta: [
      { title: "Trip · Ledgerline" },
      { name: "description", content: "One trip's overview, itinerary, bookings, expenses, budget, settlements and reports." },
      { property: "og:title", content: "Trip · Ledgerline" },
      { property: "og:description", content: "Trip overview, bookings, itinerary, expenses and reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TripPage,
});

function TripPage() {
  const { tripId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { preferences: pr, savePreferences, transactions } = useStore();
  const today = todayISO();
  const trip = (pr.trips as TravelTrip[]).find((t) => t.id === tripId);
  const section: SectionId = search.section ?? "overview";
  const [moreOpen, setMoreOpen] = useState(false);

  const s = useMemo(() => (trip ? tripSummary(trip, transactions) : null), [trip, transactions]);
  const f = useMemo(() => (trip ? tripFinance(trip, transactions) : null), [trip, transactions]);

  if (!trip || !s || !f) {
    return (
      <div>
        <Button asChild variant="ghost" size="sm"><Link to="/trips"><ArrowLeft className="mr-1 h-4 w-4" />All trips</Link></Button>
        <Card title="Trip not found" className="mt-4"><p className="text-sm text-muted-foreground">This trip may have been removed. Your entries are untouched.</p></Card>
      </div>
    );
  }

  const st = tripStatus(trip, today);
  const go = (sec: SectionId) => void navigate({ search: { section: sec }, replace: true });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm"><Link to="/trips"><ArrowLeft className="mr-1 h-4 w-4" />All trips</Link></Button>
        <Button variant="ghost" size="sm" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}><MoreHorizontal className="mr-1 h-4 w-4" />More</Button>
      </div>

      <div className="mb-4">
        <div className="flex items-start justify-between gap-2">
          <h1 className="min-w-0 font-display text-3xl font-bold tracking-tight">{trip.name}</h1>
          <span className={"mt-1 shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold " + (st === "active" ? "bg-gold/15 text-gold-strong" : st === "cancelled" ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground")}>{TRIP_STATUS_LABEL[st]}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{trip.destination || "—"} · {trip.start} → {trip.end} · {trip.type === "mixed" ? "Mixed" : SCOPE_LABEL[trip.type ?? "personal"]}{trip.organisation ? ` · ${trip.organisation}` : ""}</p>
      </div>

      <Card title="Financial summary" className="mb-4">
        <div className="my-1 font-display text-3xl font-bold">{money(s.total)}</div>
        {trip.budget > 0 && <Row label={s.variance >= 0 ? `Left of ${money(trip.budget)} budget` : "Over budget"} value={money(Math.abs(s.variance))} />}
        <Row label="Booked, not yet paid" value={money(f.committed)} />
        <Row label="Outstanding advances" value={money(Math.abs(f.advanceBalance))} />
        <Row label="Reimbursement pending" value={money(f.reimbursablePending)} />
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Button asChild variant="gold" size="sm"><Link to="/new" search={{ trip: trip.id }}><Plus className="mr-1 h-4 w-4" />Add expense</Link></Button>
        <Button asChild variant="outline" size="sm"><Link to="/new" search={{ trip: trip.id }}><Camera className="mr-1 h-4 w-4" />Scan receipt</Link></Button>
        <Button variant="outline" size="sm" onClick={() => go("bookings")}><CalendarPlus className="mr-1 h-4 w-4" />Add booking</Button>
        <Button variant="outline" size="sm" onClick={() => go("itinerary")}><Receipt className="mr-1 h-4 w-4" />Add plan item</Button>
        <Button variant="outline" size="sm" onClick={() => go("reports")}><FileText className="mr-1 h-4 w-4" />Reports</Button>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Trip sections">
        {SECTIONS.map((sec) => (
          <Button key={sec.id} size="sm" variant={section === sec.id ? "default" : "outline"} role="tab" aria-selected={section === sec.id} onClick={() => go(sec.id)} className="shrink-0">{sec.label}</Button>
        ))}
      </div>

      {section === "overview" && <TripOverviewSection trip={trip} />}
      {section === "itinerary" && <TripItinerarySection trip={trip} />}
      {section === "bookings" && <TripBookingsSection trip={trip} />}
      {section === "expenses" && <TripExpensesSection trip={trip} />}
      {section === "budget" && <TripBudgetSection trip={trip} />}
      {section === "reports" && <TripReportsSection trip={trip} />}

      {moreOpen && (
        <div className="mt-4 space-y-3">
          <TripClosureCard trip={trip} />
          <Button variant="ghost" className="w-full text-destructive" onClick={async () => {
            if (!confirm("Delete this trip? Entries stay, the trip label is kept on them.")) return;
            await savePreferences({ ...pr, trips: pr.trips.filter((x) => x.id !== trip.id) });
            void navigate({ to: "/trips" });
          }}>Delete trip (entries stay)</Button>
        </div>
      )}
    </div>
  );
}
