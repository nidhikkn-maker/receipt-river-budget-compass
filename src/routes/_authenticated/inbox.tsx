import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { PageTitle } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { InboxWork } from '@/components/InboxWork';
import { AccountStatementStatus } from '@/components/AccountStatementStatus';
import { useStore } from '@/lib/store';
import { inboxItems, INBOX_LABEL } from '@/lib/inbox';
import { useAudit, auditInboxItems } from '@/components/books/useAudit';
import { centreReview, reviewCounts, REVIEW_FILTERS, type ReviewFilter } from '@/lib/review-centre';
import { todayISO } from '@/lib/use-position';
import { money } from '@/lib/expenses';
import { applyReviewRules } from '@/lib/financial-review-intelligence';
import { listImportRules } from '@/lib/import-repository';
import type { ImportRule } from '@/lib/historical-import';
import { StatementInbox } from '@/components/StatementInbox';
import { FinancialInboxNav } from '@/components/FinancialInboxNav';
import { FinancialReview } from '@/components/FinancialReview';
import { ReviewHistory } from '@/components/ReviewHistory';
import { ExpenseDialog } from '@/components/ExpenseDialog';
import { DepreciationInboxCard } from '@/components/books/DepreciationInboxCard';
import type { Expense } from '@/lib/expenses';

