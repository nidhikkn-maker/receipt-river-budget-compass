import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { offlineScanRows, requestScanRetry, type OfflineScanRow } from "@/lib/offline-scan";

export const Route = createFileRoute("/_authenticated/offline-receipts")({
  head: () => ({ meta: [
    { title: "Offline receipt photos — Ledgerline" },
    { name: "description", content: "Receipt photos saved on this phone, any upload or reading problem, and whether each is waiting to retry." },
    { property: "og:title", content: "Offline receipt photos — Ledgerline" },
    { property: "og:description", content: "Receipt photos saved on this phone, any upload or reading problem, and whether each is waiting to retry." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: OfflineReceipts,
});

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function OfflineReceipts() {
  const { userId } = useStore();
  const [rows, setRows] = useState<OfflineScanRow[]>([]);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let urls: string[] = [];
    const load = () => void offlineScanRows(userId).then((r) => { urls.forEach(URL.revokeObjectURL); urls = r.flatMap((x) => (x.thumb ? [x.thumb] : [])); setRows(r); });
    const net = () => setOnline(navigator.onLine);
    net(); load(); const t = setInterval(load, 4000);
    window.addEventListener("online", net); window.addEventListener("offline", net);
    return () => { clearInterval(t); urls.forEach(URL.revokeObjectURL); window.removeEventListener("online", net); window.removeEventListener("offline", net); };
  }, [userId]);
  const status = (r: OfflineScanRow) => !online ? "Waiting for connection" : r.error ? "Waiting to retry" : "Uploading and reading…";
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Offline receipt photos" sub="Photos kept on this phone until they're uploaded and read. Retrying reuses the same photo and draft, so nothing is duplicated." />
      {rows.some((r) => r.error) && online && <div className="mb-4 flex justify-end"><Button onClick={requestScanRetry}><RefreshCw className="h-4 w-4" />Retry all</Button></div>}
      {rows.length === 0 ? <p className="rounded-2xl border p-6 text-center text-sm text-muted-foreground">No receipt photos waiting on this phone.</p> : (
        <ul className="space-y-2">{rows.map((r) => (
          <li key={r.id} className="flex gap-3 rounded-2xl border p-3">
            {r.thumb ? <img src={r.thumb} alt="Receipt photo" className="h-16 w-12 shrink-0 rounded-md object-cover" /> : <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-md bg-secondary"><CloudOff className="h-4 w-4" /></div>}
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-center gap-2"><span className="truncate font-medium">{r.name}</span>
                <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + (r.error ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground")}>{status(r)}</span></div>
              <div className="text-xs text-muted-foreground">Saved {when(r.takenAt)}{r.attempts ? ` · ${r.attempts} attempt${r.attempts === 1 ? "" : "s"}` : ""}{r.lastTriedAt ? ` · last tried ${when(r.lastTriedAt)}` : ""}</div>
              {r.error && <div className="mt-1 text-xs text-destructive">{r.kind === "reading" ? "Reading problem: " : "Upload problem: "}{r.error}</div>}
            </div>
          </li>))}</ul>)}
    </div>
  );
}
