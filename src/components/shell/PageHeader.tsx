import type { ReactNode } from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import { backTarget, breadcrumbs, showsBack } from "./navigation";
import { useShell } from "./shell-context";

/**
 * Back + compact breadcrumbs + "Find anything" (captures 03/05). Back returns to the page you came from
 * (browser history, so scroll and filters come back); with no history it goes to the page's destination.
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
      {search && <button type="button" className="sf-find" onClick={openSearch}><Search aria-hidden />Find anything</button>}
    </div>
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
