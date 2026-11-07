import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { reportLabel, type ReportType } from "@/lib/report-centre";
import { Button } from "./ui/button";

type Job = { id: string; kind: string; status: string; error: string | null; created_at: string };

/** Reports the server is finishing (app was closed) or that failed and can be retried. */
export function BackgroundReports({ onDone }: { onDone?: () => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const load = async () => {
    const since = new Date(Date.now() - 3 * 864e5).toISOString();
    const { data } = await supabase.from("report_jobs").select("id,kind,status,error,created_at").in("status", ["queued", "running", "failed"]).gte("created_at", since).order("created_at", { ascending: false }).limit(10);
    setJobs((prev) => { if (prev.some((p) => !(data ?? []).some((d) => d.id === p.id))) onDone?.(); return data ?? []; });
  };
  useEffect(() => { void load(); const t = setInterval(() => void load(), 15000); return () => clearInterval(t); }, []);
  const old = (j: Job) => Date.now() - Date.parse(j.created_at) > 120e3;
  const shown = jobs.filter((j) => j.status === "failed" || old(j));
  if (!shown.length) return null;
  return (
    <div className="mb-4 grid gap-2" aria-live="polite">
      {shown.map((j) => (
        <div key={j.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3 text-sm">
          {j.status === "failed" ? <AlertTriangle className="h-5 w-5 text-warning" /> : <Loader2 className="h-5 w-5 animate-spin text-primary" />}
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{reportLabel(j.kind as ReportType)}</div>
            <div className="text-xs text-muted-foreground">{j.status === "failed" ? j.error ?? "Couldn't finish" : "Finishing in the background — you can close the app"}</div>
          </div>
          {j.status === "failed" && j.error !== "Unknown report type" && (
            <Button size="sm" variant="outline" onClick={async () => { const { error } = await supabase.rpc("retry_my_report_job", { _id: j.id }); if (error) toast.error("Couldn't retry"); else { toast.success("Queued — it will finish within a couple of minutes"); void load(); } }}>Retry</Button>
          )}
        </div>
      ))}
    </div>
  );
}
