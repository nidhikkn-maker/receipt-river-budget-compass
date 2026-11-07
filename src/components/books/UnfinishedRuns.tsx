/** Unfinished Statement Desk documents [v6 §3]: resume, retry or discard without uploading again. */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { closeRun, effectiveStatus, openRuns, runFile, type DocRun } from "@/lib/books/runs";
import type { ExtractedDocument } from "@/lib/document-extract.functions";
import type { DocField, DocType } from "@/lib/documents";
import type { ResumeState } from "@/components/DocumentIntake";

export function UnfinishedRuns({ active, onResume }: { active: string[]; onResume: (file: File, resume: ResumeState, context: string) => void }) {
  const [runs, setRuns] = useState<DocRun[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = () => openRuns().then(rows => { setRuns(rows); setLoadError(null); }).catch(() => setLoadError('Unfinished documents could not be checked. Retry; saved work is unchanged.'));
  useEffect(() => { void load(); }, [active.length]);
  const list = (runs ?? []).filter((r) => !active.includes(r.id) && effectiveStatus(r) !== "running");
  if (!list.length && !loadError) return null;
  return (
    <section className="space-y-2 rounded-2xl border bg-card p-4 text-sm" aria-label="Unfinished documents">
      <p className="font-semibold">Unfinished documents ({list.length})</p>
      {loadError && <div role="alert"><p className="text-destructive">{loadError}</p><Button size="sm" variant="outline" onClick={load}>Retry checking documents</Button></div>}
      {list.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary/50 px-3 py-2 text-xs">
          <div className="min-w-0"><p className="truncate font-medium">{r.fileName}</p><p className="text-muted-foreground">{r.data.cleanupPending ? `${r.data.cleanupPending === 'done' ? 'Records saved' : 'Discard requested'} · original cleanup pending` : effectiveStatus(r) === "waiting" ? "Waiting for your confirmation" : `Stopped at ${r.stage}${r.error ? ` — ${r.error}` : ""}`} · {r.attempts} attempt{r.attempts === 1 ? "" : "s"}</p></div>
          <div className="flex gap-1">
            {r.data.cleanupPending ? <Button size="sm" variant="outline" onClick={async () => { try { await closeRun(r, r.data.cleanupPending ?? 'done'); await load(); } catch (error) { toast.error((error as Error).message); } }}>Retry original cleanup</Button> : <>
            <Button size="sm" variant="outline" onClick={async () => {
              try {
                const file = await runFile(r);
                onResume(file, { runId: r.id, read: r.data.read as ExtractedDocument | undefined, docType: r.data.docType as DocType | undefined, fields: r.data.fields as DocField[] | undefined, data: r.data }, r.context);
              } catch (e) { toast.error((e as Error).message); }
            }}>{r.data.read ? "Resume" : "Retry"}</Button>
            <Button size="sm" variant="ghost" onClick={async () => { await closeRun(r, "cancelled").catch((e) => toast.error((e as Error).message)); void load(); }}>Discard</Button>
            </>}
          </div>
        </div>
      ))}
    </section>
  );
}
