import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";

/** A section that starts folded to keep long pages short; opens itself when the URL points at it. */
export function Fold({ id, title, hint, children, defaultOpen = false }: { id?: string; title: string; hint?: string; children: ReactNode; defaultOpen?: boolean }) {
  const hash = useRouterState({ select: (s) => s.location.hash });
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (id && hash === id && ref.current) { ref.current.open = true; ref.current.scrollIntoView({ block: "start" }); }
  }, [hash, id]);
  return (
    <details ref={ref} id={id} open={defaultOpen} className="group mb-3 scroll-mt-20 rounded-2xl border bg-card [&_summary::-webkit-details-marker]:hidden">
      <summary className="grid min-h-14 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 select-none">
        <span className="min-w-0">
          <span className="block truncate font-semibold">{title}</span>
          {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
        </span>
        <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <div className="border-t px-3 pb-3 pt-3 sm:px-4">{children}</div>
    </details>
  );
}
