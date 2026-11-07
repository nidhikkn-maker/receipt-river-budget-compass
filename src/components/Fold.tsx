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
    <details ref={ref} id={id} open={defaultOpen} className="uix-fold group mb-0 scroll-mt-20 border-b bg-transparent [&_summary::-webkit-details-marker]:hidden">
      <summary className="grid min-h-14 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 select-none">
        <span className="min-w-0">
          <span className="block font-medium">{title}</span>
          {hint && <span className="block text-sm text-muted-foreground">{hint}</span>}
        </span>
        <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <div className="border-t px-3 pb-3 pt-3 sm:px-4 [&>section]:m-0 [&>section]:border-0 [&>section]:py-0 [&>div>section]:m-0 [&>div>section]:border-0 [&>div>section]:py-0">{children}</div>
    </details>
  );
}
