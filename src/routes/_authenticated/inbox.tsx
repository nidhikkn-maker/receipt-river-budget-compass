import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { PageTitle } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { InboxWork } from '@/components/InboxWork';
import { AccountStatementStatus } from '@/components/AccountStatementStatus';
import { useStore } from '@/lib/store';
import { inboxItems, INBOX_LABEL } from '@/lib/inbox';
import { centreReview, reviewCounts, type ReviewFilter } from '@/lib/review-centre';
import { todayISO } from '@/lib/use-position';
import { money } from '@/lib/expenses';
import { applyReviewRules } from '@/lib/financial-review-intelligence';
import { listImportRules } from '@/lib/import-repository';
import type { ImportRule } from '@/lib/historical-import';

export const Route = createFileRoute('/_authenticated/inbox')({
  head: () => ({ meta: [ { title: 'Financial Inbox — Ledgerline' }, { name: 'description', content: 'Review transactions, statement imports and financial reminders with separate, evidence-based counts.' }, { property: 'og:title', content: 'Financial Inbox — Ledgerline' }, { property: 'og:description', content: 'A clear overview of transactions and accounts requiring attention.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' } ] }),
  component: Inbox,
});
function Inbox() {
  const store = useStore();
  const today = todayISO();
  const items = useMemo(() => inboxItems({ transactions: store.transactions, accounts: store.accounts, commitments: store.commitments, prefs: store.preferences, today, pendingCount: store.pendingCount }), [store.transactions, store.accounts, store.commitments, store.preferences, today, store.pendingCount]);
  const [rules, setRules] = useState<ImportRule[]>([]);
  useEffect(() => { let active = true; void listImportRules().then(r => { if (active) setRules(r); }).catch(() => {}); return () => { active = false; }; }, []);
  const categories = store.preferences.categories.filter(c => !c.archived).map(c => c.name);
  const rows = applyReviewRules(centreReview(items, store.transactions, store.accounts, categories), rules, categories);
  const counts = reviewCounts(rows);
  const [attention, setAttention] = useState<number | null>(null);
  const reminders = items.filter(i => !i.transactionId && !i.accountId && !store.preferences.inboxDismissed.includes(i.key));
  const cards: { label: string; count: number; filter: ReviewFilter }[] = [ { label: 'Transactions needing review', count: counts.transactions, filter: 'all' }, { label: 'Categorisation required', count: counts.category, filter: 'category' }, { label: 'Missing information', count: counts.missing, filter: 'missing' }, { label: 'Financial type confirmation', count: counts.type, filter: 'type' }, { label: 'Possible duplicates', count: counts.conflict, filter: 'conflict' } ];
  return <div className="space-y-6"><PageTitle eyebrow="Needs attention" title="Financial Inbox" />
    <nav className="flex flex-wrap gap-2" aria-label="Financial Inbox views"><Button asChild><Link to="/transaction-review" search={{ filter: 'all' }}>Review transactions<ArrowUpRight /></Link></Button><Button asChild variant="outline"><Link to="/account-reconciliation">Account reconciliation</Link></Button><Button asChild variant="ghost"><Link to="/travel-inbox">Travel Inbox</Link></Button></nav>
    <section aria-label="Transaction attention counts" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map(card => <Button asChild key={card.filter} variant="outline" className="h-auto min-h-24 justify-between whitespace-normal p-4 text-left"><Link to="/transaction-review" search={{ filter: card.filter }}><span><span className="block text-2xl font-semibold tabular-nums">{card.count}</span><span className="text-sm">{card.label}</span></span><ArrowUpRight /></Link></Button>)}<Button asChild variant="outline" className="h-auto min-h-24 justify-between whitespace-normal p-4 text-left"><Link to="/account-reconciliation"><span><span className="block text-2xl font-semibold tabular-nums">{attention ?? '—'}</span><span className="text-sm">Accounts needing reconciliation</span></span><ArrowUpRight /></Link></Button></section>
    <p className="text-sm text-muted-foreground">{counts.transactions} unique transactions · {counts.issues} unresolved issues · {counts.multiple} transactions with multiple issues</p>
    <InboxWork />
    <section className="border-t pt-5" aria-label="Other financial reminders"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Other financial reminders · {reminders.length}</h2><Button asChild variant="ghost" size="sm"><Link to="/account-reconciliation" search={{ section: 'reimbursements' }}>Reimbursements</Link></Button></div>{!reminders.length && <p className="text-sm text-muted-foreground">No other financial reminders.</p>}<ul className="divide-y">{reminders.map(i => <li key={i.key} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{i.title}</p><p className="text-xs text-muted-foreground">{INBOX_LABEL[i.type]} · {i.description}</p></div><div className="flex items-center gap-2">{i.amount != null && <span className="tabular-nums text-sm">{money(i.amount)}</span>}{i.commitmentId && <Button asChild size="sm" variant="outline"><Link to="/plan">Review payment</Link></Button>}</div></li>)}</ul></section>
    <details className="border-t pt-4"><summary className="cursor-pointer text-sm font-medium">Account evidence summary</summary><div className="mt-4"><AccountStatementStatus onAttention={setAttention} /></div></details>
  </div>;
}