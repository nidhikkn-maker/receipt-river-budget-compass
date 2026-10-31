import { Check, X } from "lucide-react";
import { Spinner } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type StageState = "pending" | "active" | "done" | "error";
export interface Stage { label: string; state: StageState }

/** Shared progress panel for long operations. Shows only real stages; no invented percentages. */
export function ProcessingPanel({ title, stages, onCancel, className }: { title: string; stages: Stage[]; onCancel?: () => void; className?: string }) {
  return (
    <section role="status" aria-live="polite" className={cn("rounded-2xl border bg-card p-3 text-sm", className)}>
      <div className="flex items-center gap-2 font-semibold text-primary"><Spinner />{title}</div>
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
      {onCancel && <button type="button" onClick={onCancel} className="mt-2 text-xs font-semibold text-muted-foreground underline">Cancel</button>}
    </section>
  );
}

/** Build stage rows from an ordered label list and the index currently running. */
export function stagesAt(labels: string[], active: number, failed = false): Stage[] {
  return labels.map((label, i) => ({ label, state: i < active ? "done" : i === active ? (failed ? "error" : "active") : "pending" }));
}
