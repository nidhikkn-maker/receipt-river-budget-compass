import type { ReactNode } from "react";
import { PLAIN_TERMS, type PlainTermKey } from "@/lib/plain-language";

/** Expert view: exact accounting names stay one tap away, never on the first screen. */
export function AccountingDetails({ children, terms, label = "Accounting details" }: { children?: ReactNode; terms?: PlainTermKey[]; label?: string }) {
  return (
    <details className="group rounded-xl border border-border/70 px-3 py-2 text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
        {label}<span aria-hidden className="text-xs transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="space-y-2 pb-2 pt-1 text-muted-foreground">
        {terms?.length ? <dl className="space-y-1.5">{terms.map(k => <div key={k}><dt className="font-medium text-foreground">{PLAIN_TERMS[k].plain} <span className="font-normal text-muted-foreground">· {PLAIN_TERMS[k].technical}</span></dt><dd className="text-xs">{PLAIN_TERMS[k].explain}</dd></div>)}</dl> : null}
        {children}
      </div>
    </details>
  );
}

/** One plain sentence that explains a figure or step, with the technical term available on request. */
export function Explain({ term }: { term: PlainTermKey }) {
  const t = PLAIN_TERMS[term];
  return <p className="text-xs text-muted-foreground">{t.explain} <abbr title={t.technical} className="no-underline">({t.technical})</abbr></p>;
}
