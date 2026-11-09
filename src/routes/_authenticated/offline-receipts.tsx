import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { CloudOff, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/lib/confirm";
import { useStore } from "@/lib/store";
import { offlineScanRows, removeFailedOfflineScans, removeOfflineScan, requestScanRetry, type OfflineScanRow } from "@/lib/offline-scan";

export const Route = createFileRoute("/_authenticated/offline-receipts")({
  head: () => ({ meta: [
    { title: "Offline receipt photos — Thapal" },
    { name: "description", content: "Receipt photos saved on this phone, any upload or reading problem, whether each is waiting to retry, and a way to drop ones you no longer need." },
    { property: "og:title", content: "Offline receipt photos — Thapal" },
    { property: "og:description", content: "Receipt photos saved on this phone, any upload or reading problem, whether each is waiting to retry, and a way to drop ones you no longer need." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: OfflineReceipts,
});

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function OfflineReceipts() {
  const { userId } = useStore();
  const [rows, setRows] = useState<OfflineScanRow[]>([]);
  const [online, setOnline] = useState(true);
  const urls = useRef<string[]>([]);
  const load = useCallback(async () => {
    const r = await offlineScanRows(userId).catch(() => [] as OfflineScanRow[]);
    urls.current.forEach(URL.revokeObjectURL);
    urls.current = r.flatMap((x) => (x.thumb ? [x.thumb] : []));
    setRows(r);
  }, [userId]);
  useEffect(() => {
    const net = () => setOnline(navigator.onLine);
    void load();
    const t = setInterval(() => void load(), 4000);
    window.addEventListener("online", net); window.addEventListener("offline", net);
    return () => { clearInterval(t); urls.current.forEach(URL.revokeObjectURL); urls.current = []; window.removeEventListener("online", net); window.removeEventListener("offline", net); };
  }, [load]);
  const status = (r: OfflineScanRow) => !online ? "Waiting for connection" : r.error ? "Waiting to retry" : "Uploading and reading…";
  const drop = async (r: OfflineScanRow) => {
    if (!(await confirmAction({ title: "Remove this receipt photo?", message: `"${r.name}" will be deleted from this phone. If you still want the expense, you'll have to take the photo again.`, confirmLabel: "Remove photo" }))) return;
    (await removeOfflineScan(userId, r.id)) ? toast.success("Receipt photo removed") : toast.error("That photo has already been read — you'll find it in Drafts.");
    await load();
  };
  const dropAllFailed = async () => {
    const failed = rows.filter((r) => r.error).length;
    if (!failed) return;
    if (!(await confirmAction({ title: `Remove ${failed} failed receipt photo${failed === 1 ? "" : "s"}?`, message: "They'll be deleted from this phone. Photos still uploading or being read are kept.", confirmLabel: `Remove ${failed}` }))) return;
    const removed = await removeFailedOfflineScans(userId);
    removed ? toast.success(`${removed} receipt photo${removed === 1 ? "" : "s"} removed`) : toast.error("Nothing could be removed — try again.");
    await load();
  };
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Offline receipt photos" sub="Photos kept on this phone until they're uploaded and read. Retrying reuses the same photo and draft, so nothing is duplicated." />
      {rows.some((r) => r.error) && <div className="mb-4 flex flex-wrap justify-end gap-2">{online && <Button onClick={requestScanRetry}><RefreshCw className="h-4 w-4" />Retry all</Button>}<Button variant="outline" onClick={() => void dropAllFailed()}><Trash2 className="h-4 w-4" />Remove all failed</Button></div>}
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
            <Button size="sm" variant="ghost" aria-label={`Remove ${r.name}`} onClick={() => void drop(r)}><Trash2 className="h-4 w-4" /></Button>
          </li>))}</ul>)}
      <p className="mt-4 text-xs text-muted-foreground">Removing only clears the photo from this phone — nothing is added to your expenses, and drafts you've already opened stay in Drafts.</p>
    </div>
  );
}
