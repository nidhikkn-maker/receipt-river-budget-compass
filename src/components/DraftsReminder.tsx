import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { FilePen } from "lucide-react";
import { listDrafts, pendingDrafts, syncLocalDrafts } from "@/lib/drafts";
import { localDrafts } from "@/lib/offline";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

/** Subtle "expenses waiting" note; never forces the user into a draft. "Later" hides it for this session. */
export function DraftsReminder() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [count, setCount] = useState(0);
  const [later, setLater] = useState(false);
  useEffect(() => { setLater(sessionStorage.getItem("ll-drafts-later") === "1"); }, []);
  const { userId } = useStore();
  const [tick, setTick] = useState(0);
  // Sync device-only drafts at start-up and whenever the connection comes back.
  useEffect(() => {
    const run = () => void syncLocalDrafts(userId).then((n) => { if (n) { toast.success(`${n} offline draft${n === 1 ? "" : "s"} synced`); setTick((t) => t + 1); } });
    run(); window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, [userId]);
  useEffect(() => {
    void (async () => {
      const local = await localDrafts(userId).catch(() => []);
      const server = navigator.onLine ? await listDrafts().catch(() => []) : [];
      setCount(new Set([...local.map((l) => l.id), ...pendingDrafts(server).map((d) => d.id)]).size);
    })();
  }, [path, tick, userId]);
  if (!count || later || path === "/drafts") return null;
  return (
    <div role="status" className="mb-3 flex items-center gap-2 rounded-2xl border bg-gold-soft px-3 py-2 text-sm">
      <FilePen className="h-4 w-4 shrink-0 text-gold" />
      <span className="min-w-0 flex-1">You have {count} expense{count === 1 ? "" : "s"} waiting to be completed.</span>
      <Link to="/drafts" className="font-semibold text-primary underline">Review drafts</Link>
      <button type="button" className="text-xs text-muted-foreground underline" onClick={() => { sessionStorage.setItem("ll-drafts-later", "1"); setLater(true); }}>Later</button>
    </div>
  );
}