export const Route = createFileRoute('/_authenticated/inbox')({
  validateSearch: (s: Record<string, unknown>): { section?: string; filter?: ReviewFilter } => typeof s['section'] === 'string' && ['statements','review','history'].includes(s['section']) ? { section: s['section'],...(typeof s['filter']==='string'&&s['filter'] in REVIEW_FILTERS?{filter:s['filter'] as ReviewFilter}:{}) } : {},
  head: () => ({ meta: [ { title: 'Financial Inbox — Ledgerline' }, { name: 'description', content: 'Review transactions, statement imports and financial reminders with separate, evidence-based counts.' }, { property: 'og:title', content: 'Financial Inbox — Ledgerline' }, { property: 'og:description', content: 'A clear overview of transactions and accounts requiring attention.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' } ] }),
  component: Inbox,
});
function Inbox() {
  const { section,filter } = Route.useSearch();
  const store = useStore();
  const today = todayISO();
  const audit = useAudit();
  const items = useMemo(() => [...inboxItems({ transactions: store.transactions, accounts: store.accounts, commitments: store.commitments, prefs: store.preferences, today, pendingCount: store.pendingCount }), ...auditInboxItems(audit)], [store.transactions, store.accounts, store.commitments, store.preferences, today, store.pendingCount, audit]);
  const [rules, setRules] = useState<ImportRule[]>([]);
  const [rulesError, setRulesError] = useState(false);
  useEffect(() => { let active = true; const load = () => { void listImportRules().then(r => { if (active) { setRules(r); setRulesError(false); } }).catch(() => { if (active) setRulesError(true); }); }; load(); window.addEventListener('focus', load); return () => { active = false; window.removeEventListener('focus', load); }; }, []);
  const categories = store.preferences.categories.filter(c => !c.archived).map(c => c.name);
  const rows = applyReviewRules(centreReview(items, store.transactions, store.accounts, categories), rules, categories);
  const counts = reviewCounts(rows);
  const [attention, setAttention] = useState<number | null>(null);
  const [open,setOpen]=useState<Expense|null>(null);
  const reminders = items.filter(i => !i.transactionId && !i.accountId && !store.preferences.inboxDismissed.includes(i.key));
  const cards: { label: string; count: number; filter: ReviewFilter }[] = [ { label: 'Need your attention', count: counts.transactions, filter: 'all' }, { label: 'Need a category', count: counts.category, filter: 'category' }, { label: 'Missing a detail', count: counts.missing, filter: 'missing' }, { label: 'Spending, income or a move between my accounts?', count: counts.type, filter: 'type' }, { label: 'Might be the same payment twice', count: counts.conflict, filter: 'conflict' } ];
  return <div className="journal-review space-y-5"><PageTitle eyebrow="Your review desk" title="Review" /><DepreciationInboxCard />
    <FinancialInboxNav active={section==='review'?'review':section==='history'?'history':'overview'} />
    {section === 'review' ? <FinancialReview items={items} onOpen={setOpen} initialFilter={filter??"all"} /> : section==='history' ? <ReviewHistory/> : section === 'statements' ? <section aria-label="Statements in Financial Inbox"><StatementInbox /></section> : <>
    <section aria-label="Transaction attention counts" className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">{cards.map(card => <Button asChild key={card.filter} variant="outline" className="h-auto min-h-[4.5rem] items-start justify-between whitespace-normal rounded-2xl p-3 text-left [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"><Link to="/inbox" search={{ section: 'review', filter: card.filter }}><span><span className="block text-xl font-semibold leading-tight tabular-nums">{card.count}</span><span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{card.label}</span></span><ArrowUpRight /></Link></Button>)}<Button asChild variant="outline" className="h-auto min-h-[4.5rem] items-start justify-between whitespace-normal rounded-2xl p-3 text-left [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"><Link to="/account-reconciliation"><span><span className="block text-xl font-semibold leading-tight tabular-nums">{attention ?? '—'}</span><span className="mt-0.5 block text-xs leading-snug text-muted-foreground">Accounts whose balance needs checking</span></span><ArrowUpRight /></Link></Button></section>
    <section aria-label="Review summary" className="rounded-2xl border bg-card p-4"><h2 className="text-base font-semibold">{counts.transactions === 0 ? 'Everything is organised' : `${counts.transactions} ${counts.transactions === 1 ? 'payment needs' : 'payments need'} your attention`}</h2><div className="mt-3 grid gap-2 sm:grid-cols-3" aria-label="Review groups"><Link to="/inbox" search={{section:'review',filter:'all'}} className="rounded-xl border p-3 text-sm"><b className="block">Needs your attention · {counts.transactions - counts.ready}</b><span className="text-xs text-muted-foreground">I couldn't decide these on my own.</span></Link><Link to="/inbox" search={{section:'review',filter:'confirmable'}} className="rounded-xl border p-3 text-sm"><b className="block">Ready to confirm · {counts.ready}</b><span className="text-xs text-muted-foreground">I've filled these in. Nothing saves until you confirm.</span></Link><Link to="/expenses" className="rounded-xl border p-3 text-sm"><b className="block">Already organised</b><span className="text-xs text-muted-foreground">Everything else is sorted and counted.</span></Link></div><p className="mt-1 text-sm text-muted-foreground">Who you paid and the organisation are optional, so they aren't counted here. Still to do:</p><div className="mt-2 flex flex-wrap gap-2">{([{f:'category',n:counts.category,l:'need a category'},{f:'missing',n:counts.missing,l:'missing a detail'},{f:'type',n:counts.type,l:'spending or a move?'},{f:'conflict',n:counts.conflict,l:'maybe counted twice'}] as const).map(x=><Button asChild key={x.f} size="sm" variant="outline" className="min-h-10"><Link to="/inbox" search={{section:'review',filter:x.f}}>{x.n} {x.l}<ArrowUpRight/></Link></Button>)}</div><p className="mt-2 text-sm text-muted-foreground">{counts.ready > 0 ? ` ${counts.ready} are ready to confirm in one step.` : ''}</p><p className="mt-1 text-xs text-muted-foreground">{counts.issues} unresolved issues · {counts.multiple} entries with more than one</p></section>
    <section aria-label="Recommended actions" className="space-y-2 border-y py-4"><h2 className="text-lg font-semibold">What to do next</h2>{[{count:counts.conflict,label:`Compare ${counts.conflict} possible double payment${counts.conflict===1?'':'s'}`,filter:'conflict' as const},{count:counts.type,label:`Tell me what ${counts.type} payment${counts.type===1?' was':'s were'}`,filter:'type' as const},{count:counts.missing,label:`Add ${counts.missing} missing detail${counts.missing===1?'':'s'}`,filter:'missing' as const},{count:counts.category,label:`Choose categories for ${counts.category}`,filter:'category' as const}].filter(a=>a.count>0).map(a=><Button asChild key={a.filter} variant="outline" className="mr-2 mb-2 h-auto min-h-10 whitespace-normal"><Link to="/inbox" search={{section:'review',filter:a.filter}}>{a.label}<ArrowUpRight/></Link></Button>)}<Button asChild variant="outline" className="h-auto min-h-10 whitespace-normal"><Link to="/inbox" search={{section:'review',filter:'confirmable'}}>Confirm {counts.ready} ready payment{counts.ready===1?'':'s'}<ArrowUpRight/></Link></Button></section>
    {rulesError && <p role="alert" className="text-sm text-warning">Your automatic sorting rules didn't load, so some suggestions may be missing. Your records are unaffected.<Button variant="ghost" size="sm" onClick={async () => { try { setRules(await listImportRules()); setRulesError(false); } catch { setRulesError(true); } }}>Retry rules</Button></p>}
    <InboxWork />
    <section className="border-t pt-5" aria-label="Other financial reminders"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Other financial reminders · {reminders.length}</h2><Button asChild variant="ghost" size="sm"><Link to="/account-reconciliation" search={{ section: 'reimbursements' }}>Reimbursements</Link></Button></div>{!reminders.length && <p className="text-sm text-muted-foreground">No other financial reminders.</p>}<ul className="divide-y">{reminders.map(i => <li key={i.key} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{i.title}</p><p className="text-xs text-muted-foreground">{INBOX_LABEL[i.type]} · {i.description}</p></div><div className="flex items-center gap-2">{i.amount != null && <span className="tabular-nums text-sm">{money(i.amount)}</span>}{i.commitmentId && <Button asChild size="sm" variant="outline"><Link to="/plan">Review payment</Link></Button>}</div></li>)}</ul></section>
    <details className="border-t pt-4"><summary className="cursor-pointer text-sm font-medium">Which statements back up each account</summary><div className="mt-4"><AccountStatementStatus onAttention={setAttention} /></div></details>
    </>}
    <ExpenseDialog expense={store.transactions.find(e=>e.id===open?.id)??null} onClose={()=>setOpen(null)}/>
  </div>;
}