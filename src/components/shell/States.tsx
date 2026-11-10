import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, Lock, PenLine, RotateCw, WifiOff } from "lucide-react";
import { LoadError } from "@/components/LoadError";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * Signature Flow states kit (UIX master §9, §13.6). Plain-language, calm, never decorative.
 * Every state names what happened and the next useful action; none claims success before it is durable.
 */

/** Skeleton rows while a page's records load. Announced once to screen readers. */
export function LoadingState({ label = "Loading", rows = 4, className }: { label?: string; rows?: number; className?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={cn("sf-state sf-state-loading", className)}>
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden className="sf-skeleton-row"><span className="sf-skeleton sf-skeleton-a" /><span className="sf-skeleton sf-skeleton-b" /></div>
      ))}
    </div>
  );
}

/** Nothing here yet — always with the next useful action. Never used when a read failed (use ErrorState). */
export function EmptyState({ title, hint, action, className }: { title: string; hint?: string; action?: ReactNode; className?: string }) {
  return (
    <div role="status" className={cn("sf-state sf-state-empty", className)}>
      <p className="sf-state-title">{title}</p>
      {hint && <p className="sf-state-hint">{hint}</p>}
      {action && <div className="sf-state-action">{action}</div>}
    </div>
  );
}

/** A read failed: reuses the shared LoadError, so "nothing was deleted" and Retry stay identical everywhere. */
export function ErrorState({ what, onRetry, note, className }: { what: string; onRetry?: () => unknown; note?: string; className?: string }) {
  return <LoadError what={what} {...(onRetry ? { onRetry } : {})} {...(note ? { note } : {})} {...(className ? { className } : {})} />;
}

/** Offline: what is showing is this device's saved copy; changes wait to sync. */
export function OfflineState({ waiting = 0, className }: { waiting?: number; className?: string }) {
  return (
    <div role="status" className={cn("sf-state sf-state-note", className)}>
      <WifiOff aria-hidden className="sf-state-icon" />
      <div className="min-w-0">
        <p className="sf-state-title">You're offline</p>
        <p className="sf-state-hint">Showing the copy saved on this device.{waiting > 0 ? ` ${waiting} change${waiting === 1 ? "" : "s"} waiting to sync.` : " Anything you add waits until you're back online."}</p>
      </div>
    </div>
  );
}

/** Permission denied: explains, never reveals what the record holds. */
export function UnauthorizedState({ what = "this page", className }: { what?: string; className?: string }) {
  return (
    <div role="alert" className={cn("sf-state sf-state-note", className)}>
      <Lock aria-hidden className="sf-state-icon" />
      <div className="min-w-0">
        <p className="sf-state-title">You don't have access to {what}</p>
        <p className="sf-state-hint">Ask the owner of this workspace to share it with you. Nothing about it is shown here.</p>
        <Link to="/home" className="sf-link">Go to Home</Link>
      </div>
    </div>
  );
}

/** Figures rest on older data: say how old, offer a refresh. */
export function StaleState({ asOf, onRefresh, className }: { asOf: string | null; onRefresh?: () => unknown; className?: string }) {
  return (
    <div role="status" className={cn("sf-state sf-state-note", className)}>
      <Clock aria-hidden className="sf-state-icon" />
      <div className="min-w-0 flex-1">
        <p className="sf-state-title">These figures may be out of date</p>
        <p className="sf-state-hint">{asOf ? `Last updated ${asOf}.` : "They haven't been updated yet on this device."} Nothing has changed in your records.</p>
      </div>
      {onRefresh && <Button size="sm" variant="outline" onClick={async () => { await onRefresh(); }}><RotateCw className="h-4 w-4" />Refresh</Button>}
    </div>
  );
}

/** A saved, unfinished draft: resume or set aside; never silently discarded. */
export function UnsavedDraftState({ label, onResume, onDiscard, className }: { label: string; onResume: () => unknown; onDiscard?: () => unknown; className?: string }) {
  return (
    <div role="status" className={cn("sf-state sf-state-note", className)}>
      <PenLine aria-hidden className="sf-state-icon" />
      <div className="min-w-0 flex-1">
        <p className="sf-state-title">Saved as a draft</p>
        <p className="sf-state-hint">{label} isn't in your records yet. Pick up where you left off.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={async () => { await onResume(); }}>Resume</Button>
        {onDiscard && <Button size="sm" variant="ghost" onClick={async () => { await onDiscard(); }}>Discard draft</Button>}
      </div>
    </div>
  );
}

/** Small "Proposed" label for anything shown for review that is not yet built or approved. */
export function ProposedBadge({ children = "Proposed" }: { children?: ReactNode }) {
  return <span className="sf-proposed">{children}</span>;
}
