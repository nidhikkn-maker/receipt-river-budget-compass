/** Placeholder layout shown while a page's content loads. */
export function PageSkeleton() {
  return <div role="status" aria-label="Loading page" className="mx-auto max-w-6xl animate-pulse space-y-4 px-4 pt-5 sm:px-8">
    <div className="h-7 w-40 rounded-lg bg-muted" />
    <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl bg-muted" />)}</div>
    <div className="h-36 rounded-3xl bg-muted" />
    {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 rounded-2xl bg-muted/70" />)}
    <span className="sr-only">Loading…</span>
  </div>;
}
