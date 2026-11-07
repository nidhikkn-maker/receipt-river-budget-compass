import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { BookOpen, CalendarDays, ChevronDown, ChevronRight, Clock, FileText, Landmark, Plane, Search, Settings, ShieldCheck, Users } from 'lucide-react';

export const MODULE_GROUPS = [
  { title: 'Money', sub: 'Activity, accounts, cards and loans', icon: Landmark, items: [ ['/expenses','All my money activity'], ['/wealth','Accounts & investments'], ['/payment-methods','Payment methods'], ['/transfers','Money moved between my accounts'], ['/receivables','Money others owe me'], ['/allocation','Where my money is'] ] },
  { title: 'Statements', sub: 'Bank and card statements, balance checks', icon: BookOpen, items: [ ['/statements','Statement Desk'], ['/inbox','Review'], ['/account-reconciliation','Check my balances'], ['/statement-accounts','Which statements I have'], ['/records-check','Records check'], ['/historical-import','Past imports'], ['/upload-requests','Accountant uploads'] ] },
  { title: 'Documents', sub: 'Bills, saved drafts and shared files', icon: FileText, items: [ ['/vault','DocuRepo'], ['/drafts','Saved drafts'], ['/offline-receipts','Offline receipts'], ['/shared','Shared files'], ['/sync-queue','Waiting to sync'] ] },
  { title: 'Travel', sub: 'Trips, bookings and expense claims', icon: Plane, items: [ ['/trips','Trips'], ['/travel-inbox','Travel inbox'], ['/claim-submission','Expense claims'], ['/reimbursement-settings','Reimbursement profiles'] ] },
  { title: 'Business', sub: 'Companies, tax, GST and things you own', icon: Users, items: [ ['/entities','Companies & years'], ['/company-spending','Company spending'], ['/assets','Things I own'], ['/tax','Income tax & GST'], ['/gst-check','Suppliers & invoices'], ['/family','Family members'] ] },
  { title: 'Reports', sub: 'Insights, exports and statements', icon: FileText, items: [ ['/reports','Spending insights'], ['/report-centre','Reports & exports'], ['/report-status','Report progress'], ['/expenditure-statement','Detailed spending statement'], ['/review','Monthly review'], ['/brief','Weekly brief'] ] },
  { title: 'Planning', sub: 'Budgets, calendar and forecasts', icon: CalendarDays, items: [ ['/plan','Plan & calendar'], ['/budgets','Monthly budgets'], ['/forecast','Long-term forecast'], ['/strategy','What if…'] ] },
  { title: 'Settings', sub: 'Setup, backup, history and assistants', icon: Settings, items: [ ['/start','Getting started'], ['/settings','Settings & backup'], ['/audit','Checks & history of changes'], ['/search','Search everything'], ['/assistant','Financial assistant'], ['/assistants','Connected assistants'], ['/rules','Sorting rules'] ] },
] as const;

const RECENT_KEY = 'ledgerline:more-recent';
const ALL = MODULE_GROUPS.flatMap(g => g.items.map(([to, label]) => ({ to, label, group: g.title })));

/** Matches a typed search against module names and their group, ignoring case. */
export function searchModules(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ALL.filter(m => m.label.toLowerCase().includes(q) || m.group.toLowerCase().includes(q));
}

/** Directory only: links to existing modules; never changes permission or ownership. Categories open one at a time. */
export function ModuleDirectory({ onNavigate }: { onNavigate: () => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => { try { const r = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); if (Array.isArray(r)) setRecent(r.filter((x): x is string => typeof x === 'string').slice(0, 3)); } catch { /* none yet */ } }, []);
  const go = (to: string) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([to, ...recent.filter(r => r !== to)].slice(0, 3))); } catch { /* private mode */ } onNavigate(); };
  const hits = useMemo(() => searchModules(query), [query]);
  const recentRows = recent.map(to => ALL.find(m => m.to === to)).filter((m): m is (typeof ALL)[number] => !!m);
  const row = (m: { to: string; label: string; group?: string }) => <Link key={m.to} to={m.to} onClick={() => go(m.to)} className="more-link" activeProps={{ 'aria-current': 'page' }}><span className="min-w-0 flex-1 truncate">{m.label}</span>{m.group && <small>{m.group}</small>}<ChevronRight className="size-4 shrink-0" /></Link>;
  return <div className="more-directory">
    <label className="more-search"><Search className="size-4 shrink-0" aria-hidden /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search pages" aria-label="Search pages" /></label>
    {query.trim() ? <div className="more-list" aria-label="Search results">{hits.length ? hits.map(row) : <p className="px-1 py-3 text-sm text-muted-foreground">No page called "{query.trim()}".</p>}</div> : <>
      {recentRows.length > 0 && <section aria-label="Recently opened"><h2 className="more-label"><Clock className="size-3.5" />Recent</h2><div className="more-list">{recentRows.map(m => row({ to: m.to, label: m.label }))}</div></section>}
      <div className="more-list">{MODULE_GROUPS.map(g => { const isOpen = open === g.title; return <div key={g.title}>
        <button type="button" className="more-group" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : g.title)}>
          <span className="more-icon"><g.icon className="size-[18px]" /></span>
          <span className="min-w-0 flex-1 text-left"><b>{g.title}</b><small>{g.sub}</small></span>
          <ChevronDown className={`size-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && <div className="more-sub">{g.items.map(([to, label]) => row({ to, label }))}</div>}
      </div>; })}</div>
    </>}
    <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground"><ShieldCheck className="size-4" />Your saved access applies in every space.</p>
  </div>;
}
