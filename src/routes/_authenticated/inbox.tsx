import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InboxWork } from '@/components/InboxWork';
import { AccountStatementStatus } from '@/components/AccountStatementStatus';
import { useStore } from '@/lib/store';
import { inboxItems } from '@/lib/inbox';
import { useAudit, auditInboxItems } from '@/components/books/useAudit';
import { centreReview, matchesReview, reviewCounts, REVIEW_FILTERS, type ReviewFilter } from '@/lib/review-centre';
import { groupReminders } from '@/lib/review-reminders';
import { toast } from 'sonner';
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
import { CompanionReview } from '@/components/CompanionReview';
import type { Expense } from '@/lib/expenses';
import { UnreadableRecordsNotice } from "@/components/UnreadableRecordsNotice";


export const Route = createFileRoute('/_authenticated/inbox')({
  validateSearch: (s: Record<string, unknown>): { section?: string; filter?: ReviewFilter } => typeof s['section'] === 'string' && ['statements','review','history'].includes(s['section']) ? { section: s['section'],...(typeof s['filter']==='string'&&s['filter'] in REVIEW_FILTERS?{filter:s['filter'] as ReviewFilter}:{}) } : {},
  head: () => ({ meta: [ { title: 'Financial Inbox — Thapal' }, { name: 'description', content: 'Review transactions, statement imports and financial reminders with separate, evidence-based counts.' }, { property: 'og:title', content: 'Financial Inbox — Thapal' }, { property: 'og:description', content: 'A clear overview of transactions and accounts requiring attention.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' } ] }),
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
  const restore = async (key: string) => { try { await store.savePreferences({ ...store.preferences, inboxDismissed: store.preferences.inboxDismissed.filter(k => k !== key) }); toast.success('Brought back to Needs checking'); } catch (e) { toast.error((e as Error).message); } };
  const unique = [...new Map(rows.map(r => [r.transaction.id, r])).values()];
  const fixes = ([{ filter: 'category', label: 'Need a category', one: 'Needs a category', action: 'Choose' }, { filter: 'missing', label: 'Missing a detail', one: 'Missing a detail', action: 'Add' }, { filter: 'type', label: 'Spending or a move?', one: 'Spending or a move between my accounts?', action: 'Decide' }, { filter: 'conflict', label: 'Might be paid twice', one: 'Might be the same payment twice', action: 'Compare' }] as const)
    .map(f => ({ ...f, rows: unique.filter(r => matchesReview(r, f.filter)), count: counts[f.filter] })).filter(f => f.count > 0);
  const reminderGroups = groupReminders(reminders);
  return <div className="journal-review space-y-5"><header className="cmp-page-head pt-2"><h1 className="cmp-serif">Review</h1><p>Things to check, newest first. Nothing changes until you confirm.</p></header><DepreciationInboxCard />
    {section && <FinancialInboxNav active={section==='review'?'review':section==='history'?'history':'overview'} />}
    {section === 'review' ? <FinancialReview items={items} onOpen={setOpen} initialFilter={filter??"all"} /> : section==='history' ? <ReviewHistory/> : section === 'statements' ? <section aria-label="Statements in Financial Inbox"><StatementInbox /></section> : <>
    <CompanionReview rows={rows} transactions={store.transactions} dismissed={items.filter(i => store.preferences.inboxDismissed.includes(i.key))} today={today} onOpen={setOpen} onRestore={restore} />
    {fixes.length > 0 && <section aria-label="Quick fixes" className="cmp-section"><h2 className="cmp-section-title">Quick fixes</h2><div className="cmp-panel !p-1.5">{fixes.map(f => <div key={f.filter}>
      {f.rows.length > 0 && f.rows.length <= 3 ? f.rows.map(r => <button key={`${f.filter}-${r.transaction.id}`} type="button" className="cmp-row" onClick={() => setOpen(r.transaction)}><span className="min-w-0 flex-1"><b className="truncate">{r.transaction.merchant || r.transaction.title}</b><small className="truncate">{f.one} · {money(r.transaction.originalAmount ?? r.transaction.amount, r.transaction.currency)}</small></span><span className="cmp-fix-action">{f.action}</span><ChevronRight /></button>)
      : <Link to="/inbox" search={{ section: 'review', filter: f.filter }} className="cmp-row"><span className="min-w-0 flex-1"><b>{f.label}</b><small>{f.count} payments</small></span><ChevronRight /></Link>}
    </div>)}{counts.ready > 0 && <Link to="/inbox" search={{ section: 'review', filter: 'confirmable' }} className="cmp-row"><span className="min-w-0 flex-1"><b>{counts.ready} ready to confirm</b><small>Already filled in · nothing saves until you confirm</small></span><ChevronRight /></Link>}</div></section>}
    {rulesError && <p role="alert" className="text-sm text-warning">Your automatic sorting rules didn't load, so some suggestions may be missing. Your records are unaffected.<Button variant="ghost" size="sm" onClick={async () => { try { setRules(await listImportRules()); setRulesError(false); } catch { setRulesError(true); } }}>Retry rules</Button></p>}
    <UnreadableRecordsNotice />
    <section aria-label="Other things" className="cmp-section"><h2 className="cmp-section-title">Other things</h2><div className="cmp-panel !p-1.5">
      {reminderGroups.map(g => <details key={g.label} className="cmp-fold"><summary className="cmp-row"><span className="min-w-0 flex-1"><b>{g.label}</b><small>{g.items.length} reminder{g.items.length === 1 ? '' : 's'}</small></span><ChevronRight /></summary><ul className="cmp-fold-body">{g.items.map(i => <li key={i.key} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium">{i.title}</p>{i.description && i.description !== i.title && <p className="line-clamp-2 text-xs text-muted-foreground">{i.description}</p>}</div><div className="flex shrink-0 items-center gap-2">{i.amount != null && <span className="tabular-nums text-sm">{money(i.amount)}</span>}{(i.destination || i.commitmentId) && <Button asChild size="sm" variant="outline"><Link to={i.destination || '/plan'}>Open</Link></Button>}</div></li>)}</ul></details>)}
      <details className="cmp-fold"><summary className="cmp-row"><span className="min-w-0 flex-1"><b>Drafts, imports & reports</b><small>Unfinished work and recent reports</small></span><ChevronRight /></summary><div className="cmp-fold-body"><InboxWork /></div></details>
      <details className="cmp-fold"><summary className="cmp-row"><span className="min-w-0 flex-1"><b>Account balances</b><small>{attention ? `${attention} account${attention === 1 ? '' : 's'} to check` : 'Which statements back up each account'}</small></span><ChevronRight /></summary><div className="cmp-fold-body"><AccountStatementStatus onAttention={setAttention} /></div></details>
      <details className="cmp-fold"><summary className="cmp-row"><span className="min-w-0 flex-1"><b>All review tools</b><small>Statements, full review list and history</small></span><ChevronRight /></summary><div className="cmp-fold-body"><FinancialInboxNav active="overview" /></div></details>
    </div></section>
    </>}
    <ExpenseDialog expense={store.transactions.find(e=>e.id===open?.id)??null} onClose={()=>setOpen(null)}/>
  </div>;
}