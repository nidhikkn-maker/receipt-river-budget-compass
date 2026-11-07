import { useState } from 'react';
import { ChevronRight, CreditCard, Landmark, Receipt, BellOff, CheckCheck, Undo2 } from 'lucide-react';
import { money, type Expense } from '@/lib/expenses';
import type { FinancialReview } from '@/lib/financial-review';
import type { InboxItem } from '@/lib/inbox';

const REASON: Record<FinancialReview['status'], string> = {
  'Ready for Review': 'Ready to confirm',
  'Suggested Correction': 'A suggestion to check',
  'Needs Information': 'Missing a detail',
  'Possible Duplicate': 'Might be paid twice',
  Unresolved: 'Needs a look',
};

function dayGroup(iso: string | null | undefined, today: string) {
  if (!iso) return 'Earlier';
  if (iso === today) return 'Today';
  const y = new Date(`${today}T12:00:00`); y.setDate(y.getDate() - 1);
  if (iso === y.toISOString().slice(0, 10)) return 'Yesterday';
  if (iso >= `${today.slice(0, 7)}-01`) return 'Earlier this month';
  return 'Earlier';
}
const iconFor = (e: Expense) => /card/.test(e.paymentMethod) ? CreditCard : ['bank_transfer', 'upi'].includes(e.paymentMethod) ? Landmark : Receipt;
const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

function grouped<T>(list: T[], date: (t: T) => string | null | undefined, today: string) {
  const out: { label: string; items: T[] }[] = [];
  for (const t of list) { const label = dayGroup(date(t), today); const last = out.at(-1); if (last?.label === label) last.items.push(t); else out.push({ label, items: [t] }); }
  return out;
}

/** Calm three-way view over existing review state; actions still happen in the existing review flows. */
export function CompanionReview({ rows, transactions, dismissed, today, onOpen, onRestore }: {
  rows: FinancialReview[]; transactions: Expense[]; dismissed: InboxItem[]; today: string; onOpen: (e: Expense) => void; onRestore?: (key: string) => Promise<void> | void;
}) {
  const [tab, setTab] = useState<'todo' | 'done' | 'ignored'>('todo');
  const todo = [...new Map(rows.map(r => [r.transaction.id, r])).values()].sort((a, b) => b.transaction.date.localeCompare(a.transaction.date)).slice(0, 30);
  const done = transactions.filter(e => e.reconciledAt).sort((a, b) => (b.reconciledAt ?? '').localeCompare(a.reconciledAt ?? '')).slice(0, 30);
  const tabs = [['todo', 'Needs checking', todo.length], ['done', 'Checked', done.length], ['ignored', 'Set aside', dismissed.length]] as const;
  return <section aria-label="Review timeline" className="space-y-3">
    <div role="tablist" aria-label="Review state" className="cmp-segments">
      {tabs.map(([id, label, n]) => <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}>{label}{n > 0 && <span className="cmp-seg-count">{n}</span>}</button>)}
    </div>
    <div className="cmp-panel !pb-2" role="tabpanel" aria-label={tabs.find(t => t[0] === tab)![1]}>
      {tab === 'todo' && (!todo.length ? <p className="flex items-center gap-2 px-1 py-4 text-sm cmp-muted"><CheckCheck className="size-4" />All caught up. Nothing needs you.</p> : grouped(todo, r => r.transaction.date, today).map(g => <div key={g.label}>
        <p className="cmp-day">{g.label}</p>
        {g.items.map(r => { const Icon = iconFor(r.transaction); return <button type="button" key={r.transaction.id} onClick={() => onOpen(r.transaction)} className="cmp-row">
          <span className="cmp-icon"><Icon /></span>
          <span className="min-w-0 flex-1"><b className="truncate">{r.transaction.merchant || r.transaction.title}</b><small className="truncate">{REASON[r.status]} · {shortDate(r.transaction.date)}</small></span>
          <span className="cmp-amount">{money(r.transaction.originalAmount ?? r.transaction.amount, r.transaction.currency)}</span><ChevronRight />
        </button>; })}
      </div>))}
      {tab === 'done' && (!done.length ? <p className="px-1 py-4 text-sm cmp-muted">Nothing checked against a statement yet.</p> : grouped(done, e => e.reconciledAt?.slice(0, 10), today).map(g => <div key={g.label}>
        <p className="cmp-day">{g.label}</p>
        {g.items.map(e => { const Icon = iconFor(e); return <button key={e.id} type="button" onClick={() => onOpen(e)} className="cmp-row">
          <span className="cmp-icon"><Icon /></span>
          <span className="min-w-0 flex-1"><b className="truncate">{e.merchant || e.title}</b><small className="truncate">Checked against your statement · {shortDate(e.date)}</small></span>
          <span className="cmp-amount">{money(e.originalAmount ?? e.amount, e.currency)}</span><ChevronRight />
        </button>; })}
      </div>))}
      {tab === 'ignored' && (!dismissed.length ? <p className="px-1 py-4 text-sm cmp-muted">You haven't set anything aside.</p> : grouped(dismissed, i => i.date, today).map(g => <div key={g.label}>
        <p className="cmp-day">{g.label}</p>
        {g.items.map(i => <div key={i.key} className="cmp-row"><span className="cmp-icon"><BellOff /></span><span className="min-w-0 flex-1"><b className="truncate">{i.title}</b><small className="truncate">{i.description}</small></span>{i.amount != null && <span className="cmp-amount">{money(i.amount)}</span>}{onRestore && <button type="button" className="cmp-restore" aria-label={`Bring back ${i.title}`} onClick={() => void onRestore(i.key)}><Undo2 className="size-4" />Bring back</button>}</div>)}
      </div>))}
    </div>
  </section>;
}
