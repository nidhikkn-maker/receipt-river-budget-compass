import { createFileRoute, Link } from '@tanstack/react-router';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { PageTitle } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/store';
import { listImports } from '@/lib/import-repository';
import { overlappingStatements } from '@/lib/import-manifest';
import { coverageMonths } from '@/lib/historical-import';
import { importBatchSearch } from '@/lib/import-inbox';

const importsQuery = queryOptions({ queryKey: ['historical-imports'], queryFn: listImports });
export const Route = createFileRoute('/_authenticated/historical-import')({
  validateSearch: importBatchSearch,
  head: () => ({ meta: [
    { title: 'Past statement imports — Ledgerline' },
    { name: 'description', content: 'Read-only history of saved statement imports and recorded coverage.' },
    { property: 'og:title', content: 'Past statement imports — Ledgerline' },
    { property: 'og:description', content: 'Saved import periods, statuses and overlaps; new statement work stays in Statement Desk.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(importsQuery), component: HistoricalImports,
});

function HistoricalImports() {
  const { data: batches } = useSuspenseQuery(importsQuery);
  const { accounts } = useStore();
  const today = new Date().toISOString().slice(0, 10);
  const overlaps = overlappingStatements(batches);
  return <>
    <PageTitle eyebrow="Statements" title="Past imports" />
    <Button asChild variant="outline" className="mb-6"><Link to="/statements">Go to Statement Desk</Link></Button>
    <section className="mb-6 border-y py-5">
      <h2 className="mb-3 text-lg font-semibold">Import coverage</h2>
      <ul className="divide-y">{accounts.filter(a => !a.archived).map(a => {
        const coverage = coverageMonths(batches.filter(b => b.account_id === a.id && b.status === 'review'), today);
        return <li key={a.id} className="py-3 text-sm"><span className="font-medium">{a.name}</span> · {coverage.covered.length} months represented
          <p className="text-xs text-warning">{coverage.missing.length ? `Missing statement months: ${coverage.missing.join(', ')}` : 'All months represented — coverage is not balance verification'}</p>
        </li>;
      })}</ul>
    </section>
    {overlaps.length > 0 && <section className="mb-6 border-b pb-4"><h2 className="mb-3 text-lg font-semibold">Overlapping statement periods</h2><ul>{overlaps.map(({ first, second }) => <li key={`${first.id}-${second.id}`} className="break-words text-sm text-warning">{first.file_name} · {second.file_name}</li>)}</ul></section>}
    <section className="mb-6"><h2 className="mb-3 text-lg font-semibold">Saved statements</h2>
      <ul className="divide-y">{batches.map(b => <li key={b.id} className="py-3">
        <p className="break-words text-sm font-medium">{b.file_name}</p>
        <p className="text-xs text-muted-foreground">{accounts.find(a => a.id === b.account_id)?.name} · {b.status} · {b.period_from ?? 'Period not confirmed'}{b.period_to ? ` to ${b.period_to}` : ''}</p>
        {b.total_pages != null && <p className="text-xs text-muted-foreground">{b.next_page ?? 0} of {b.total_pages} pages extracted</p>}
        {b.error && <p className="break-words text-xs text-destructive">{b.error}</p>}
      </li>)}</ul>
      {!batches.length && <p className="text-sm text-muted-foreground">No past imports.</p>}
    </section>
  </>;
}
