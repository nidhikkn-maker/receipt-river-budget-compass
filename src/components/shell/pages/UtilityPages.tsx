import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Bell, Camera, FileStack, FileUp, Mic, Package, Plane } from "lucide-react";
import { PlanCalendar } from "@/components/PlanCalendar";
import { usePosition } from "@/lib/use-position";
import { openSmartAdd } from "@/lib/smart-add-event";
import type { Alert } from "@/lib/position";
import { PageHeader } from "../PageHeader";
import { EmptyState, ProposedBadge } from "../States";

/** B03 Calendar: today's PlanCalendar (month and agenda; each item opens its source) inside the new frame. */
export function SignatureCalendar() {
  return (
    <div className="sf-page">
      <PageHeader overline="Month and agenda" title="Calendar" description="Bills, EMIs, card due dates, expected income and document dates in one place. Tap a day to see what is due." />
      <div className="sf-embedded"><PlanCalendar /></div>
    </div>
  );
}

const GROUPS: { level: Alert["level"]; title: string }[] = [
  { level: "high", title: "Needs action" },
  { level: "medium", title: "Coming due" },
  { level: "info", title: "For your information" },
];

/**
 * B05 Notifications — PROPOSED. A notification centre (read/unread, snooze, delivery history) does not exist
 * yet; Track C builds it. Until then this page lists the alerts Thapal already derives from records
 * (position.ts), each opening its source, and says plainly that the rest is proposed.
 */
export function SignatureNotifications() {
  const pos = usePosition(30);
  return (
    <div className="sf-page">
      <PageHeader overline="Activity and alerts" title="Notifications" description="Alerts worked out from your scheduled payments, cards, balances and budgets. Each one opens where it came from." />
      <div className="sf-proposed-note" role="note">
        <ProposedBadge />
        <p><b>The full notification centre is proposed.</b> Read and unread, snooze, grouping by workspace and delivery history are not built yet. What you see below is real and comes from your records.</p>
      </div>
      {pos.alerts.length === 0 ? <EmptyState title="No alerts right now" hint="Overdue payments, cards close to their limit and budgets nearly used will appear here." />
        : GROUPS.map((g) => {
          const list = pos.alerts.filter((a) => a.level === g.level);
          if (!list.length) return null;
          return (
            <section key={g.level} className="sf-section" aria-label={g.title}>
              <h2 className="sf-overline">{g.title} · {list.length}</h2>
              <ul className="sf-rows">{list.map((a, i) => (
                <li key={`${a.text}-${i}`}><Link to={a.to} className="sf-list-row"><span className="sf-tile" aria-hidden><Bell /></span><span className="min-w-0 flex-1"><b className="block">{a.text}</b></span><ArrowRight aria-hidden className="sf-row-chevron" /></Link></li>
              ))}</ul>
            </section>
          );
        })}
      <p className="sf-footnote">Phone notifications and reminders are set in <Link to="/settings" className="sf-link">Settings</Link>.</p>
    </div>
  );
}

/**
 * /add: opens the existing Smart Add sheet straight away (the same one the Add button opens). The page behind
 * it offers the same starting points, so closing the sheet never leaves an empty screen.
 */
export function SignatureAdd() {
  // After the shell has mounted its listener (parent effects run after this one on a direct visit).
  useEffect(() => { const t = setTimeout(() => openSmartAdd(), 0); return () => clearTimeout(t); }, []);
  return (
    <div className="sf-page">
      <PageHeader overline="Smart Add · Intelligent Canvas" title="Add anything. Effortlessly." description="Give Thapal a receipt, statement, travel booking or asset register. Your source stays visible for checking, and nothing is saved until you confirm." />
      <div className="sf-module-grid">
        <button type="button" className="sf-module-row" onClick={() => openSmartAdd()}><span className="sf-tile" aria-hidden><Camera /></span><span className="min-w-0 flex-1"><b>Receipt or bill</b><small>Photo, scan or file</small></span><ArrowRight aria-hidden className="sf-row-chevron" /></button>
        <Link to="/statements" className="sf-module-row"><span className="sf-tile" aria-hidden><FileStack /></span><span className="min-w-0 flex-1"><b>Statement</b><small>Bank or card statement, in Statement Desk</small></span><ArrowRight aria-hidden className="sf-row-chevron" /></Link>
        <Link to="/travel-inbox" className="sf-module-row"><span className="sf-tile" aria-hidden><Plane /></span><span className="min-w-0 flex-1"><b>Travel booking</b><small>Tickets and hotel confirmations</small></span><ArrowRight aria-hidden className="sf-row-chevron" /></Link>
        <button type="button" className="sf-module-row" onClick={() => openSmartAdd("assets")}><span className="sf-tile" aria-hidden><Package /></span><span className="min-w-0 flex-1"><b>Asset register</b><small>Things you own and their invoices</small></span><ArrowRight aria-hidden className="sf-row-chevron" /></button>
        <button type="button" className="sf-module-row" onClick={() => openSmartAdd("document")}><span className="sf-tile" aria-hidden><FileUp /></span><span className="min-w-0 flex-1"><b>Any document</b><small>Kept in DocuRepo and linked to its records</small></span><ArrowRight aria-hidden className="sf-row-chevron" /></button>
        <button type="button" className="sf-module-row" onClick={() => openSmartAdd()}><span className="sf-tile" aria-hidden><Mic /></span><span className="min-w-0 flex-1"><b>Describe it by voice</b><small>Choose Voice Entry in Smart Add</small></span><ArrowRight aria-hidden className="sf-row-chevron" /></button>
      </div>
    </div>
  );
}
