import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, ChevronRight, CircleDot, FileStack, Plane, Plus, Rows3, Columns4, Sparkles } from "lucide-react";
import { useNetWorth } from "@/components/books/useBooks";
import { useStore } from "@/lib/store";
import { money, SCOPE_LABEL } from "@/lib/expenses";
import { loadFailed } from "@/lib/load-state";
import { cardPaymentSummary } from "@/lib/cards";
import { todayISO, usePosition } from "@/lib/use-position";
import { openSmartAdd } from "@/lib/smart-add-event";
import { EmptyState, ErrorState, StaleState } from "../States";
import { dayOfMonth, greeting, longDate, monthAbbr, shortDate, useAttention, wholeRupees } from "../shell-facts";

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

interface ComingUp { name: string; date: string; amount: number; direction: "in" | "out"; overdue?: boolean }
/** The word under a Coming up amount (KK decision 4): what the figure is. */
export const amountCaption = (u: ComingUp, today: string) => (u.direction === "in" ? "Expected" : u.overdue ? "Overdue" : u.date === today ? "Due today" : "Due");
/** One spoken sentence per Coming up row, e.g. "SIP. Payment ₹25,000.00 due 11 Nov." */
export function comingUpLabel(u: ComingUp, today: string): string {
  const when = shortDate(u.date, false);
  const what = u.direction === "in" ? `Money in ${money(u.amount)} expected ${when}` : u.overdue ? `Payment ${money(u.amount)} overdue since ${when}` : u.date === today ? `Payment ${money(u.amount)} due today` : `Payment ${money(u.amount)} due ${when}`;
  return `${u.name}. ${what}.`;
}

/**
 * B01 Home in the Signature Flow layout (captures 01 and 02), built only from existing figures:
 * net worth from useNetWorth (the same engine as today's Home card), cash/cards/upcoming/alerts from
 * position.ts, attention counts from the Financial Inbox rules, and recent entries from the ledger.
 */
