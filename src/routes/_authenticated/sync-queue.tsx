import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import type { PendingStatus } from "@/lib/pending-sync";

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
  const target = pendingItems.find((p) => p.id === discard);
  const failed = pendingItems.filter((p) => p.status === "failed" || p.status === "waiting").length;
  const fmt = (n: number, c: string) => { try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: c }).format(n); } catch { return `${c} ${n}`; } };
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
                    <DropdownMenuItem className="text-destructive" onSelect={() => setDiscard(p.id)}>Discard from this device</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      )}
      <AlertDialog open={!!target} onOpenChange={(o) => !o && setDiscard(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this entry?</AlertDialogTitle>
            <AlertDialogDescription>{target ? `${target.payee} on ${target.date} hasn't reached your account. Discarding removes it from this device and it won't be saved.` : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (target) void discardPending(target.id); setDiscard(null); }}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
