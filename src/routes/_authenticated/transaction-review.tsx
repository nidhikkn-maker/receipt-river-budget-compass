import { createFileRoute, redirect } from '@tanstack/react-router';
import { REVIEW_FILTERS, type ReviewFilter } from '@/lib/review-centre';

/** Review now has one home: Financial Inbox → Review. Old links keep working. */
export const Route = createFileRoute('/_authenticated/transaction-review')({
  beforeLoad: ({ search }) => { const f = (search as Record<string, unknown>)['filter']; throw redirect({ to: '/inbox', search: { section: 'review', ...(typeof f === 'string' && f in REVIEW_FILTERS ? { filter: f as ReviewFilter } : {}) }, replace: true }); },
  head: () => ({ meta: [{ title: 'Review in Financial Inbox — Ledgerline' }, { name: 'description', content: 'Transaction review now lives in Financial Inbox.' }, { property: 'og:title', content: 'Review in Financial Inbox — Ledgerline' }, { property: 'og:description', content: 'Transaction review now lives in Financial Inbox.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
});
