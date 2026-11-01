import { Link } from '@tanstack/react-router';
import { Button } from './ui/button';
export function FinancialInboxNav({ active }: { active: 'overview' | 'review' | 'transfers' | 'accounts' | 'history' }) {
  return <nav className="grid grid-cols-2 gap-2 [&_a]:min-h-11 [&_a]:min-w-0 [&_a]:whitespace-normal sm:flex sm:flex-wrap" aria-label="Financial Inbox views">
    <Button asChild variant={active==='overview'?'default':'outline'}><Link to="/inbox">Overview</Link></Button>
    <Button asChild variant={active==='review'?'default':'outline'}><Link to="/inbox" search={{section:'review'}}>Smart Review</Link></Button>
    <Button asChild variant={active==='transfers'?'default':'outline'} className="h-auto min-h-10 whitespace-normal"><Link to="/transfers">Transfers & Card Payments</Link></Button>
    <Button asChild variant={active==='accounts'?'default':'outline'} className="h-auto min-h-10 whitespace-normal"><Link to="/account-reconciliation">Account Reconciliation</Link></Button>
    <Button asChild variant={active==='history'?'default':'outline'}><Link to="/inbox" search={{section:'history'}}>Review History</Link></Button>
  </nav>;
}