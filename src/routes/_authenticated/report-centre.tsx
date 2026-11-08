import { SectionTabs } from "@/components/SectionTabs";
import { BackgroundReports } from "@/components/BackgroundReports";
import { useNavigate } from "@tanstack/react-router";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Eye, FileText, RefreshCw, Share2, Trash2 } from "lucide-react";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ProcessingPanel, stagesAt } from "@/components/ProcessingPanel";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useStore } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_SCOPES, SCOPE_LABEL, type Scope } from "@/lib/expenses";
import { PERIOD_LABEL, REPORT_TYPES, buildReportDoc, emptyFilters, needsTrip, orgOf, periodRange, reportLabel, type DraftLite, type Period, type ReportDoc, type ReportFilters, type ReportType, type StatusFilter } from "@/lib/report-centre";
import { downloadBlob, deliverFile } from "@/lib/reports";
import { listDrafts } from "@/lib/drafts";
import { localDrafts } from "@/lib/offline";
import type { TravelTrip } from "@/lib/travel";
import { cn } from "@/lib/utils";
import { savePreparedReport } from '@/lib/report-save';
import { saveLocalClaimReport, loadLocalClaimReport, clearLocalClaimReport, type ClaimReportJob } from '@/lib/claim-preparations';

export const Route = createFileRoute("/_authenticated/report-centre")({
  head: () => ({ meta: [
    { title: "Reports Centre — Ledgerline" },
    { name: "description", content: "Generate, preview, download and share PDF financial, workspace and travel reports." },
    { property: "og:title", content: "Reports Centre — Ledgerline" },
    { property: "og:description", content: "Generate, preview, download and share PDF financial, workspace and travel reports." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ReportCentre,
});

interface HistoryRow { id: string; kind: string; title: string; period_from: string | null; period_to: string | null; workspace: string; filters: unknown; status: string; file_path: string | null; file_size: number | null; version: number; created_at: string }
const STAGES = ["Collecting your records", "Calculating totals", "Preparing PDF", "Saving to report history"];
const today = () => new Date().toISOString().slice(0, 10);
const kb = (n: number | null) => (n == null ? "—" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";

function ReportCentre() {
  const store = useStore();
  const navigate = useNavigate();
  const trips = (store.preferences.trips ?? []) as TravelTrip[];
  const [type, setType] = useState<ReportType>("monthly");
  const [period, setPeriod] = useState<Period>("month");
  const [custom, setCustom] = useState({ from: today().slice(0, 8) + "01", to: today() });
  const [f, setF] = useState<Omit<ReportFilters, "from" | "to">>(() => { const { from: _a, to: _b, ...rest } = emptyFilters("", ""); return rest; });
  const [style, setStyle] = useState<"colour" | "mono">("colour");
  const [stage, setStage] = useState(-1);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; url: string; name: string; doc: ReportDoc } | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [ready, setReady] = useState<Record<string, Blob>>({});
  const [confirmDel, setConfirmDel] = useState<HistoryRow | null>(null);
  const cancelled = useRef(false);
  const pending = useRef<ClaimReportJob | null>(null);
  const [recovering,setRecovering] = useState(true);
  const [recoveryError,setRecoveryError] = useState(false);

  const range = periodRange(period, today(), custom);
  const currencies = useMemo(() => [...new Set(store.transactions.map((e) => e.currency))].sort(), [store.transactions]);
  const tags = useMemo(() => [...new Set(store.transactions.flatMap((e) => e.tags ?? []))].sort(), [store.transactions]);
  const orgs = useMemo(() => [...new Set(store.transactions.map(orgOf))].filter((o) => o !== "Unassigned").sort(), [store.transactions]);
  const categories = useMemo(() => store.preferences.categories.filter((c) => !c.archived).map((c) => c.name), [store.preferences.categories]);

  const loadHistory = async () => {
    const { data } = await supabase.from("report_history").select("*").order("created_at", { ascending: false }).limit(50);
    setHistory((data ?? []) as HistoryRow[]);
  };
  useEffect(() => { void loadHistory(); }, []);
  useEffect(() => { let active=true;setRecovering(true);setRecoveryError(false);void loadLocalClaimReport(store.userId,'centre-report').then(job=>{if(!active)return;pending.current=job;if(job){const doc=(job.row.filters as unknown as {snapshot:ReportDoc}).snapshot;const blob=new Blob([new Uint8Array(job.bytes)],{type:'application/pdf'});setResult({blob,doc,name:job.name,url:URL.createObjectURL(blob)});setFailed(true);setStage(3);}}).catch(()=>{if(active){setRecoveryError(true);setFailed(true);toast.error('Could not recover the saved report. Please reopen this page before preparing another.');}}).finally(()=>{if(active)setRecovering(false);});return()=>{active=false;}; },[store.userId]);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  async function generate(override?: { type: ReportType; filters: ReportFilters }) {
    if(pending.current){setFailed(false);setStage(3);try{await persistReport(pending.current);setStage(-1);}catch(e){setFailed(true);toast.error((e as Error).message);}return;}
    cancelled.current = false; setFailed(false); setResult(null); setStage(0);
    try {
      const t = override?.type ?? type;
      const filters: ReportFilters = override?.filters ?? { ...f, from: range.from, to: range.to };
      if (needsTrip(t) && !trips.length) throw new Error("Add a trip in Travel Manager first.");
      let drafts: DraftLite[] = [];
      if (t === "drafts") {
        const server = navigator.onLine ? await listDrafts().catch(() => []) : [];
        const local = await localDrafts(store.userId).catch(() => []);
        drafts = [...local.map((d) => ({ id: d.id, status: "waiting_to_sync", updatedAt: d.updatedAt, data: d.data as DraftLite["data"], localOnly: true })), ...server.filter((s) => !local.some((l) => l.id === s.id)).map((s) => ({ id: s.id, status: s.status, updatedAt: s.updatedAt, data: s.data as DraftLite["data"] }))];
      }
      // Record the job first: if the app closes before the PDF is saved, the server finishes it.
      const jobId = crypto.randomUUID();
      setStage(1);
      const doc = buildReportDoc(t, filters, {
        transactions: store.transactions, accounts: store.accounts, valuations: store.valuations, commitments: store.commitments, loans: store.loans,
        budgets: store.budgets as Record<string, number>, trips, drafts, memberName: (id) => (id === "me" ? store.memberName(null) : store.memberName(id)),
        accountName: (id) => store.accounts.find((a) => a.id === id)?.name ?? "No account", today: today(),
      });
      if (cancelled.current) return;
      setStage(2);
      // Background completion uses the queued source snapshot, not later ledger values.
      if(navigator.onLine){const queued=await supabase.from('report_jobs').insert({id:jobId,owner_id:store.userId,kind:t,filters:{...filters,snapshot:doc} as never,style,status:'running',lease_until:new Date(Date.now()+120e3).toISOString()});if(queued.error)throw Error('Could not queue this report safely. Please retry.');}
      const { renderReportPdf } = await import("@/lib/report-pdf");
      const blob = await renderReportPdf(doc, style, new Date());
      if (cancelled.current) return;
      const name = `ledgerline-${t}-${filters.from}-to-${filters.to}.pdf`;
      setResult({ blob, url: URL.createObjectURL(blob), name, doc });
      setStage(3);
        const id = jobId, path = `${store.userId}/reports/${id}.pdf`;
        const prior = Math.max(0,...history.filter((h) => h.kind === t && h.period_from === filters.from && h.period_to === filters.to).map(h=>h.version));
        const job:ClaimReportJob={id,path,name,activity:t,missing:[],bytes:Array.from(new Uint8Array(await blob.arrayBuffer())),row:{id,owner_id:store.userId,kind:t,title:reportLabel(t),period_from:filters.from,period_to:filters.to,workspace:filters.workspaces.join(',')||'all',filters:{...filters,style,snapshot:doc} as never,file_path:path,file_size:blob.size,version:prior+1}};
        await saveLocalClaimReport(store.userId,job,'centre-report');pending.current=job;
        if(!navigator.onLine)throw Error('Your PDF is saved on this device. Retry saving when connected.');
        await persistReport(job);
      setStage(-1);
      toast.success(`${doc.title} is ready`, { description: "Saved in report history.", action: { label: "Open", onClick: () => void navigate({ to: "/report-centre" }) } });
    } catch (e) {
      setFailed(true); toast.error(e instanceof Error ? e.message : "Couldn't prepare the report");
    }
  }
  async function persistReport(job:ClaimReportJob){
    if(job.row.owner_id!==store.userId)throw Error('Report owner differs; saved evidence was not changed.');
    const blob=new Blob([new Uint8Array(job.bytes)],{type:'application/pdf'});
    await savePreparedReport({id:job.id,owner:store.userId,path:job.path,size:blob.size},{read:async()=>supabase.from('report_history').select('id,owner_id,file_path,file_size').eq('id',job.id).eq('owner_id',store.userId).maybeSingle(),upload:async()=>{
      const existing=await supabase.storage.from('receipts').download(job.path);
      if(existing.data){const bytes=new Uint8Array(await existing.data.arrayBuffer());if(bytes.length!==job.bytes.length||bytes.some((b,i)=>b!==job.bytes[i]))throw Error('Saved PDF bytes differ. Nothing was replaced.');return {error:null};}
      if(existing.error&&!/not found|404|does not exist/i.test(existing.error.message))return {error:existing.error};
      return supabase.storage.from('receipts').upload(job.path,blob,{contentType:'application/pdf',upsert:false});
    },insert:async()=>supabase.from('report_history').insert(job.row)});
    const saved=await supabase.storage.from('receipts').download(job.path);
    if(saved.error||!saved.data)throw Error('Saved report bytes could not be confirmed. Retry without replacing your PDF.');
    const verified=new Uint8Array(await saved.data.arrayBuffer());
    if(verified.length!==job.bytes.length||verified.some((b,i)=>b!==job.bytes[i]))throw Error('Saved PDF bytes differ. Evidence retained for checking.');
    const done=await supabase.rpc('finish_my_report_job',{_id:job.id});if(done.error)throw Error('PDF saved; completion status needs retry. Your saved evidence remains unchanged.');
    await clearLocalClaimReport(store.userId,'centre-report');pending.current=null;
    setReady(r=>({...r,[job.id]:blob}));await loadHistory();
  }

  // Fetch stored PDFs ahead of the tap so Download/Share keep the user's tap on iPhone.
  async function prepare(h: HistoryRow) {
    if (!h.file_path || ready[h.id]) return;
    const { data, error } = await supabase.storage.from("receipts").download(h.file_path);
    if (error || !data) { toast.error("Couldn't open that report"); return; }
    setReady((r) => ({ ...r, [h.id]: new Blob([data], { type: "application/pdf" }) }));
  }
  useEffect(() => { for (const h of history.slice(0, 10)) void prepare(h); }, [history]);

  async function remove(h: HistoryRow) {
    if (h.file_path) await supabase.storage.from("receipts").remove([h.file_path]);
    const { error } = await supabase.from("report_history").delete().eq("id", h.id);
    if (error) toast.error("Couldn't delete the report"); else { toast.success("Report deleted"); await loadHistory(); }
  }
  const openPreview = (b: Blob) => { const u = URL.createObjectURL(b); window.open(u, "_blank"); setTimeout(() => URL.revokeObjectURL(u), 60_000); };
  const busy = stage >= 0 && !failed;
  const toggleWs = (s: Scope) => setF((x) => ({ ...x, workspaces: x.workspaces.includes(s) ? x.workspaces.filter((w) => w !== s) : [...x.workspaces, s] }));

  return (
    <div className="uix-family-reports space-y-6 pb-24">
      <SectionTabs group="reports" active="pdf" /><PageTitle title="Reports Centre" sub="Generate PDF reports from your recorded entries, then preview, download or share them." />
      <BackgroundReports onDone={() => void loadHistory()} />

      <Link to="/expenditure-statement" className="flex items-center justify-between rounded-xl border bg-card p-4 text-sm"><span><span className="block font-semibold">Detailed Expenditure Statement</span><span className="text-muted-foreground">One trip, event, project or purchase, with original bills attached</span></span><FileText className="h-5 w-5 text-primary" /></Link>
      <Link to="/claim-submission" className="flex items-center justify-between rounded-xl border bg-card p-4 text-sm"><span><span className="block font-semibold">Expense Claim Submission</span><span className="text-muted-foreground">Formal reimbursement claim with declaration, approval lines and bills</span></span><FileText className="h-5 w-5 text-primary" /></Link>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <label className="block text-sm font-semibold">Report
          <select className={cn(sel, "mt-1 w-full")} value={type} onChange={(e) => setType(e.target.value as ReportType)}>
            {(["Financial", "Workspace", "Travel", "Operational"] as const).map((g) => (
              <optgroup key={g} label={`${g} reports`}>{REPORT_TYPES.filter((r) => r[2] === g && r[0] !== "ws-official").map((r) => <option key={r[0]} value={r[0]}>{r[1]}</option>)}</optgroup>
            ))}
          </select>
        </label>

        <div>
          <div className="mb-1 text-sm font-semibold">Period</div>
          <div className="flex flex-wrap gap-1.5">{(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", period === p ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>{PERIOD_LABEL[p]}</button>
          ))}</div>
          {period === "custom" && <div className="mt-2 flex gap-2"><input type="date" aria-label="From" className={sel} value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /><input type="date" aria-label="To" className={sel} value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></div>}
          <p className="mt-1 text-xs text-muted-foreground">{range.from} to {range.to}</p>
        </div>

        {!type.startsWith("ws-") && type !== "consolidated" && (
          <div>
            <div className="mb-1 text-sm font-semibold">Workspaces <span className="font-normal text-muted-foreground">(none selected = all)</span></div>
            <div className="flex flex-wrap gap-1.5">{ACTIVE_SCOPES.map((s) => (
              <button key={s} type="button" aria-pressed={f.workspaces.includes(s)} onClick={() => toggleWs(s)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", f.workspaces.includes(s) ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>{SCOPE_LABEL[s]}</button>
            ))}</div>
          </div>
        )}

        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-semibold">More filters</summary>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <label>Account<select className={cn(sel, "mt-1 w-full")} value={f.accountIds[0] ?? ""} onChange={(e) => setF({ ...f, accountIds: e.target.value ? [e.target.value] : [] })}><option value="">All accounts & cards</option>{store.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <label>Category<select className={cn(sel, "mt-1 w-full")} value={f.categories[0] ?? ""} onChange={(e) => setF({ ...f, categories: e.target.value ? [e.target.value] : [] })}><option value="">All</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label>Tag<select className={cn(sel, "mt-1 w-full")} value={f.tags[0] ?? ""} onChange={(e) => setF({ ...f, tags: e.target.value ? [e.target.value] : [] })}><option value="">All</option>{tags.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label>Person<select className={cn(sel, "mt-1 w-full")} value={f.memberIds[0] ?? ""} onChange={(e) => setF({ ...f, memberIds: e.target.value ? [e.target.value] : [] })}><option value="">Everyone</option><option value="me">Myself</option>{store.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            <label>Trip<select className={cn(sel, "mt-1 w-full")} value={f.tripId ?? ""} onChange={(e) => setF({ ...f, tripId: e.target.value || null })}><option value="">{needsTrip(type) ? "Trips in period" : "All"}</option>{trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label>Currency<select className={cn(sel, "mt-1 w-full")} value={f.currency ?? ""} onChange={(e) => setF({ ...f, currency: e.target.value || null })}><option value="">All</option>{currencies.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label>Organisation<select className={cn(sel, "mt-1 w-full")} value={f.organisation ?? ""} onChange={(e) => setF({ ...f, organisation: e.target.value || null })}><option value="">All</option>{orgs.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label>Status<select className={cn(sel, "mt-1 w-full")} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as StatusFilter })}><option value="all">All</option><option value="reconciled">Bank matched</option><option value="unreconciled">Not matched</option><option value="reimbursement_pending">Reimbursement pending</option></select></label>
          </div>
        </details>

        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold">Style</span>
          <label className="flex items-center gap-1"><input type="radio" checked={style === "colour"} onChange={() => setStyle("colour")} /> Colour</label>
          <label className="flex items-center gap-1"><input type="radio" checked={style === "mono"} onChange={() => setStyle("mono")} /> Printer-friendly</label>
        </div>

        <Button className="w-full" onClick={() => generate()} disabled={busy||recovering||recoveryError}><FileText className="mr-1 h-4 w-4" />{pending.current?'Retry saving PDF':'Generate PDF'}</Button>
        <p className="text-xs text-muted-foreground">Reports are prepared on this device. Keep this page open until the PDF is ready.</p>
      </section>

      {stage >= 0 && <ProcessingPanel title={failed ? "Report not finished" : `Preparing ${reportLabel(type)}… you can keep using the app; we'll tell you when it's ready`} stages={stagesAt(STAGES, stage, failed)} {...(busy ? { onCancel: () => { cancelled.current = true; setStage(-1); } } : {})} />}

      {result && (
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{result.doc.title}</h2><span className="text-xs text-muted-foreground">{result.doc.rowCount} rows · {kb(result.blob.size)}</span></div>
          <iframe title="Report preview" src={result.url} className="h-[70vh] w-full rounded-md border bg-background" />
          <p className="text-xs text-muted-foreground">On iPhone the preview may show only the first page — use Open to see every page.</p>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" onClick={() => openPreview(result.blob)}><Eye className="mr-1 h-4 w-4" />Open</Button>
            <Button variant="outline" onClick={() => downloadBlob(result.blob, result.name)}><Download className="mr-1 h-4 w-4" />Download</Button>
            <Button onClick={() => { void deliverFile(result.blob, result.name); }}><Share2 className="mr-1 h-4 w-4" />Share</Button>
          </div>
          {!!result.doc.figureEvidence?.length&&<Button variant="outline" onClick={()=>downloadBlob(new Blob([JSON.stringify(result.doc.figureEvidence,null,2)],{type:'application/json'}),'report-figure-evidence.json')}>Download figure evidence</Button>}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Report history</h2>
        {!history.length && <p className="text-sm text-muted-foreground">Reports you generate are kept here, unchanged, until you delete them.</p>}
        {history.map((h) => {
          const b = ready[h.id], name = `ledgerline-${h.kind}-${h.period_from}-to-${h.period_to}-v${h.version}.pdf`;
          return (
            <div key={h.id} className="rounded-xl border bg-card p-3 text-sm">
              <div className="flex justify-between gap-2"><span className="font-semibold">{h.title}{h.version > 1 ? ` · v${h.version}` : ""}</span><span className="text-xs text-muted-foreground">{kb(h.file_size)}</span></div>
              <div className="text-xs text-muted-foreground">{h.period_from} to {h.period_to} · {h.workspace === "all" ? "All workspaces" : h.workspace.split(",").map((w) => SCOPE_LABEL[w as Scope] ?? w).join(", ")} · generated {new Date(h.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · {h.status === "ready" ? "Ready" : "Failed"}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {!!(h.filters as {snapshot?:ReportDoc})?.snapshot?.figureEvidence?.length&&<Button size="sm" variant="outline" onClick={()=>downloadBlob(new Blob([JSON.stringify((h.filters as {snapshot:ReportDoc}).snapshot.figureEvidence,null,2)],{type:'application/json'}),'saved-report-figure-evidence.json')}>Figure evidence</Button>}
                <Button size="sm" variant="outline" disabled={!b} onClick={() => b && openPreview(b)}><Eye className="mr-1 h-3.5 w-3.5" />Preview</Button>
                <Button size="sm" variant="outline" disabled={!b} onClick={() => b && downloadBlob(b, name)}><Download className="mr-1 h-3.5 w-3.5" />Download</Button>
                <Button size="sm" variant="outline" disabled={!b} onClick={() => { if (b) void deliverFile(b, name); }}><Share2 className="mr-1 h-3.5 w-3.5" />Share</Button>
                {!b && <Button size="sm" variant="ghost" onClick={() => prepare(h)}>Load</Button>}
                {h.kind !== "expenditure-statement" && h.kind !== "claim-submission" && <Button size="sm" variant="outline" disabled={busy} onClick={() => { const fl = h.filters as ReportFilters & { style?: "colour" | "mono" }; if (fl.style) setStyle(fl.style); setType(h.kind as ReportType); return generate({ type: h.kind as ReportType, filters: fl }); }}><RefreshCw className="mr-1 h-3.5 w-3.5" />Regenerate</Button>}
                <Button size="sm" variant="ghost" aria-label="Delete report" onClick={() => setConfirmDel(h)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          );
        })}
      </section>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this report?</AlertDialogTitle><AlertDialogDescription>The saved PDF is removed. Your financial records are not affected.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep</AlertDialogCancel><AlertDialogAction onClick={() => { if (confirmDel) void remove(confirmDel); setConfirmDel(null); }}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
