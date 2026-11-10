import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FileText, PencilLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listDrafts } from "@/lib/drafts";
import { groupImportInbox, type ImportInboxItem } from '@/lib/import-inbox';
import { backgroundAllowed } from '@/lib/lock-gate';

/** V5.0 §4: unfinished drafts and recently generated reports alongside review items. */
export function InboxWork() {
  const [drafts, setDrafts] = useState<number | null>(null);
  const [reports, setReports] = useState<{ id: string; title: string; created_at: string }[]>([]);
  const [imports,setImports]=useState<ImportInboxItem[]>([]);
  const [importError,setImportError]=useState(false);
  const [reportError,setReportError]=useState(false);
  useEffect(() => {
    let live = true;let busy = false;
    const refreshImports=async()=>{
      const {data,error}=await supabase.from('import_batches').select('id,file_name,status').in('status',['review','queued','processing','failed','paused','refused']).order('created_at',{ascending:false}).limit(30);
      if(!live)return;setImportError(!!error);if(!error)setImports(data??[]);busy=(data??[]).some(b=>b.status==='queued'||b.status==='processing');
    };
    void refreshImports();const timer=window.setInterval(()=>{if(busy&&document.visibilityState==='visible'&&backgroundAllowed())void refreshImports();},5000);const onFocus=()=>{if(backgroundAllowed())void refreshImports();};window.addEventListener('focus',onFocus);
    listDrafts().then((d) => live && setDrafts(d.filter((x) => x.status !== "saved").length)).catch(() => live && setDrafts(0));
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    supabase.from("report_history").select("id,title,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(3)
      .then(({ data, error }) => { if (!live) return; setReportError(!!error); if (!error) setReports(data ?? []); });
    return () => { live = false;window.clearInterval(timer);window.removeEventListener('focus',onFocus); };
  }, []);
  if (!drafts && !reports.length && !imports.length && !importError && !reportError) return null;
  return (
    <div className="mb-4 grid gap-2">
      {importError&&<p role="status" className="text-sm text-warning">Could not refresh statement imports.</p>}
      {reportError&&<p role="status" className="text-sm text-warning">Could not load recent reports. Nothing has been deleted.</p>}
      {!!imports.length && <h2 className="text-lg font-semibold">Statement imports</h2>}
      {groupImportInbox(imports).map(group=><section key={group.label} aria-label={`Imports · ${group.label}`} className="space-y-2"><h3 className="text-xs font-medium text-muted-foreground">{group.label} · {group.items.length}{imports.length === 30 ? ' · latest 30 shown' : ''}</h3>{group.items.slice(0, 4).map(b=><Link key={b.id} to="/historical-import" search={{batch:b.id}} className="flex gap-3 items-center border rounded-lg bg-card p-3"><FileText className="h-5 w-5 shrink-0 text-primary"/><div className="min-w-0"><p className="truncate text-sm font-semibold">{b.file_name}</p><p className="text-xs text-muted-foreground">Statement import · {b.status==='review'?'Ready for review':b.status}</p></div></Link>)}{group.items.length > 4 && <Link to="/historical-import" className="text-sm text-primary underline">View all {group.label.toLowerCase()} imports</Link>}</section>)}
      {!!drafts && (
        <Link to="/drafts" className="flex items-center gap-3 rounded-2xl border bg-card p-3">
          <PencilLine className="h-5 w-5 text-gold-strong" />
          <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{drafts} unfinished {drafts === 1 ? "draft" : "drafts"}</div><div className="text-xs text-muted-foreground">Resume where you left off</div></div>
        </Link>
      )}
      {!!reports.length && <h2 className="mt-4 text-lg font-semibold">Reports & notifications</h2>}
      {reports.map((r) => (
        <Link key={r.id} to="/report-centre" className="flex items-center gap-3 rounded-2xl border bg-card p-3">
          <FileText className="h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{r.title}</div><div className="text-xs text-muted-foreground">Report ready · {r.created_at.slice(0, 10)}</div></div>
        </Link>
      ))}
    </div>
  );
}
