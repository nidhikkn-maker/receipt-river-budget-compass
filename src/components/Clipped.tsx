import { useState, type ReactNode } from "react";

/** Shows the first few rows of a long list with a "Show all" control, so review pages stay short. */
export function Clipped<T>({ items, render, limit = 8, className }: { items: T[]; render: (item: T) => ReactNode; limit?: number; className?: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, limit);
  return (
    <>
      <ul className={className}>{shown.map(render)}</ul>
      {items.length > limit && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-1 h-10 w-full rounded-xl text-sm font-medium text-primary hover:bg-accent">
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </>
  );
}
