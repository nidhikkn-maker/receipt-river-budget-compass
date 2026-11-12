import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import { backTarget, breadcrumbs, RECORDS_TABS, recordsTabOf, showsBack, showsRecordsSubnav } from "./navigation";
import { useShell } from "./shell-context";

/**
 * Back + compact breadcrumbs + "Find anything" (captures 03/05). Back returns to the page you came from
 * (browser history, so scroll and filters come back); with no history it goes to the page's destination.
 * On iPhone the row is one compact line with no rule and Find is a 44 x 44 icon whose accessible name stays
 * "Find anything" (density audit SH-1); iPad and computer keep the labelled pill.
 */
export function Breadcrumbs({ search = true }: { search?: boolean }) {
  const router = useRouter();
  const href = useRouterState({ select: (s) => s.location.href });
  const { from, openSearch } = useShell();
  const crumbs = breadcrumbs(href, from);
  const target = backTarget(href, from);
  const back = () => {
    if (from && router.history.canGoBack()) router.history.back();
    else void router.navigate({ to: target.to });
  };
  if (!showsBack(href)) return null;
  return (
    <div className="sf-crumbs">
      <nav aria-label="Breadcrumb" className="sf-crumbs-trail">
        <button type="button" className="sf-back" onClick={back} aria-label={`Back to ${target.label}`}><ArrowLeft aria-hidden />Back</button>
        <ol>
          {crumbs.map((c, i) => (
            <li key={`${c.label}-${i}`}>
              {i > 0 && <ChevronRight aria-hidden className="sf-crumb-sep" />}
              {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
            </li>
          ))}
        </ol>
      </nav>
      {search && <button type="button" className="sf-find" onClick={openSearch}><Search aria-hidden /><span className="sf-find-label">Find anything</span></button>}
    </div>
  );
}

/**
 * Records sub-navigation (KK decision 7): shown on the Records module index pages, e.g. Travel, with the current one
 * marked. Detail pages rely on the labelled Back (SH-1). The row scrolls sideways on iPhone: the current tab is
 * scrolled into view and a fade marks the edge that has more tabs beyond it (SH-2).
 */
export function RecordsSubnav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = recordsTabOf(pathname);
  const shown = showsRecordsSubnav(pathname);
  const ref = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Bring the current tab fully into view without scrolling the page itself.
    const current = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (current) {
      const left = current.offsetLeft; // .sf-subnav is position: relative, so this is measured from the row
      const right = left + current.offsetWidth;
      if (left < el.scrollLeft) el.scrollLeft = left;
      else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth + 24;
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, shown, measure]);
  if (!active || !shown) return null;
  return (
    <nav ref={ref} aria-label="Records sections" className="sf-subnav" onScroll={measure} data-fade-start={edges.start || undefined} data-fade-end={edges.end || undefined}>
      {RECORDS_TABS.map((t) => <Link key={t.key} to={t.to} aria-current={t.key === active ? "page" : undefined}>{t.label}</Link>)}
    </nav>
  );
}

/** Editorial page header: overline, large title, one-sentence description, actions on the right. */
export function PageHeader({ overline, title, description, actions, crumbs = true }: { overline?: string; title: string; description?: ReactNode; actions?: ReactNode; crumbs?: boolean }) {
  return (
    <header className="sf-page-head">
      {crumbs && <Breadcrumbs />}
      <div className="sf-page-head-row">
        <div className="min-w-0">
          {overline && <p className="sf-overline">{overline}</p>}
          <h1 className="sf-title">{title}</h1>
          {description && <p className="sf-lede">{description}</p>}
        </div>
        {actions && <div className="sf-page-actions">{actions}</div>}
      </div>
    </header>
  );
}

/** Flat module row with an icon tile and a chevron (captures 03, 05). */
export function ModuleRow({ to, hash, icon, title, detail, onClick }: { to?: string; hash?: string; icon: ReactNode; title: string; detail: ReactNode; onClick?: () => void }) {
  const body = <>
    <span className="sf-tile" aria-hidden>{icon}</span>
    <span className="min-w-0 flex-1"><b>{title}</b><small>{detail}</small></span>
    <ChevronRight aria-hidden className="sf-row-chevron" />
  </>;
  if (to) return <Link to={to} {...(hash ? { hash } : {})} className="sf-module-row">{body}</Link>;
  return <button type="button" className="sf-module-row" onClick={onClick}>{body}</button>;
}
