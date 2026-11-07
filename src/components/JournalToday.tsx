import { Link } from '@tanstack/react-router';
import { ArrowUpRight, CheckCheck, Wallet, CalendarDays, BookOpen } from 'lucide-react';
import { money, type Expense } from '@/lib/expenses';
import { TXN_LABEL } from '@/lib/ledger';
import sunrise from '@/assets/journal-sunrise.jpg';

export function JournalToday({ name, today, spending, cash, safe, cardDue, estimated, readiness, unmatched, entries, upcoming }: {
  name: string; today: string; spending: number; cash: number | null; safe: number | null; cardDue: number;
  estimated: boolean; readiness: string; unmatched: number; entries: Expense[];
  upcoming: { name: string; date: string; amount: number }[];
}) {
  const recent = [...entries].sort((a,b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0,8);
  return <div className="journal-today">
    <section className="journal-hero relative -mx-4 mb-6 overflow-hidden sm:mx-0">
      <img src={sunrise} alt="" width={1536} height={512} className="absolute inset-0 h-full w-full object-cover" />
      <div className="relative px-5 pb-8 pt-7 sm:px-8 sm:pb-10">
        <p className="text-xs font-medium text-foreground">{new Date(`${today}T12:00:00`).toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})}</p>
        <h1 className="journal-heading mt-3 text-3xl sm:text-4xl">Today{ name ? `, ${name.split(' ')[0]}` : ''}.</h1>
        <p className="mt-2 max-w-sm text-sm text-foreground">Your money, in perspective.</p>
      </div>
    </section>
    <div className="journal-columns grid min-w-0 gap-8 xl:gap-12">
      <div className="min-w-0">
        <section className="mb-7 border-b pb-6" aria-label="Your money story">
          <p className="journal-kicker">Your money story</p>
          <div className="mt-3 flex items-end justify-between gap-3"><div><p className="text-xs text-muted-foreground">Recorded spending · selected period</p><p className="financial-amount mt-1 text-3xl font-medium">{money(spending)}</p></div><Link to="/reports" aria-label="Open spending reports" className="flex size-11 items-center justify-center rounded-full border"><ArrowUpRight className="size-5" /></Link></div>
          <div className="mt-5 grid grid-cols-2 gap-4"><div><p className="text-xs text-muted-foreground">Available cash</p><p className="financial-amount mt-1 text-lg">{cash === null ? 'Not available' : money(cash)}</p></div><div><p className="text-xs text-muted-foreground">Safe to spend{estimated ? ' · estimated' : ''}</p><p className="financial-amount mt-1 text-lg">{safe === null ? 'Not available' : money(safe)}</p></div></div>
        </section>
        <section aria-label="Today actions" className="mb-8"><h2 className="journal-heading text-2xl">A little attention today</h2>
          <div className="mt-3 divide-y"><Link to="/inbox" className="journal-action"><CheckCheck className="size-5 text-gold-strong" /><div className="min-w-0 flex-1"><p className="font-medium">{unmatched ? `${unmatched} entries to reconcile` : 'Your review desk'}</p><p className="mt-0.5 text-xs text-muted-foreground">{readiness}</p></div><ArrowUpRight className="size-4 shrink-0" /></Link>
          <Link to="/statements" className="journal-action"><BookOpen className="size-5 text-gold-strong" /><div className="flex-1"><p className="font-medium">Bring your records together</p><p className="mt-0.5 text-xs text-muted-foreground">Statements & supporting documents</p></div><ArrowUpRight className="size-4" /></Link></div>
        </section>
        <section aria-label="Financial journal"><div className="flex items-center justify-between"><h2 className="journal-heading text-2xl">The journal</h2><Link to="/expenses" className="text-xs font-medium text-muted-foreground">View all <ArrowUpRight className="inline size-3" /></Link></div>
          {!recent.length && <p className="py-8 text-sm text-muted-foreground">Your journal is quiet. No recorded activity yet.</p>}
          <ol className="mt-4">{recent.map((e,i) => <li key={e.id} className="journal-entry relative border-l pl-6 pb-5"><span className="absolute -left-1 top-1 size-2 rounded-full bg-gold" />{(i === 0 || recent[i-1]?.date !== e.date) && <p className="mb-2 text-xs text-muted-foreground">{e.date}</p>}<Link to="/new" search={{edit:e.id}} className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{e.merchant || e.title}</p><p className="mt-1 text-xs text-muted-foreground">{TXN_LABEL[e.txnType]} · {e.category}{e.reconciledAt ? ' · Reconciled' : ''}</p></div><span className="financial-amount shrink-0 text-sm">{money(e.originalAmount ?? e.amount,e.currency)}</span></Link></li>)}</ol>
        </section>
      </div>
      <aside className="journal-side min-w-0 space-y-7">
        <section className="border-t pt-5"><div className="flex items-center gap-2"><CalendarDays className="size-4 text-gold-strong" /><h2 className="journal-heading text-xl">On the horizon</h2></div><ul className="mt-3 divide-y">{upcoming.slice(0,4).map((u,i) => <li key={`${u.name}-${i}`} className="py-3"><p className="text-xs text-muted-foreground">{u.date}</p><div className="mt-1 flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{u.name}</span><span className="financial-amount">{money(u.amount)}</span></div></li>)}</ul>{!upcoming.length && <p className="py-4 text-sm text-muted-foreground">Nothing scheduled in the available plan.</p>}<Link to="/plan" className="text-xs font-medium">Open plan <ArrowUpRight className="inline size-3" /></Link></section>
        <section className="border-t pt-5"><div className="flex items-center gap-2"><Wallet className="size-4 text-gold-strong" /><h2 className="journal-heading text-xl">Wealth & Plan</h2></div><p className="mt-4 text-xs text-muted-foreground">Recorded card balances</p><p className="financial-amount mt-1 text-2xl">{money(cardDue)}</p><Link to="/wealth" className="mt-4 block text-xs font-medium">Accounts & investments <ArrowUpRight className="inline size-3" /></Link></section>
      </aside>
    </div>
  </div>;
}