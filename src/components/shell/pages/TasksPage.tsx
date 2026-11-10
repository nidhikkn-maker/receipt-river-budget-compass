import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Clock, FileStack, Inbox, ListChecks, PenLine } from "lucide-react";
import { useStore } from "@/lib/store";
import { addDays } from "@/lib/planning";
import { todayISO, usePosition } from "@/lib/use-position";
import { PageHeader } from "../PageHeader";
import { EmptyState } from "../States";
import { useAttention } from "../shell-facts";

/**
 * To-do (§5.2 /tasks): one list of what needs the owner, each row opening today's Financial Inbox section
 * (review, statements, reminders, history) or the calendar. Counts use the Inbox's own rules on the records
 * loaded here; nothing is stored, so they clear as soon as the records are fixed.
 */
export function SignatureTasks() {
  const { pendingCount } = useStore();
  const attention = useAttention();
  const pos = usePosition(30);
  const week = addDays(todayISO(), 7);
  const dueSoon = pos.upcoming.filter((u) => u.date <= week && u.direction === "out");
  const overdue = pos.upcoming.filter((u) => u.overdue).length;
  const rows = [
    { key: "review", icon: <ListChecks />, title: "Needs your review", detail: attention.review ? `${attention.review} record${attention.review === 1 ? "" : "s"} · category, missing details, possible duplicates` : "Nothing waiting", count: attention.review, link: (c: ReactNode) => <Link to="/inbox" search={{ section: "review" }} className="sf-task-row">{c}</Link> },
    { key: "statements", icon: <FileStack />, title: "Statements and balances", detail: attention.statements ? `${attention.statements} account check${attention.statements === 1 ? "" : "s"} · balances and statement imports` : "All accounts checked", count: attention.statements, link: (c: ReactNode) => <Link to="/inbox" search={{ section: "statements" }} className="sf-task-row">{c}</Link> },
    { key: "reminders", icon: <Inbox />, title: "Reminders", detail: attention.reminders ? `${attention.reminders} reminder${attention.reminders === 1 ? "" : "s"} from your records` : "No reminders", count: attention.reminders, link: (c: ReactNode) => <Link to="/inbox" className="sf-task-row">{c}</Link> },
    { key: "due", icon: <CalendarDays />, title: "Due this week", detail: dueSoon.length ? `${dueSoon.length} payment${dueSoon.length === 1 ? "" : "s"}${overdue ? ` · ${overdue} overdue` : ""}` : "Nothing due in the next 7 days", count: dueSoon.length, link: (c: ReactNode) => <Link to="/calendar" className="sf-task-row">{c}</Link> },
    { key: "sync", icon: <PenLine />, title: "Waiting to sync", detail: pendingCount ? `${pendingCount} entr${pendingCount === 1 ? "y" : "ies"} saved on this device` : "Everything is saved", count: pendingCount, link: (c: ReactNode) => <Link to="/sync-queue" className="sf-task-row">{c}</Link> },
  ];
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="sf-page">
      <PageHeader overline="What needs you" title="To-do" description="Only unmatched or uncertain records need you. Nothing changes until you confirm."
        actions={<Link to="/inbox" className="sf-btn sf-btn-deep">Open Financial Inbox<ArrowRight aria-hidden /></Link>} />
      {total === 0 && <EmptyState title="You're up to date" hint="New statements, receipts and reminders will appear here when they need you." className="mb-6" />}
      <ul className="sf-rows sf-task-list">
        {rows.map((r) => {
          const children = <>
            <span className="sf-tile" aria-hidden>{r.icon}</span>
            <span className="min-w-0 flex-1"><b>{r.title}</b><small>{r.detail}</small></span>
            {r.count > 0 && <span className="sf-count" aria-label={`${r.count} items`}>{r.count}</span>}
            <ArrowRight aria-hidden className="sf-row-chevron" />
          </>;
          return <li key={r.key}>{r.link(children)}</li>;
        })}
      </ul>
      <p className="sf-footnote"><Clock aria-hidden className="inline size-4" /> Finished items move to <Link to="/inbox" search={{ section: "history" }} className="sf-link">review history</Link>.</p>
    </div>
  );
}
