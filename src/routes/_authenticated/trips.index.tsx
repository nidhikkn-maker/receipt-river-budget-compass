import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Plane, Plus, Search } from "lucide-react";
import { PageTitle } from "@/components/AppShell";
import { Card, Row } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SCOPE_LABEL, money } from "@/lib/expenses";
import { emptyTripFilters, matchesTripFilters } from "@/lib/trip-filters";
import { TripDiscoveryFilters } from "@/components/trip/TripDiscoveryFilters";
import { tripSummary } from "@/lib/intelligence";
import { useStore } from "@/lib/store";
import { advanceDashboard, tripStatus, TRIP_STATUS_LABEL, type TripStatus, type TravelTrip } from "@/lib/travel";
import { todayISO } from "@/lib/use-position";
import { PlanCalendar } from "@/components/PlanCalendar";
import { CreateTripDialog } from "@/components/trip/CreateTripDialog";

export const Route = createFileRoute("/_authenticated/trips/")({
  validateSearch: (search: Record<string, unknown>): { trip?: string; status?: "upcoming" } => ({ ...(typeof search["trip"] === "string" ? { trip: search["trip"] } : {}), ...(search["status"] === "upcoming" ? { status: "upcoming" as const } : {}) }),
  head: () => ({
    meta: [
      { title: "Travel Manager · Ledgerline" },
      { name: "description", content: "All trips at a glance — budgets, spending, advances and alerts. Open a trip for bookings, itinerary, expenses and reports." },
      { property: "og:title", content: "Travel Manager · Ledgerline" },
      { property: "og:description", content: "Compact trip overview with budgets, advances and alerts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Trips,
});

const FILTERS: ("all" | TripStatus)[] = ["all", "upcoming", "active", "completed", "cancelled", "closed"];

function Trips() {
  const { preferences: pr, transactions } = useStore();
  const today = todayISO();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | TripStatus>(search.status ?? "all");
  const [filters, setFilters] = useState(emptyTripFilters);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  // Legacy deep link: /trips?trip=<id> opens the dedicated trip view.
  useEffect(() => { if (search.trip) void navigate({ to: "/trips/$tripId", params: { tripId: search.trip }, replace: true }); }, [search.trip, navigate]);

  const trips = pr.trips as TravelTrip[];
  const dash = useMemo(() => advanceDashboard(trips, transactions, today), [trips, transactions, today]);
  const dueSoon = useMemo(() => trips.flatMap((t) => (t.bookings ?? []).filter((b) => b.status === "unpaid" && b.dueDate && b.dueDate >= today).map((b) => ({ trip: t, b }))).sort((a, b) => a.b.dueDate!.localeCompare(b.b.dueDate!)), [trips, today]);
  const spent = useMemo(() => new Map(trips.map((t) => [t.id, tripSummary(t, transactions).total])), [trips, transactions]);

  const shown = trips.filter((t) => {
    if (filter !== "all" && tripStatus(t, today) !== filter) return false;
    if (!matchesTripFilters(t, filters)) return false;
    if (query && !`${t.name} ${t.destination} ${t.organisation ?? ""}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <PageTitle eyebrow="Travel" title="Travel Manager" sub="Every trip at a glance. Open one for bookings, itinerary, expenses, budget and reports." />
      <Button asChild variant="outline" className="mb-4"><Link to="/travel-inbox">Travel inbox</Link></Button>

      {(dash.toReturn > 0 || dash.owedToYou > 0 || dueSoon.length > 0) && (
        <Card title="Travel alerts" className="mb-4">
          {dash.toReturn > 0 && <Row label="Advance money to return" value={money(dash.toReturn)} />}
          {dash.owedToYou > 0 && <Row label="Still owed to you" value={money(dash.owedToYou)} />}
          {dueSoon.slice(0, 3).map(({ trip: t, b }) => (
            <div key={b.id} className="flex items-center gap-2 border-b py-1.5 text-sm last:border-0">
              <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{b.provider || b.ref} · {t.name} · due {b.dueDate}</span>
              <span className="shrink-0 font-mono text-xs">{money(b.amount)}</span>
            </div>
          ))}
        </Card>
      )}

      <div className="mb-3 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-11 pl-9" placeholder="Search trips, destinations, organisations…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search trips" />
        </div>
        <Button variant="gold" className="h-11 shrink-0" onClick={() => setCreateOpen(true)}><Plus className="mr-1 h-4 w-4" />Create trip</Button>
      </div>

      <div className="mb-2 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Trip status filter">
        {FILTERS.map((k) => (
          <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} aria-pressed={filter === k} onClick={() => setFilter(k)} className="shrink-0">
            {k === "all" ? `All ${trips.length}` : `${TRIP_STATUS_LABEL[k]} ${trips.filter((t) => tripStatus(t, today) === k).length}`}
          </Button>
        ))}
      </div>
      <TripDiscoveryFilters trips={trips} value={filters} onChange={setFilters} />

      {shown.length === 0 && (
        <Card title="No trips here">
          <p className="text-sm text-muted-foreground">{trips.length === 0 ? "Create your first trip to plan bookings, itinerary and travel money." : "No trips match these filters."}</p>
        </Card>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((t) => {
          const st = tripStatus(t, today);
          const total = spent.get(t.id) ?? 0;
          return (
            <Link key={t.id} to="/trips/$tripId" params={{ tripId: t.id }} className="block rounded-2xl border bg-card p-4 transition hover:bg-accent">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-display text-lg font-bold">{t.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{t.destination || "—"} · {t.start} → {t.end}</div>
                </div>
                <span className={"shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold " + (st === "active" ? "bg-gold/15 text-gold-strong" : st === "cancelled" ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground")}>{TRIP_STATUS_LABEL[st]}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{t.type === "mixed" ? "Mixed" : SCOPE_LABEL[t.type ?? "personal"]}</span>
                {t.organisation && <span className="truncate">{t.organisation}</span>}
                {(t.travellers ?? []).length > 0 && <span>{t.travellers!.length} traveller{t.travellers!.length > 1 ? "s" : ""}</span>}
              </div>
              <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                  <div className="font-mono text-lg font-semibold text-gold-strong">{money(total)}</div>
                  {t.budget > 0 && <div className="text-[11px] text-muted-foreground">of {money(t.budget)} budget</div>}
                </div>
                <Plane className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          );
        })}
      </div>

      <details className="mt-6 border-t pt-3"><summary className="cursor-pointer font-display text-lg font-bold">Travel & payment calendar</summary><div className="mt-4"><PlanCalendar /></div></details>

      <CreateTripDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
