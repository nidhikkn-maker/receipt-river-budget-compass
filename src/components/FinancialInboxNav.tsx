import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';

type View = 'overview' | 'review' | 'transfers' | 'accounts' | 'history';
const tab = (on: boolean) => cn(
  'inline-flex h-10 shrink-0 snap-start items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium transition active:scale-[0.98]',
  on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-accent',
);

/** One scrolling row of short, equal-height tabs so the Inbox views never wrap or crowd the page. */
export function FinancialInboxNav({ active }: { active: View }) {
  return (
    <nav aria-label="Financial Inbox views" className="-mx-4 mb-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
      <Link to="/inbox" className={tab(active === 'overview')}>Overview</Link>
      <Link to="/inbox" search={{ section: 'review' }} className={tab(active === 'review')}>Review</Link>
      <Link to="/transfers" className={tab(active === 'transfers')}>Transfers</Link>
      <Link to="/account-reconciliation" className={tab(active === 'accounts')}>Reconcile</Link>
      <Link to="/inbox" search={{ section: 'history' }} aria-label="Review History" className={tab(active === 'history')}>History</Link>
      <Link to="/inbox" search={{ section: 'statements' }} className={tab(false)}>Matched statements</Link>
      <Link to="/statements" className={tab(false)}>Statement Desk</Link>
      <Link to="/statement-accounts" className={tab(false)}>Coverage</Link>
      <Link to="/travel-inbox" className={tab(false)}>Travel</Link>
    </nav>
  );
}
