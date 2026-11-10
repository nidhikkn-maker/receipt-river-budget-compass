import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SplitItem { id: string; title: string; detail?: ReactNode; trailing?: ReactNode }

/**
 * List/detail template (UIX master §13 "List/detail", §17). On iPad and computer the detail stays beside the
 * list and the selection persists (the caller keeps `selectedId`, e.g. with useReviewView); on iPhone the
 * detail replaces the list with a labelled Back that returns focus to the row that opened it.
 */
export function SplitView({ label, items, selectedId, onSelect, renderDetail, empty, className }: {
  label: string;
  items: SplitItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  renderDetail: (id: string) => ReactNode;
  empty?: ReactNode;
  className?: string;
}) {
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const detailRef = useRef<HTMLDivElement>(null);
  const lastOpened = useRef<string | null>(null);
  useEffect(() => {
    if (selected) { lastOpened.current = selected.id; return; }
    // Closing the detail on a phone returns focus to the row it came from.
    const id = lastOpened.current;
    if (id) rowRefs.current.get(id)?.focus();
  }, [selected]);
  if (!items.length) return <>{empty}</>;
  return (
    <div className={cn("sf-split", selected && "sf-split-has-detail", className)}>
      <ul className="sf-split-list" aria-label={label}>
        {items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              ref={(el) => { if (el) rowRefs.current.set(it.id, el); else rowRefs.current.delete(it.id); }}
              aria-current={it.id === selected?.id ? "true" : undefined}
              className="sf-split-row"
              onClick={() => { onSelect(it.id); requestAnimationFrame(() => detailRef.current?.focus()); }}
            >
              <span className="min-w-0 flex-1"><b>{it.title}</b>{it.detail && <small>{it.detail}</small>}</span>
              {it.trailing && <span className="sf-split-trailing">{it.trailing}</span>}
              <ChevronRight aria-hidden className="sf-row-chevron" />
            </button>
          </li>
        ))}
      </ul>
      <div ref={detailRef} tabIndex={-1} className="sf-split-detail" role="region" aria-label={selected ? selected.title : `${label} detail`}>
        {selected ? <>
          <button type="button" className="sf-back sf-split-back" onClick={() => onSelect(null)}><ArrowLeft aria-hidden />Back to {label.toLowerCase()}</button>
          {renderDetail(selected.id)}
        </> : <p className="sf-split-hint">Choose an item to see its details here.</p>}
      </div>
    </div>
  );
}
