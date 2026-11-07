import { STATEMENT_STAGES, type StatementStage } from "@/lib/plain-language";
import { cn } from "@/lib/utils";

/** Received → Reading → Organised → Needs your review → Saved. Only the real current stage is highlighted; nothing later is shown as done. */
export function StageStrip({ stage, saving }: { stage: StatementStage | null; saving?: boolean }) {
  if (!stage) return null;
  const at = STATEMENT_STAGES.indexOf(stage);
  return (
    <ol aria-label="Statement progress" className="flex flex-wrap gap-x-1 gap-y-1 text-xs">
      {STATEMENT_STAGES.map((s, i) => {
        const skipped = stage === "Organised" && s === "Needs your review";
        const done = i < at && !skipped;
        return (
          <li key={s} aria-current={i === at ? "step" : undefined} className={cn("flex items-center gap-1 rounded-full px-2.5 py-1", i === at ? "bg-primary text-primary-foreground" : done ? "bg-secondary text-foreground" : "text-muted-foreground")}>
            {done ? <span aria-hidden>✓</span> : null}{s}{i === at && saving ? " · saving…" : ""}
            {i < STATEMENT_STAGES.length - 1 && <span aria-hidden className="ml-1 text-muted-foreground">→</span>}
          </li>
        );
      })}
    </ol>
  );
}
