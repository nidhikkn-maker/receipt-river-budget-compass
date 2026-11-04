import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useStore } from "@/lib/store";
import { usePosition, todayISO } from "@/lib/use-position";
import { money } from "@/lib/expenses";
import { bookingReminders } from "@/lib/travel-calendar";
import type { TravelTrip } from "@/lib/travel";
import { emiTargets } from "@/lib/emi-match";
import { loanFundingReminders } from "@/lib/loan-funding";

export function PaymentReminders() {
  const { preferences, commitments, pendingCount, transactions, accounts, loans } = useStore();
  const pos = usePosition(Math.max(1, preferences.reminderDays));
  const today = todayISO();
  const overdue = commitments.filter(c => c.status === "active" && c.direction === "out" && c.nextDue < today);
  const due = pos.upcoming.filter(u => u.direction === "out" && !u.overdue).slice(0, 6);
  const bookings = bookingReminders(preferences.trips as TravelTrip[], transactions, today, preferences.reminderDays);
  const funding = loanFundingReminders(emiTargets(loans, commitments, accounts), loans, transactions, today, preferences.reminderDays);
  return <>
    {pendingCount > 0 && <p role="status" className="mb-4 border-l-4 border-warning bg-secondary p-3 text-sm">{pendingCount} offline entr{pendingCount === 1 ? "y" : "ies"} waiting to sync</p>}
    {preferences.reminders && (due.length > 0 || overdue.length > 0 || bookings.length > 0 || funding.length > 0) && <section aria-label="Payment reminders" className="mb-6 border-l-4 border-primary bg-secondary p-4">
      <h2 className="mb-2 flex items-center gap-2 font-semibold"><Bell className="h-4 w-4" />Upcoming payments</h2>
      {funding.map(r => <Link key={r.key} to="/plan" className="block py-2 text-sm text-destructive"><span className="break-words">{r.name} · {r.status === "missing" ? `transfer not recorded for ${r.fundingDate}` : `funding ${money(r.shortfall)} short`} · EMI due {r.due}</span></Link>)}
      {overdue.map(c => <Link key={c.id} to="/plan" className="flex justify-between gap-3 py-1 text-sm text-destructive"><span className="min-w-0 break-words">{c.name} · overdue {c.nextDue}</span><span className="shrink-0 font-mono">{money(c.amount)}</span></Link>)}
      {due.map((u, i) => <Link key={i} to="/plan" className="flex justify-between gap-3 py-1 text-sm"><span className="min-w-0 break-words">{u.name} · {u.date === today ? "today" : u.date}</span><span className="shrink-0 font-mono">{money(u.amount)}</span></Link>)}
      {bookings.map(b => <Link key={b.id} to="/trips" search={{ trip: b.tripId }} className={`flex justify-between gap-3 py-1 text-sm ${b.overdue ? "text-destructive" : ""}`}><span className="min-w-0 break-words">{b.name} · {b.overdue ? "overdue " : "due "}{b.date === today ? "today" : b.date}</span><span className="shrink-0 font-mono">{money(b.amount)} unpaid</span></Link>)}
    </section>}
  </>;
}
