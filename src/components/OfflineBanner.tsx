import { useEffect, useRef, useState } from "react";
import { CloudOff, RefreshCw, Check } from "lucide-react";
import { useStore } from "@/lib/store";
import { offlineScanStatus, requestScanRetry } from "@/lib/offline-scan";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

/** Clear strip: offline (what's on this phone and waiting), then syncing and "all synced" after reconnecting. */
export function OfflineBanner() {
  const { pendingCount, syncState, userId } = useStore();
  const [online, setOnline] = useState(true);
  const [scans, setScans] = useState(0);
  const [failed, setFailed] = useState(0);
  const [justBack, setJustBack] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    setOnline(navigator.onLine);
    const check = () => void offlineScanStatus(userId).then((x) => { setScans(x.waiting); setFailed(x.failed); });
    const on = () => { setOnline(true); setJustBack(true); check(); };
    const off = () => { setOnline(false); setJustBack(false); check(); };
    check(); const t = setInterval(check, 5000);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { clearInterval(t); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [userId]);
  const waiting = pendingCount + scans;
  const busy = online && justBack && (waiting > 0 || syncState === "syncing");
  useEffect(() => {
    if (justBack && online && !busy) { clearTimeout(timer.current); timer.current = setTimeout(() => setJustBack(false), 4000); }
    return () => clearTimeout(timer.current);
  }, [justBack, online, busy]);
  if (online && !justBack && !failed) return null;
  if (online && failed && !(justBack && busy)) return (
    <div role="alert" className="mb-3 flex items-center gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
      <CloudOff className="h-4 w-4 shrink-0 text-destructive" />
      <span className="min-w-0 flex-1"><b>{failed} receipt photo{failed === 1 ? "" : "s"} couldn't upload.</b> They're still saved on this phone — no need to take them again.</span>
      <Button size="sm" variant="outline" onClick={() => { requestScanRetry(); setTimeout(() => void offlineScanStatus(userId).then((x) => { setScans(x.waiting); setFailed(x.failed); }), 1500); }}>Retry</Button>
      <Link to="/offline-receipts" className="text-xs font-semibold text-primary underline">Details</Link>
    </div>
  );
  const wait = [pendingCount ? `${pendingCount} ${pendingCount === 1 ? "entry" : "entries"}` : "", scans ? `${scans} receipt photo${scans === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ");
  return (
    <div role="status" aria-live="polite" className={"mb-3 flex items-start gap-2 rounded-2xl border px-3 py-2 text-sm " + (online ? "bg-secondary" : "border-gold bg-gold-soft")}>
      {!online ? <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-gold" /> : busy ? <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" /> : <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
      <span className="min-w-0 flex-1">
        {!online ? <><b>You're offline.</b> Your saved expenses on this phone are available. {wait ? `${wait} waiting to sync.` : "New entries and receipt photos are kept here until you reconnect."}</>
          : busy ? <><b>Back online — syncing…</b> {wait ? `${wait} still uploading.` : "Updating your figures."}</>
          : <><b>All synced.</b> Everything saved offline is now in your account.</>}
      </span>
    </div>
  );
}
