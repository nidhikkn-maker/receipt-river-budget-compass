import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { PageTitle } from '@/components/AppShell';
import { FinancialReview } from '@/components/FinancialReview';
import { ExpenseDialog } from '@/components/ExpenseDialog';
import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/store';
import { inboxItems } from '@/lib/inbox';
import { REVIEW_FILTERS, type ReviewFilter } from '@/lib/review-centre';
import type { Expense } from '@/lib/expenses';
import { todayISO } from '@/lib/use-position';
export const Route = createFileRoute('/_authenticated/transaction-review')({
  validateSearch: (s: Record<string, unknown>): { filter: ReviewFilter } => ({ filter: typeof s.filter === 'string' && s.filter in REVIEW_FILTERS ? s.filter as ReviewFilter : 'all' }),
  head: () => ({ meta: [{ title: 'Transaction Review Centre — Ledgerline' }, { name: 'description', content: 'Select and review transaction classifications with exact previews and explicit bulk confirmation.' }, { property: 'og:title', content: 'Transaction Review Centre — Ledgerline' }, { property: 'og:description', content: 'Guided transaction selection, evidence and audited corrections.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: ReviewCentre,
});
function ReviewCentre() {
  const store = useStore(), { filter } = Route.useSearch();
  const [open, setOpen] = useState<Expense | null>(null);
  const items = inboxItems({ transactions: store.transactions, accounts: store.accounts, commitments: store.commitments, prefs: store.preferences, today: todayISO(), pendingCount: store.pendingCount });
  return <div className="space-y-4 pb-24"><Button asChild variant="ghost" size="sm"><Link to="/inbox">← Financial Inbox</Link></Button><PageTitle title="Transaction Review" /><FinancialReview items={items} onOpen={setOpen} initialFilter={filter} /><ExpenseDialog expense={store.transactions.find(t => t.id === open?.id) ?? null} onClose={() => setOpen(null)} /></div>;
}