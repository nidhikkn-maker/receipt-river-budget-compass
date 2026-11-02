import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AlertTriangle, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { canRemove, type PendingStatus } from "@/lib/pending-sync";

export const Route = createFileRoute("/_authenticated/sync-queue")({
  head: () => ({ meta: [
    { title: "Waiting to sync — Ledgerline" },
    { name: "description", content: "Entries saved on this device and whether each has reached your account." },
    { property: "og:title", content: "Waiting to sync — Ledgerline" },
    { property: "og:description", content: "Entries saved on this device and whether each has reached your account." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: SyncQueue,
});

const LABEL: Record<PendingStatus, string> = { waiting: "Waiting", saving: "Saving…", saved: "Saved to your account", failed: "Couldn't save" };
const TONE: Record<PendingStatus, string> = {
  waiting: "bg-secondary text-secondary-foreground", saving: "bg-secondary text-muted-foreground",
  saved: "bg-primary/10 text-primary", failed: "bg-destructive/10 text-destructive",
};

function SyncQueue() {
  const { pendingItems, retrySync, discardPending } = useStore();
  const [discard, setDiscard] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const target = pendingItems.find((p) => p.id === discard);
  const failed = pendingItems.filter((p) => p.status === "failed" || p.status === "waiting").length;
  const fmt = (n: number, c: string) => { try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: c }).format(n); } catch { return `${c} ${n}`; } };
  const close = () => { setDiscard(null); setAck(false); };
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Waiting to sync" sub="Entries saved on this device while offline. Each is saved to your account once, even if you retry." />
      {failed > 0 && <div className="mb-4 flex justify-end"><Button onClick={() => retrySync()}>Retry all</Button></div>}
      {pendingItems.length === 0 ? (
        <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">Nothing waiting — every entry on this device is saved to your account.</p>
      ) : (
        <ul className="grid gap-2">
          {pendingItems.map((p) => (
            <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-card p-4 shadow-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{p.payee}</p>
                <p className="text-xs text-muted-foreground">{p.date} · {fmt(p.amount, p.currency)}</p>
                <span className={"mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium " + TONE[p.status]}>{LABEL[p.status]}</span>
                {p.error && <p className="mt-1 text-xs text-destructive">{p.error}</p>}
              </div>
              {(p.status === "failed" || p.status === "waiting") && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${p.payee}`} className="h-11 w-11"><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => void retrySync(p.id)}>Retry now</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onSelect={() => { setAck(false); setDiscard(p.id); }}>Remove from this device</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      )}
      <AlertDialog open={!!target} onOpenChange={(o) => !o && close()}>
        <AlertDialogContent className="max-h-[88dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-3xl bg-card p-5 shadow-float sm:p-6">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle className="text-lg">Remove this entry from this device?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {target ? `${target.payee} · ${target.date} · ${fmt(target.amount, target.currency)} — status: ${LABEL[target.status]}.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" /> Please read before you confirm</p>
            <ul className="mt-2 grid gap-2 text-sm leading-snug">
              <li className="flex gap-2"><span aria-hidden className="text-destructive">•</span><span>This entry has never reached your account. It exists only on this device — there is no copy in your account or on your other devices.</span></li>
              <li className="flex gap-2"><span aria-hidden className="text-destructive">•</span><span>Removing it deletes it from this device permanently. It will not be saved later, and it cannot be recovered or undone.</span></li>
              <li className="flex gap-2"><span aria-hidden className="text-destructive">•</span><span>If you still need this expense, choose “Keep it” and retry, or add it again yourself afterwards.</span></li>
            </ul>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-secondary/60 p-3 text-sm">
            <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
            <span>I understand this entry will be deleted from this device and cannot be recovered.</span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={close}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canRemove(target, ack)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              onClick={() => { if (target) void discardPending(target.id); close(); }}
            >
              Remove from this device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
