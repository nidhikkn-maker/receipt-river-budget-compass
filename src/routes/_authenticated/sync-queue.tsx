import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
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
  const { pendingItems, retrySync } = useStore();
  const failed = pendingItems.filter((p) => p.status === "failed" || p.status === "waiting").length;
  const fmt = (n: number, c: string) => { try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: c }).format(n); } catch { return `${c} ${n}`; } };
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Waiting to sync" subtitle="Entries saved on this device while offline. Each is saved to your account once, even if you retry." />
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
              {(p.status === "failed" || p.status === "waiting") && <Button variant="outline" size="sm" onClick={() => retrySync(p.id)}>Retry</Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
