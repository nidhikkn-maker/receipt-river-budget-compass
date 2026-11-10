import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";

/**
 * Small header pill showing whether saved figures are refreshing, current, offline or failed. Tap to refresh.
 * `compact` (Signature Flow header): a 44 px icon button with the reference header's icon metrics; the words stay
 * visible only when something needs attention (offline, failed or waiting), otherwise they are the accessible name.
 */
export function SyncStatus({ compact = false }: { compact?: boolean } = {}) {
  const { syncState, lastSyncedAt, pendingCount, refresh } = useStore();
  const navigate = useNavigate();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  const mins = lastSyncedAt ? Math.max(0, Math.round((Date.now() - new Date(lastSyncedAt).getTime()) / 60000)) : null;
  const label =
    syncState === "syncing" ? "Updating…" :
    syncState === "offline" ? (pendingCount > 0 ? `Offline · ${pendingCount} waiting` : "Offline · saved copy") :
    syncState === "error" ? "Couldn't update — tap to retry" :
    pendingCount > 0 ? `${pendingCount} waiting to sync` :
    mins == null || mins < 1 ? "Up to date" : `Updated ${mins} min ago`;
  const Icon = syncState === "syncing" ? RefreshCw : syncState === "offline" ? CloudOff : syncState === "error" ? TriangleAlert : Check;
  const attention = syncState === "error" || syncState === "offline" || pendingCount > 0;
  const go = () => (pendingCount > 0 ? void navigate({ to: "/sync-queue" }) : void refresh());
  if (compact) {
    return (
      <button type="button" onClick={go} title={label} data-sync-state={syncState} data-attention={attention || undefined} className="sf-sync-btn">
        <Icon aria-hidden className={syncState === "syncing" ? "animate-spin" : undefined} />
        <span className={attention ? "sf-sync-label" : "sr-only"} aria-live="polite">{label}</span>
      </button>
    );
  }
  return (
    <Button
      variant="ghost"
      type="button"
      onClick={go}
      aria-live="polite"
      title={label}
      className={"flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition " +
        (syncState === "error" ? "bg-destructive/10 text-destructive" : syncState === "offline" ? "bg-secondary text-secondary-foreground" : pendingCount > 0 || syncState === "syncing" ? "bg-secondary text-muted-foreground hover:text-foreground" : "bg-transparent text-muted-foreground hover:text-foreground")}
    >
      <Icon className={"h-3.5 w-3.5" + (syncState === "syncing" ? " animate-spin" : "")} />
      <span className={(syncState === "error" || syncState === "offline" || pendingCount > 0 ? "max-w-24" : "sr-only sm:not-sr-only") + " truncate sm:max-w-none"}>{label}</span>
    </Button>
  );
}

