import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plane, CalendarClock } from "lucide-react";
import { Button } from "./ui/button";
import { useStore } from "@/lib/store";
import { occurrences, addDays, addMonths, monthEnd } from "@/lib/planning";
import { todayISO } from "@/lib/use-position";
import { money } from "@/lib/expenses";
import { cn } from "@/lib/utils";
import { travelCalendarItems } from "@/lib/travel-calendar";
import type { TravelTrip } from "@/lib/travel";

interface CalendarItem { date: string; name: string; amount: number; direction: string; kind?: string; tripId?: string }
export function PlanCalendar() {
  const { commitments, loans, documents, preferences, transactions } = useStore();
  const [month, setMonth] = useState(todayISO().slice(0, 7) + "-01");
  const [selected, setSelected] = useState(todayISO());
  const first = (new Date(month + "T00:00:00Z").getUTCDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, i) => addDays(month, i - first));
  const from = cells[0] ?? month;
  const end = cells[41] ?? monthEnd(month);
  const planned: CalendarItem[] = occurrences(commitments, from, end).filter(x => x.date >= from).map(x => ({ date: x.date, name: x.name, amount: x.amount, direction: x.direction }));
  for (const loan of loans.filter(x => x.status === "active")) {
    for (let date = loan.nextDue, n = 0; n < 1200 && date <= end; n++, date = addMonths(date, 1)) {
      if (date >= from) planned.push({ date, name: loan.name + " EMI", amount: loan.emi, direction: "out" });
    }
  }
  for (const doc of documents) if (doc.expiresOn && doc.expiresOn >= from && doc.expiresOn <= end) planned.push({ date: doc.expiresOn, name: doc.title + " expires", amount: 0, direction: "out" });
  planned.push(...travelCalendarItems(preferences.trips as TravelTrip[], transactions, from, end));
  const selectedItems = planned.filter(x => x.date === selected);
  const changeMonth = (offset: number) => { const next = addMonths(month, offset); setMonth(next); setSelected(next); };
  return <section aria-label="Trip and payment calendar" className="mb-6">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-display text-lg font-bold">{new Date(month + "T00:00:00Z").toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
      <div className="flex gap-1"><Button size="icon" variant="ghost" aria-label="Previous calendar month" onClick={() => changeMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={() => { setMonth(todayISO().slice(0, 7) + "-01"); setSelected(todayISO()); }}>Today</Button><Button size="icon" variant="ghost" aria-label="Next calendar month" onClick={() => changeMonth(1)}><ChevronRight className="h-4 w-4" /></Button></div>
    </div>
    <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Plane className="h-3 w-3 text-primary" />Trips</span><span className="flex items-center gap-1"><CalendarClock className="h-3 w-3 text-warning" />Booking dues</span><span>Payments & deadlines</span></div>
    <div className="grid grid-cols-7 border-l border-t">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <div key={day} className="border-b border-r p-2 text-center text-xs text-muted-foreground">{day}</div>)}
      {cells.map(date => {
        const items = planned.filter(x => x.date === date);
        return <Button key={date} variant="ghost" aria-label={`Calendar ${date}, ${items.length} items`} aria-pressed={selected === date} onClick={() => setSelected(date)} className={cn("h-20 min-w-0 flex-col justify-start gap-1 rounded-none border-b border-r p-1 sm:h-24", !date.startsWith(month.slice(0, 7)) && "text-muted-foreground", selected === date && "bg-secondary", date === todayISO() && "text-primary")}>
          <span className="text-xs">{Number(date.slice(8))}</span>
          {items.length > 0 && <><span className="flex gap-1">{items.some(x => x.kind === "trip") && <Plane className="h-3 w-3 text-primary" />}{items.some(x => x.kind === "booking") && <CalendarClock className="h-3 w-3 text-warning" />}</span><span className="text-[10px]">{items.length} items</span><span className="hidden max-w-full truncate text-[10px] sm:block">{items[0]?.name}</span></>}
        </Button>;
      })}
    </div>
    <div className="mt-3"><h3 className="text-sm font-medium">{selected}</h3><ul className="divide-y text-sm">{selectedItems.map((item, index) => <li key={index} className="flex justify-between gap-3 py-2">
      <span className="min-w-0 break-words">{item.tripId ? <Link to="/trips" search={{ trip: item.tripId }} className="text-primary underline-offset-4 hover:underline">{item.name}</Link> : item.name}{item.kind === "booking" && <span className={cn("block text-xs", item.date < todayISO() ? "text-destructive" : "text-muted-foreground")}>{item.date < todayISO() ? "Overdue · " : ""}Unpaid booking</span>}</span>
      <span className="shrink-0 font-mono">{item.amount ? `${item.direction === "in" ? "+" : "−"}${money(item.amount)}` : ""}</span>
    </li>)}</ul>{selectedItems.length === 0 && <p className="py-2 text-xs text-muted-foreground">Nothing scheduled</p>}</div>
  </section>;
}
