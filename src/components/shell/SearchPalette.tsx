import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { searchModules } from "@/components/ModuleDirectory";
import { useStore } from "@/lib/store";
import { money } from "@/lib/expenses";
import { todayISO } from "@/lib/use-position";
import { searchAll, type SearchHit } from "@/lib/search";

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  transaction: "Transactions", account: "Accounts & cards", commitment: "Scheduled payments", loan: "Loans", document: "Documents & receipts", goal: "Goals",
};

/**
 * "Find anything" (B02/B08): the existing record search (src/lib/search.ts) and page directory, grouped by
 * domain, in a palette. Opens only on an explicit tap or ⌘K/Ctrl+K, so the keyboard never pops up on its own.
 * Closing returns focus to the control that opened it (Radix Dialog).
 */
export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { transactions, accounts, commitments, loans, documents, goals } = useStore();
  const [q, setQ] = useState("");
  const today = todayISO();
  const hits = useMemo(() => (q.trim() ? searchAll(q, { transactions, accounts, commitments, loans, documents, goals }, today).slice(0, 30) : []), [q, transactions, accounts, commitments, loans, documents, goals, today]);
  const pages = useMemo(() => searchModules(q).slice(0, 6), [q]);
  const groups = useMemo(() => {
    const g = new Map<SearchHit["kind"], SearchHit[]>();
    for (const h of hits) g.set(h.kind, [...(g.get(h.kind) ?? []), h]);
    return [...g.entries()];
  }, [hits]);
  const close = () => onOpenChange(false);
  // Remember the control that opened the palette (the opener may not be a Radix trigger), and return focus to it.
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== "undefined") opener.current = document.activeElement as HTMLElement | null;
  wasOpen.current = open;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sf-palette" aria-describedby="sf-palette-help" onCloseAutoFocus={(e) => { const el = opener.current; if (el && el.isConnected) { e.preventDefault(); el.focus(); } }}>
        <DialogTitle className="sr-only">Find anything</DialogTitle>
        <DialogDescription id="sf-palette-help" className="sr-only">Search your records and Thapal's pages. Results are grouped by type.</DialogDescription>
        <label className="sf-palette-input">
          <Search aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a merchant, amount, document, trip or page" aria-label="Find anything" />
        </label>
        <div className="sf-palette-results" aria-live="polite">
          {!q.trim() && <p className="sf-state-hint">Try “hotel last month”, “above ₹25,000” or “insurance”.</p>}
          {q.trim() && !hits.length && !pages.length && <p className="sf-state-hint">Nothing matches “{q.trim()}”.</p>}
          {pages.length > 0 && <section aria-label="Pages"><h3 className="sf-overline">Pages</h3><ul>{pages.map((p) => <li key={p.to}><Link to={p.to} onClick={close} className="sf-palette-row"><span className="min-w-0 flex-1 truncate">{p.label}</span><small>{p.group}</small></Link></li>)}</ul></section>}
          {groups.map(([kind, list]) => (
            <section key={kind} aria-label={KIND_LABEL[kind]}>
              <h3 className="sf-overline">{KIND_LABEL[kind]} · {list.length}</h3>
              <ul>{list.slice(0, 6).map((h) => (
                <li key={`${h.kind}-${h.id}`}><Link to={h.to} onClick={close} className="sf-palette-row"><span className="min-w-0 flex-1"><b className="block truncate">{h.title}</b><small className="block truncate">{h.detail}</small></span>{h.amount != null && <span className="financial-amount">{money(h.amount)}</span>}</Link></li>
              ))}</ul>
            </section>
          ))}
        </div>
        <Link to="/search" onClick={close} className="sf-link">Open full search<ArrowRight aria-hidden className="size-4" /></Link>
      </DialogContent>
    </Dialog>
  );
}
