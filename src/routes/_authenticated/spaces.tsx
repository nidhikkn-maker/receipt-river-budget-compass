import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Briefcase, Check, ChevronRight, Gem, Home, Layers, Plane, Users, Building2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import { SCOPE_LABEL, type Scope } from '@/lib/expenses';
import band from '@/assets/companion-spaces-band.jpg';

export const Route = createFileRoute('/_authenticated/spaces')({
  head: () => ({ meta: [
    { title: 'My Spaces — Thapal' },
    { name: 'description', content: 'Switch between personal, family and business money, or open travel and investments.' },
    { property: 'og:title', content: 'My Spaces — Thapal' },
    { property: 'og:description', content: 'Personal, family, business, travel and investments in one calm place.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
  ] }),
  component: Spaces,
});

const SPACE_ROWS: { scope: Scope; icon: typeof Home; purpose: string }[] = [
  { scope: 'personal', icon: Home, purpose: 'Your own spending, savings and bills' },
  { scope: 'family', icon: Users, purpose: 'Household costs you share with family' },
  { scope: 'business', icon: Briefcase, purpose: 'Company spending, claims and tax' },
];

function Spaces() {
  const { preferences, savePreferences } = useStore();
  const navigate = useNavigate();
  const choose = async (homeScope: Scope | 'all') => { await savePreferences({ ...preferences, homeScope }); void navigate({ to: '/dashboard' }); };
  const current = preferences.homeScope;
  return <div className="mx-auto max-w-2xl">
    <header className="cmp-page-head mb-6 pt-2"><h1 className="cmp-serif">My Spaces</h1><p>Each space keeps its own money. Choose one to see just that.</p></header>
    <nav className="cmp-list" aria-label="Spaces">
      {SPACE_ROWS.map(r => <button key={r.scope} type="button" aria-pressed={current === r.scope} onClick={() => void choose(r.scope)} className="cmp-list-row">
        <span className="cmp-icon"><r.icon /></span>
        <span className="min-w-0 flex-1"><b>{SCOPE_LABEL[r.scope]}</b><small>{r.purpose}</small></span>
        {current === r.scope ? <Check aria-label="Showing now" className="size-[18px] text-companion-gold" /> : <ChevronRight />}
      </button>)}
      <Link to="/trips" className="cmp-list-row"><span className="cmp-icon"><Plane /></span><span className="min-w-0 flex-1"><b>Travel</b><small>Trips, bookings and travel spending</small></span><ChevronRight /></Link>
      <Link to="/wealth" className="cmp-list-row"><span className="cmp-icon"><Gem /></span><span className="min-w-0 flex-1"><b>Investments</b><small>Funds, shares and what you own</small></span><ChevronRight /></Link>
    </nav>
    <div className="mt-6 cmp-list">
      <button type="button" aria-pressed={current === 'all'} onClick={() => void choose('all')} className="cmp-list-row !min-h-14"><span className="cmp-icon"><Layers /></span><span className="min-w-0 flex-1"><b>Everything together</b><small>See all spaces at once</small></span>{current === 'all' ? <Check aria-label="Showing now" className="size-[18px] text-companion-gold" /> : <ChevronRight />}</button>
      <Link to="/entities" className="cmp-list-row !min-h-14"><span className="cmp-icon"><Building2 /></span><span className="min-w-0 flex-1"><b>Companies & financial years</b><small>Set up who a business space belongs to</small></span><ChevronRight /></Link>
    </div>
    <div className="cmp-foot-band" aria-hidden><img src={band} alt="" width={1792} height={608} loading="lazy" /></div>
  </div>;
}
