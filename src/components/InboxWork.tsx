import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FileText, PencilLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listDrafts } from "@/lib/drafts";

/** V5.0 §4: unfinished drafts and recently generated reports alongside review items. */
export function InboxWork() {
  const [drafts, setDrafts] = useState<number | null>(null);
  const [reports, setReports] = useState<{ id: string; title: string; created_at: string }[]>([]);
  useEffect(() => {
    let live = true;
    listDrafts().then((d) => live && setDrafts(d.filter((x) => x.status !== "saved").length)).catch(() => live && setDrafts(0));
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    supabase.from("report_history").select("id,title,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(3)
      .then(({ data }) => live && setReports(data ?? []));
    return () => { live = false; };
  }, []);
  if (!drafts && !reports.length) return null;
  return (
    <div className="mb-4 grid gap-2">
      {!!drafts && (
        <Link to="/drafts" className="flex items-center gap-3 rounded-2xl border bg-card p-3">
          <PencilLine className="h-5 w-5 text-gold-strong" />
          <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{drafts} unfinished {drafts === 1 ? "draft" : "drafts"}</div><div className="text-xs text-muted-foreground">Resume where you left off</div></div>
        </Link>
      )}
      {reports.map((r) => (
        <Link key={r.id} to="/report-centre" className="flex items-center gap-3 rounded-2xl border bg-card p-3">
          <FileText className="h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{r.title}</div><div className="text-xs text-muted-foreground">Report ready · {r.created_at.slice(0, 10)}</div></div>
        </Link>
      ))}
    </div>
  );
}
