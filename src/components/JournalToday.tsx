import { Link } from '@tanstack/react-router';
import { Bell, CalendarClock, ChevronRight, CreditCard, Inbox, Plus, Search, Sparkles, Compass } from 'lucide-react';
import { money, type Expense } from '@/lib/expenses';
import { TXN_LABEL } from '@/lib/ledger';
import { ThapalSymbol } from './ThapalLogo';
import sunrise from '@/assets/companion-sunrise.jpg';

/** Opens the shell's in-place Smart Add sheet from anywhere on the page. */
import { openSmartAdd as openSmartAddEvent } from '@/lib/smart-add-event';
export const openSmartAdd = () => openSmartAddEvent();

/** "Krupanidhi Karunanithi" → "KK"; single names stay as the first name. */
export function shortName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return parts.slice(0, 2).map(p => p[0]!.toUpperCase()).join('');
  return parts[0] ?? '';
}
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length >= 2 ? parts.slice(0, 2).map(p => p[0]) : [parts[0]?.[0] ?? 'L']).join('').toUpperCase();
}
export function greetingFor(hour: number) { return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'; }

const friendlyDay = (iso: string, today: string) => {
  if (iso === today) return 'Today';
  const y = new Date(`${today}T12:00:00`); y.setDate(y.getDate() - 1);
  if (iso === y.toISOString().slice(0, 10)) return 'Yesterday';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};

type Action = { key: string; icon: typeof Inbox; title: string; sub: string; to?: string; onClick?: () => void };

export function JournalToday({ name, today, spending, periodLabel, safe, cardDue, estimated, unmatched, entries, upcoming }: {
  name: string; today: string; spending: number; periodLabel: string; safe: number | null; cardDue: number;
  estimated: boolean; unmatched: number; entries: Expense[];
  upcoming: { name: string; date: string; amount: number }[];
}) {
  const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 6);
  const who = shortName(name);
  const hour = new Date().getHours();
  const next = upcoming[0];

  // Up to three grounded next steps, each from saved records only.
  const actions: Action[] = [];
  actions.push(unmatched
    ? { key: 'review', icon: Inbox, title: `${unmatched} ${unmatched === 1 ? 'payment' : 'payments'} to check`, sub: 'Confirm what they were', to: '/inbox' }
    : { key: 'review', icon: Inbox, title: 'Nothing waiting for you', sub: 'Your review list is clear', to: '/inbox' });
  if (next) actions.push({ key: 'due', icon: CalendarClock, title: next.name, sub: `Due ${friendlyDay(next.date, today)} · ${money(next.amount)}`, to: '/plan' });
  if (cardDue > 0.005) actions.push({ key: 'cards', icon: CreditCard, title: 'Card balances to pay', sub: money(cardDue), to: '/wealth' });
  if (actions.length < 3) actions.push({ key: 'add', icon: Plus, title: 'Add a receipt or statement', sub: 'Photo, file, voice or a quick note', onClick: openSmartAdd });
  if (actions.length < 3) actions.push({ key: 'start', icon: Compass, title: 'See how Thapal works', sub: 'A two-minute guide', to: '/start' });

  const story = spending > 0
    ? `You've spent ${money(spending)} ${periodLabel}.${safe !== null ? ` Around ${money(safe)} looks free to spend${estimated ? ', as an estimate' : ''}.` : ''}`
    : `Nothing spent ${periodLabel} yet. Add a receipt or statement and your story begins here.`;
  const periodTitle = periodLabel === 'this month' ? new Date(`${today}T12:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : periodLabel.replace(/^in the /, '').replace(/^\w/, c => c.toUpperCase());

  return <div className="cmp-today">
    <section className="cmp-hero" aria-label="Greeting">
      <img src={sunrise} alt="" width={1536} height={1152} fetchPriority="high" />
      <div className="cmp-hero-bar">
        <Link to="/dashboard" aria-label="Thapal home" className="!w-auto !rounded-lg"><ThapalSymbol className="h-7 w-auto" /></Link>
        <span className="flex-1" />
        <Link to="/search" aria-label="Search"><Search className="size-5" /></Link>
        <Link to="/inbox" aria-label="Notifications"><Bell className="size-5" /></Link>
        <Link to="/auth" aria-label={name ? `Account: ${name}` : 'Account'} className="cmp-avatar">{initials(name || 'Thapal')}</Link>
      </div>
      <h1 className="cmp-greeting cmp-serif">{greetingFor(hour)}{who ? `, ${who}` : ''}</h1>
      <p className="cmp-greeting-sub">{new Date(`${today}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} · here's your day</p>
    </section>

    <div className="cmp-today-body">
      <div className="cmp-today-side">
        <section className="cmp-panel" aria-label="Today actions">
          <div className="cmp-panel-head"><h2 className="cmp-serif">Today</h2><span>{actions.length > 2 ? '3 things' : `${actions.length} things`}</span></div>
          {actions.slice(0, 3).map(a => {
            const body = <><span className="cmp-icon"><a.icon /></span><span className="min-w-0 flex-1"><b className="truncate">{a.title}</b><small className="truncate">{a.sub}</small></span><ChevronRight /></>;
            return a.to ? <Link key={a.key} to={a.to} className="cmp-row">{body}</Link> : <button key={a.key} type="button" onClick={a.onClick} className="cmp-row">{body}</button>;
          })}
        </section>
        <section className="cmp-panel" aria-label="Your money story">
          <div className="cmp-panel-head"><h2 className="cmp-serif">Your Money Story</h2><span>{periodTitle}</span></div>
          <div className="cmp-story"><p className="flex gap-2"><Sparkles className="mt-1 size-4 shrink-0 text-companion-gold" aria-hidden />{story}</p><Link to="/reports">See the full story <ChevronRight className="size-4" /></Link></div>
        </section>
      </div>

      <section className="cmp-panel cmp-today-main cmp-timeline" aria-label="Financial journal">
        <div className="cmp-panel-head"><h2 className="cmp-serif">Recent activity</h2><Link to="/expenses">View all</Link></div>
        {!recent.length && <p className="px-1 pb-4 text-sm cmp-muted">Nothing recorded yet. Tap + to add your first receipt.</p>}
        {recent.map((e, i) => <div key={e.id}>
          {(i === 0 || recent[i - 1]?.date !== e.date) && <p className="cmp-day">{friendlyDay(e.date, today)}</p>}
          <Link to="/new" search={{ edit: e.id }} className="cmp-row">
            <span className="min-w-0 flex-1"><b className="truncate">{e.merchant || e.title}</b><small className="truncate">{TXN_LABEL[e.txnType ?? 'expense']} · {e.category}</small></span>
            <span className="cmp-amount">{money(e.originalAmount ?? e.amount, e.currency)}</span>
          </Link>
        </div>)}
      </section>
    </div>
  </div>;
}
