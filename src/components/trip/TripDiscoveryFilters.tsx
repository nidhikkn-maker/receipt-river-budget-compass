import { useState } from "react";
import { ListFilter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SCOPE_LABEL } from "@/lib/expenses";
import { emptyTripFilters, type TripFilters } from "@/lib/trip-filters";
import type { TravelTrip } from "@/lib/travel";

export function TripDiscoveryFilters({ trips, value, onChange }: { trips: TravelTrip[]; value: TripFilters; onChange: (value: TripFilters) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const unique = (values: (string | undefined)[]) => [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
  const groups = [
    { key: "workspaces" as const, title: "Workspaces", values: ["personal", "family", "business", "mixed"] },
    { key: "travellers" as const, title: "Travellers", values: unique(trips.flatMap((t) => t.travellers ?? [])) },
    { key: "organisations" as const, title: "Organisations", values: unique(trips.map((t) => t.organisation)) },
    { key: "destinations" as const, title: "Destinations", values: unique(trips.map((t) => t.destination)) },
  ];
  const count = groups.reduce((n, g) => n + value[g.key].length, 0) + Number(!!value.from) + Number(!!value.to);
  return <>
    <div className="mb-4 flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><ListFilter className="mr-2 h-4 w-4" />Filters{count > 0 ? ` (${count})` : ""}</Button>
      {count > 0 && <Button variant="ghost" size="sm" onClick={() => onChange(emptyTripFilters())}>Clear filters</Button>}
    </div>
    <Sheet open={open} onOpenChange={setOpen}><SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto" aria-describedby={undefined} onOpenAutoFocus={(e) => e.preventDefault()}>
      <SheetHeader><SheetTitle>Filter trips</SheetTitle></SheetHeader>
      <div className="relative my-4"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search filter options" placeholder="Search travellers, organisations, destinations" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      {groups.map((group) => <fieldset key={group.key} className="mb-4"><legend className="mb-2 text-sm font-semibold">{group.title}</legend><div className="grid gap-2 sm:grid-cols-2">{group.values.filter((option) => option.toLowerCase().includes(search.toLowerCase())).map((option) => <label key={option} className="flex min-h-11 min-w-0 items-center gap-3 text-sm"><Checkbox checked={value[group.key].includes(option)} onCheckedChange={(checked) => onChange({ ...value, [group.key]: checked === true ? [...value[group.key], option] : value[group.key].filter((v) => v !== option) })} /><span className="break-words">{group.key === "workspaces" ? (option === "mixed" ? "Mixed" : SCOPE_LABEL[option as keyof typeof SCOPE_LABEL]) : option}</span></label>)}</div></fieldset>)}
      <div className="grid grid-cols-2 gap-3"><div className="min-w-0"><Label htmlFor="trip-filter-from">From</Label><Input id="trip-filter-from" type="date" value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} /></div><div className="min-w-0"><Label htmlFor="trip-filter-to">Until</Label><Input id="trip-filter-to" type="date" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} /></div></div>
      <div className="mt-4 flex gap-2"><Button variant="outline" onClick={() => onChange(emptyTripFilters())}>Clear filters</Button><Button className="flex-1" onClick={() => setOpen(false)}>Show trips</Button></div>
    </SheetContent></Sheet>
  </>;
}