export function SignatureHome() {
  const { name, transactions, accounts, preferences, loadErrors, syncState, lastSyncedAt, refresh } = useStore();
  const nw = useNetWorth();
  const pos = usePosition(30);
  const attention = useAttention();
  const today = todayISO();
  const now = new Date();
  const scopeLabel = preferences.homeScope === "all" ? "All spaces" : SCOPE_LABEL[preferences.homeScope];
  const first = firstName(name);
  const hasAccounts = accounts.some((a) => !a.archived);
  // Statement amount due, payment status and total outstanding are separate facts (cards.ts cardPaymentSummary).
  const cardPay = cardPaymentSummary(pos.cards.map((c) => c.cycle));
  const cardStatus = cardPay.state === "overdue" ? `${cardPay.partlyPaid ? "Partly paid · " : ""}Overdue since ${shortDate(cardPay.dueDate, false)}`
    : cardPay.state === "partly_paid" ? `Partly paid · Due ${shortDate(cardPay.dueDate, false)}`
    : cardPay.state === "due" ? (cardPay.dueDate ? `Due ${shortDate(cardPay.dueDate, false)}` : "Due date not recorded")
    : cardPay.state === "paid" ? "Paid"
    : cardPay.state === "nothing_due" ? "Nothing due on the statement"
    : cardPay.state === "not_recorded" ? "Statement not recorded"
    : "Nothing outstanding";
  const cardNotes = [
    cardPay.minimumDue != null ? `${wholeRupees(cardPay.minimumDue)} minimum due` : null,
    cardPay.outstanding > 0 ? `${wholeRupees(cardPay.outstanding)} outstanding` : null,
    cardPay.notRecorded && cardPay.state !== "not_recorded" ? `statement not recorded for ${cardPay.notRecorded} card${cardPay.notRecorded === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");
  const upcoming = pos.upcoming.slice(0, 4);
  const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const accountName = (id: string | null | undefined) => accounts.find((a) => a.id === id)?.name ?? null;
  const failed = loadFailed(loadErrors, "transactions", "accounts");
  const asOf = [nw.recordsAsOf && `balances to ${shortDate(nw.recordsAsOf)}`, nw.pricesAsOf && `prices ${shortDate(nw.pricesAsOf)}`].filter(Boolean).join(" · ");
  const top = pos.alerts.find((a) => a.level === "high");
  const next = top ? { title: top.text, detail: "From your scheduled payments, cards and balances", to: top.to, cta: "Review now" }
    : attention.review > 0 ? { title: `${attention.review} record${attention.review === 1 ? "" : "s"} need your review`, detail: "Only unmatched or uncertain records · nothing changes until you confirm", to: "/inbox", search: { section: "review" }, cta: "Review now" }
    : pos.reimbursements.pendingCount > 0 ? { title: `${pos.reimbursements.pendingCount} reimbursement${pos.reimbursements.pendingCount === 1 ? "" : "s"} waiting`, detail: `${money(pos.reimbursements.pendingAmount)} still to come back`, to: "/claim-submission", cta: "Open claims" }
    : null;

  return (
    <div className="sf-page sf-home">
      <header className="sf-home-head">
        <div className="min-w-0">
          <p className="sf-overline">{longDate(now)} · {scopeLabel}</p>
          <h1 className="sf-hero-title">{greeting(now.getHours())}{first ? `, ${first}` : ""}.</h1>
          <p className="sf-lede">A clearer picture of everything that matters.</p>
        </div>
        <div className="sf-page-actions">
          <Link to="/calendar" className="sf-btn sf-btn-outline sf-hide-phone"><CalendarDays aria-hidden />Calendar</Link>
          <button type="button" className="sf-btn sf-btn-deep" onClick={() => openSmartAdd()}><Plus aria-hidden />Smart Add</button>
        </div>
      </header>

      {failed && <ErrorState what="your accounts and transactions" onRetry={refresh} note="Nothing has been deleted. The figures below may be incomplete until they load." className="mb-6" />}
      {syncState === "offline" && <StaleState asOf={lastSyncedAt ? shortDate(lastSyncedAt.slice(0, 10)) : null} className="mb-6" />}

      <div className="sf-home-grid">
        <section className="sf-worth" aria-labelledby="sf-worth-label">
          <p id="sf-worth-label" className="sf-overline sf-on-deep">Your estimated net worth · all accounts</p>
          <p className="sf-worth-figure financial-amount" title={money(nw.net)}>{hasAccounts ? wholeRupees(nw.net) : "—"}</p>
          <p className="sf-worth-note"><CircleDot aria-hidden /><b>Account-linked view</b>{asOf ? ` · ${asOf}` : " · add an account or statement to begin"}</p>
          {nw.quality.length > 0 && <p className="sf-worth-note sf-worth-quality">{nw.quality[0]}</p>}
          <dl className="sf-worth-metrics">
            <div><dt>Available money</dt><dd className="financial-amount" title={money(pos.cash)}>{hasAccounts ? wholeRupees(pos.cash) : "—"}</dd><dd className="sf-worth-sub">From recorded balances</dd></div>
            <div data-card-state={cardPay.state}><dt>Card payment</dt><dd className="financial-amount" title={cardPay.state === "not_recorded" ? "Statement not recorded" : `Statement amount due ${money(cardPay.amountDue)}`}>{cardPay.state === "not_recorded" ? "—" : wholeRupees(cardPay.amountDue)}</dd><dd className="sf-worth-sub">{cardPay.state === "overdue" ? <b className="sf-worth-overdue">{cardStatus}</b> : cardStatus}{cardNotes ? ` · ${cardNotes}` : ""}</dd></div>
            <div><dt>Needs attention</dt><dd>{attention.total} item{attention.total === 1 ? "" : "s"}</dd><dd className="sf-worth-sub">{attention.review} to review{pos.reimbursements.pendingCount ? ` · ${pos.reimbursements.pendingCount} claim${pos.reimbursements.pendingCount === 1 ? "" : "s"}` : ""}</dd></div>
          </dl>
          <div className="sf-worth-actions">
            <Link to="/money" className="sf-btn sf-btn-light">Explore your money<ArrowRight aria-hidden /></Link>
            <Link to="/report-centre" className="sf-btn sf-btn-ghost-deep">Reports & downloads</Link>
          </div>
        </section>

        <section className="sf-coming" aria-labelledby="sf-coming-title">
          <div className="sf-section-head"><h2 id="sf-coming-title">Coming up</h2><Link to="/calendar" className="sf-link">Full calendar<ChevronRight aria-hidden /></Link></div>
          {upcoming.length === 0 ? <EmptyState title="Nothing due in the next 30 days" hint="Bills, EMIs and expected income you add in Plan appear here." action={<Link to="/plan" className="sf-link">Add a scheduled payment<ArrowRight aria-hidden /></Link>} />
            : <ul className="sf-rows">{upcoming.map((u, i) => (
              <li key={`${u.date}-${u.name}-${i}`}>
                <Link to="/calendar" className="sf-date-row" aria-label={comingUpLabel(u, today)}>
                  <span className="sf-date" aria-hidden><small>{monthAbbr(u.date)}</small><b>{dayOfMonth(u.date)}</b></span>
                  <span className="min-w-0 flex-1" aria-hidden><b className="block sf-clamp-2">{u.name}</b><small className="block truncate">{u.direction === "in" ? "Money in" : "Payment"}{u.overdue ? " · overdue" : u.date === today ? " · today" : ""}</small></span>
                  <span className="sf-coming-amount" aria-hidden><span className="sf-row-amount financial-amount">{money(u.amount)}</span><small>{amountCaption(u, today)}</small></span>
                  <ChevronRight aria-hidden className="sf-row-chevron" />
                </Link>
              </li>))}</ul>}
        </section>
      </div>

      <section className="sf-next" aria-label="Suggested next step">
        <span className="sf-next-icon" aria-hidden><Sparkles /></span>
        <div className="min-w-0 flex-1">
          <p className="sf-next-title">Suggested next step</p>
          <p className="sf-next-detail">{next ? `${next.title} · ${next.detail}` : "You're up to date. Add a receipt or statement whenever you have one."}</p>
        </div>
        {next ? <Link to={next.to} {...("search" in next ? { search: next.search } : {})} className="sf-btn sf-btn-deep">{next.cta}<ArrowRight aria-hidden /></Link>
          : <button type="button" className="sf-btn sf-btn-deep" onClick={() => openSmartAdd()}>Smart Add<ArrowRight aria-hidden /></button>}
      </section>

      <div className="sf-home-lower">
        <section aria-labelledby="sf-recent-title">
          <div className="sf-section-head"><h2 id="sf-recent-title">Recent activity</h2><Link to="/expenses" className="sf-link">All activity<ChevronRight aria-hidden /></Link></div>
          {recent.length === 0 ? (failed ? <ErrorState what="recent activity" onRetry={refresh} /> : <EmptyState title="No entries yet" hint="Add a receipt or upload a statement to see activity here." />)
            : <ul className="sf-rows">{recent.map((t) => {
              const type = t.txnType ?? "expense";
              const sign = type === "income" || type === "refund" || type === "reimbursement" ? "+" : type === "transfer" ? "" : "−";
              return <li key={t.id}><Link to="/expenses" className="sf-list-row">
                <span className="min-w-0 flex-1"><b className="block truncate">{t.merchant || t.title}</b><small className="block truncate">{shortDate(t.date, false)}{accountName(t.accountId) ? ` · ${accountName(t.accountId)}` : ""} · {type === "expense" ? t.category : type}</small></span>
                <span className={"sf-row-amount financial-amount" + (sign === "+" ? " sf-positive" : "")}>{sign}{money(Math.abs(t.amount))}</span>
              </Link></li>;
            })}</ul>}
        </section>
        <section aria-labelledby="sf-done-title">
          <div className="sf-section-head"><h2 id="sf-done-title">Simply get things done</h2><Link to="/tasks" className="sf-link">All tasks<ChevronRight aria-hidden /></Link></div>
          <ul className="sf-rows">
            <li><Link to="/statements" className="sf-list-row"><span className="sf-tile" aria-hidden><FileStack /></span><span className="min-w-0 flex-1"><b>Statement Desk</b><small>Upload and check bank and card statements</small></span><ChevronRight aria-hidden className="sf-row-chevron" /></Link></li>
            <li><Link to="/trips" className="sf-list-row"><span className="sf-tile" aria-hidden><Plane /></span><span className="min-w-0 flex-1"><b>Travel</b><small>Trips, receipts and claims</small></span><ChevronRight aria-hidden className="sf-row-chevron" /></Link></li>
            <li><Link to="/records" className="sf-list-row"><span className="sf-tile" aria-hidden><Rows3 /></span><span className="min-w-0 flex-1"><b>Records</b><small>Documents, assets and investments</small></span><ChevronRight aria-hidden className="sf-row-chevron" /></Link></li>
            <li><Link to="/reports" className="sf-list-row"><span className="sf-tile" aria-hidden><Columns4 /></span><span className="min-w-0 flex-1"><b>Reports</b><small>Spending insights and exports</small></span><ChevronRight aria-hidden className="sf-row-chevron" /></Link></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
