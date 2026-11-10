import { createFileRoute, Link } from "@tanstack/react-router";
import { PageTitle } from "@/components/AppShell";
import { LoadError } from "@/components/LoadError";
import { useStore } from "@/lib/store";
import { money } from "@/lib/expenses";
import { todayISO } from "@/lib/use-position";
import { loadFailed } from "@/lib/load-state";
import { emptyBooks } from "@/lib/books/types";
import { calendarItemDetail, parseCalendarItemId } from "@/lib/calendar-item";
import { archivedTableIds } from "@/lib/records-archive";
import type { TravelTrip } from "@/lib/travel";
import { normalizeNotificationSettings } from "@/lib/notification-settings";

export const Route = createFileRoute("/_authenticated/calendar-item")({
  validateSearch: (s: Record<string, unknown>): { id?: string; date?: string } => ({ ...(typeof s["id"] === "string" ? { id: s["id"] } : {}), ...(typeof s["date"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s["date"]) ? { date: s["date"] } : {}) }),
  head: () => ({ meta: [
    { title: "Calendar item — Thapal" },
    { name: "description", content: "One calendar item: who it belongs to, where it comes from, when it repeats and how you are reminded." },
    { property: "og:title", content: "Calendar item — Thapal" }, { property: "og:description", content: "Calendar item details." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: CalendarItemPage,
});

function CalendarItemPage() {
  const { id, date } = Route.useSearch();
  const { commitments, loans, documents, accounts, preferences, loadErrors, refresh } = useStore();
  const ref = parseCalendarItemId(id);
  const books = preferences.books ?? emptyBooks();
  const d = ref ? calendarItemDetail(ref, { commitments, loans, documents, accounts, trips: preferences.trips as TravelTrip[], entities: preferences.entities ?? [], entityAccounts: books.entityAccounts ?? {}, reminderDays: preferences.reminderDays, notifications: normalizeNotificationSettings(preferences.notifications), today: todayISO() }, date) : null;
  const archived = ref && ref.kind !== "trip" && archivedTableIds(preferences, ref.kind === "commitment" ? "commitments" : ref.kind === "loan" ? "loans" : "documents").has(ref.id);
  const failed = loadFailed(loadErrors, "payments", "loans", "documents", "settings", "accounts");
  const rows: [string, string][] = d ? [["Date", d.date], ["Status", `${d.status}${archived ? " · Archived" : ""}`], ["Amount", d.amount == null ? "—" : `${d.direction === "in" ? "+" : "−"}${money(d.amount)}`], ["Belongs to", d.owner], ...(d.account ? [["Account", d.account] as [string, string]] : []), ["Repeats", d.recurrence], ["Reminder", d.reminder.text], ["Snooze", d.snooze], ["Outside calendar", d.sync]] : [];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <p className="text-sm"><Link to="/plan" hash="payments" className="text-primary underline-offset-4 hover:underline">Calendar</Link> <span className="text-muted-foreground">/ Item</span></p>
      {failed && <LoadError what="some calendar records" onRetry={refresh} />}
      {!d ? (!failed && <div className="rounded-2xl border border-dashed p-6 text-sm"><p className="font-medium">This calendar item couldn't be found.</p><p className="text-muted-foreground">It may have been changed or the link is incomplete. Nothing has been deleted.</p><Link to="/plan" hash="payments" className="mt-2 inline-block text-primary underline">Back to the calendar</Link></div>) : <>
        <PageTitle eyebrow={d.kindLabel} title={d.title} />
        <section aria-label="Details" className="rounded-2xl border bg-card p-4">
          <dl className="divide-y text-sm">{rows.map(([k, v]) => <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="break-words">{v}</dd></div>)}</dl>
          <a href={d.source.href} className="mt-3 inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold text-primary">{d.source.label}</a>
        </section>
        {d.upcoming.length > 0 && <section aria-label="Next dates" className="rounded-2xl border bg-card p-4"><h2 className="mb-1 font-semibold">Next dates</h2><ul className="text-sm">{d.upcoming.map((x) => <li key={x} className="py-0.5 font-mono">{x}</li>)}</ul></section>}
        <p className="text-xs text-muted-foreground">Read-only. Change the amount, date or status from the source record.</p>
      </>}
    </div>
  );
}
