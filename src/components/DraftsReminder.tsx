import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { FilePen } from "lucide-react";
import { listDrafts, pendingDrafts } from "@/lib/drafts";

/** Subtle "expenses waiting" note; never forces the user into a draft. "Later" hides it for this session. */
export function DraftsReminder() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [count, setCount] = useState(0);
  const [later, setLater] = useState(false);
  useEffect(() => { setLater(sessionStorage.getItem("ll-drafts-later") === "1"); }, []);
  useEffect(() => { listDrafts().then((d) => setCount(pendingDrafts(d).length)).catch(() => {}); }, [path]);
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
