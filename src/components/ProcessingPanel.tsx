import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type StageState = "pending" | "active" | "done" | "error";
export interface Stage { label: string; state: StageState }

/** Shared progress panel for long operations. Shows only real stages; no invented percentages. */
export function ProcessingPanel({ title, stages, onCancel, onRetry, slowAfter = 12, className }: { title: string; stages: Stage[]; onCancel?: () => void; onRetry?: (() => void) | undefined; slowAfter?: number; className?: string }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => { const t = setInterval(() => setSecs((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const slow = secs >= slowAfter;
  return (
    <section role="status" aria-live="polite" className={cn("rounded-2xl border bg-card p-3 text-sm", className)}>
      <div className="flex items-center gap-2 font-semibold text-primary"><Spinner /><span className="min-w-0 flex-1">{title}</span><span className="shrink-0 tabular-nums text-xs font-normal text-muted-foreground">{secs}s</span></div>
      {stages.length > 0 && (
        <ol className="mt-2 grid gap-1">
          {stages.map((s) => (
            <li key={s.label} className={cn("flex items-center gap-2 text-xs", s.state === "pending" && "text-muted-foreground", s.state === "error" && "text-destructive")}>
              {s.state === "done" ? <Check className="h-3.5 w-3.5 text-primary" /> : s.state === "active" ? <Spinner className="size-3" /> : s.state === "error" ? <X className="h-3.5 w-3.5" /> : <span className="inline-block h-3.5 w-3.5 rounded-full border" />}
              {s.label}
            </li>
          ))}
        </ol>
      )}
      {slow && <p className="mt-2 text-xs text-muted-foreground">This is taking longer than usual{onRetry ? " — you can start again or keep waiting." : "."}</p>}
      <div className="mt-2 flex gap-4">
        {slow && onRetry && <button type="button" onClick={onRetry} className="text-xs font-semibold text-primary underline">Start again</button>}
        {onCancel && <button type="button" onClick={onCancel} className="text-xs font-semibold text-muted-foreground underline">Cancel</button>}
      </div>
    </section>
  );
}

/** Build stage rows from an ordered label list and the index currently running. */
export function stagesAt(labels: string[], active: number, failed = false): Stage[] {
  return labels.map((label, i) => ({ label, state: i < active ? "done" : i === active ? (failed ? "error" : "active") : "pending" }));
}
