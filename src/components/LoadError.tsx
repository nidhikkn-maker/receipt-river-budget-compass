import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared failed-load state (P0-004). Use instead of an empty state whenever a read failed:
 * says plainly that nothing was deleted and offers Retry. Never shows "no records".
 */
export function LoadError({ what, onRetry, note, className }: { what: string; onRetry?: () => unknown; note?: string; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-wrap items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-3 text-sm", className)}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-medium text-destructive [overflow-wrap:anywhere]">Couldn't load {what}.</p>
        <p className="text-muted-foreground">{note ?? "Nothing has been deleted. Check your connection and retry."}</p>
      </div>
      {onRetry && <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={async () => { await onRetry(); }}><RotateCw className="h-4 w-4" />Retry</Button>}
    </div>
  );
}
