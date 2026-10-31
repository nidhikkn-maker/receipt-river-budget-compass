import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Eye, FileText, Paperclip, Share2 } from "lucide-react";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ProcessingPanel, stagesAt } from "@/components/ProcessingPanel";
import { useStore } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/expenses";
import { GROUP_TAG, NOT_RECORDED, buildStatement, paymentInfo, statementReference, subjectEntries, type Subject } from "@/lib/expenditure-statement";
import type { AnnexFile } from "@/lib/expenditure-pdf";
import { downloadBlob, deliverFile } from "@/lib/reports";
import type { TravelTrip } from "@/lib/travel";
import { cn } from "@/lib/utils";

import { buildClaim, type Claimant } from "@/lib/expense-claim";

const STAGES = ["Collecting transactions", "Fetching original bills", "Building statement", "Attaching annexures", "Saving to report history"];
const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
const today = () => new Date().toISOString().slice(0, 10);

async function toJpeg(blob: Blob): Promise<Uint8Array> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d")!.drawImage(img, 0, 0);
    const b = await new Promise<Blob>((r, j) => c.toBlob((x) => (x ? r(x) : j(new Error("convert"))), "image/jpeg", 0.92));
    return new Uint8Array(await b.arrayBuffer());
  } finally { URL.revokeObjectURL(url); }
}

export function ExpenditureReportBuilder({ mode, search }: { mode: "statement" | "claim"; search: { trip?: string | undefined; tag?: string | undefined; entry?: string | undefined } }) {
  const claimMode = mode === "claim";
  const [claimant, setClaimant] = useState<Claimant>({ name: "", employeeId: "", department: "", designation: "", approver: "", bankDetails: "", email: "" });
  useEffect(() => { try { const v = localStorage.getItem("ledgerline:claimant"); if (v) setClaimant((c) => ({ ...c, ...JSON.parse(v) })); } catch { /* ignore */ } }, []);
  const setC = (k: keyof Claimant, v: string) => setClaimant((c) => { const n = { ...c, [k]: v }; try { localStorage.setItem("ledgerline:claimant", JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const [claimFormat, setClaimFormat] = useState<"detailed" | "summary">("detailed");
  useEffect(() => { try { if (localStorage.getItem("ledgerline:claim-format") === "summary") setClaimFormat("summary"); } catch { /* ignore */ } }, []);
  const pickFormat = (f: "detailed" | "summary") => { setClaimFormat(f); try { localStorage.setItem("ledgerline:claim-format", f); } catch { /* ignore */ } };
  const store = useStore();
  const navigate = useNavigate();
  const trips = (store.preferences.trips ?? []) as TravelTrip[];
  const instruments = store.preferences.paymentInstruments ?? [];
  const groupTags = useMemo(() => [...new Set(store.transactions.flatMap((e) => e.tags ?? []).filter((t) => GROUP_TAG.test(t) && !t.startsWith("Trip: ")))].sort(), [store.transactions]);
  const purchases = useMemo(() => store.expenses.filter((e) => e.scope === "business" || e.scope === "official" || (e.workspaceAllocations ?? []).some((w) => w.workspace === "business" || w.workspace === "official")).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200), [store.expenses]);

  const initial = search.trip ? `trip:${search.trip}` : search.tag ? `tag:${search.tag}` : search.entry ? "entries" : trips[0] ? `trip:${trips[0].id}` : groupTags[0] ? `tag:${groupTags[0]}` : "entries";
  const [choice, setChoice] = useState(initial);
  const [picked, setPicked] = useState<string[]>(search.entry ? [search.entry] : []);
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [purpose, setPurpose] = useState(""); const [org, setOrg] = useState("");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [stage, setStage] = useState(-1); const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; url: string; name: string; missing: string[] } | null>(null);
  const cancelled = useRef(false);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const subject: Subject = choice.startsWith("trip:") ? { kind: "trip", id: choice.slice(5) } : choice.startsWith("tag:") ? { kind: "tag", tag: choice.slice(4) } : { kind: "entries", ids: picked };
  const subjectName = subject.kind === "trip" ? trips.find((t) => t.id === subject.id)?.name ?? "Trip" : subject.kind === "tag" ? subject.tag.replace(/^\w+: /, "") : picked.length === 1 ? store.expenses.find((e) => e.id === picked[0])?.title ?? "Business purchase" : "Business purchases";
  const candidates = useMemo(() => subjectEntries(subject, store.transactions, trips, from || undefined, to || undefined), [choice, picked, from, to, store.transactions, trips]);
  const included = candidates.filter((e) => !excluded.includes(e.id));
  const accountName = (id: string | null | undefined) => store.accounts.find((a) => a.id === id)?.name;

  async function generate() {
    cancelled.current = false; setFailed(false); setResult(null); setStage(0);
    try {
      if (!included.length) throw new Error("Choose at least one transaction.");
      const id = crypto.randomUUID(), reference = statementReference(today(), id);
      const st = buildStatement({ subject, subjectName, purpose, organisation: org, entries: included, trips, accounts: store.accounts, instruments, memberName: store.memberName, today: today(), reference });
      const claim = claimMode ? buildClaim(st, claimant) : null;
      if (claim && !claimant.name.trim()) throw new Error("Enter the claimant's name.");
      if (claim && !claim.items.length) throw new Error("Nothing to claim: none of the chosen expenses are personally paid, marked for reimbursement and still outstanding.");
      setStage(1);
      const files: Record<string, AnnexFile | null> = {};
      for (const a of claim ? claim.annexures : st.annexures) {
        if (cancelled.current) return;
        try {
          const url = await store.signedUrl(a.path); if (!url) throw new Error();
          const b = await (await fetch(url)).blob();
          const type = b.type || a.type;
          files[a.no] = type === "application/pdf" || /\.pdf$/i.test(a.name) ? { bytes: new Uint8Array(await b.arrayBuffer()), type: "application/pdf" }
            : type === "image/png" || type === "image/jpeg" ? { bytes: new Uint8Array(await b.arrayBuffer()), type } : { bytes: await toJpeg(b), type: "image/jpeg" };
        } catch { files[a.no] = null; }
      }
      setStage(2);
      const { renderStatementPdf } = await import("@/lib/expenditure-pdf");
      const { renderClaimPdf } = await import("@/lib/claim-pdf");
      setStage(3);
      const { blob, missing } = claim ? await renderClaimPdf(claim, files, claimFormat) : await renderStatementPdf(st, files);
      if (cancelled.current) return;
      const name = `ledgerline-${claim ? "claim" : "expenditure"}-${subjectName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${claim ? claim.reference : reference}.pdf`;
      setResult({ blob, url: URL.createObjectURL(blob), name, missing });
      setStage(4);
      const path = `${store.userId}/reports/${id}.pdf`;
      const up = await supabase.storage.from("receipts").upload(path, blob, { contentType: "application/pdf" });
      if (!up.error) {
        const { error } = await supabase.from("report_history").insert({ id, owner_id: store.userId, kind: claim ? "claim-submission" : "expenditure-statement", title: `${claim ? "Expense Claim Submission" : "Detailed Expenditure Statement"} — ${subjectName}`, period_from: st.start, period_to: st.end, workspace: "all", filters: { subject, excluded, reference } as never, file_path: path, file_size: blob.size, version: 1 });
        if (error) await supabase.storage.from("receipts").remove([path]);
        if (error) toast.error("The PDF is ready, but it couldn't be saved to report history.");
      } else toast.error("The PDF is ready, but it couldn't be saved to report history.");
      setStage(-1); toast.success(claim ? "Claim PDF ready" : "Statement ready", { description: "Saved in Reports Centre history.", action: { label: "Open", onClick: () => void navigate({ to: "/report-centre" }) } });
    } catch (e) { setFailed(true); toast.error(e instanceof Error ? e.message : "Couldn't prepare the statement"); }
  }
  const busy = stage >= 0 && !failed;
  const openPreview = (b: Blob) => { const u = URL.createObjectURL(b); window.open(u, "_blank"); setTimeout(() => URL.revokeObjectURL(u), 60_000); };

  return (
    <div className="space-y-5 pb-24">
      <PageTitle title={claimMode ? "Expense Claim Submission" : "Detailed Expenditure Statement"} sub={claimMode ? "A formal reimbursement request for your organisation's accounts team: claimed items, declaration, approval lines and the original bills." : "A complete record of what was spent, how it was paid and what is still to be reimbursed, with every original bill attached."} />
      {claimMode && (
        <section className="space-y-2 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Claimant details <span className="font-normal text-muted-foreground">(remembered on this device)</span></h2>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {([["name", "Name *"], ["employeeId", "Employee ID"], ["department", "Department"], ["designation", "Designation"], ["email", "Email"], ["approver", "Approving manager"]] as const).map(([k, l]) => (
              <label key={k}>{l}<input className={cn(sel, "mt-1")} value={claimant[k]} onChange={(e) => setC(k, e.target.value)} /></label>
            ))}
          </div>
          <label className="block text-xs">Pay reimbursement to (optional, e.g. bank name and last 4 digits)<input className={cn(sel, "mt-1")} value={claimant.bankDetails} onChange={(e) => setC("bankDetails", e.target.value)} /></label>
          <div className="space-y-1 text-xs">
            <p className="font-semibold">Format <span className="font-normal text-muted-foreground">(remembered)</span></p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Claim format">
              {([["detailed", "Detailed + Bills", "Every claimed item listed"], ["summary", "Summary + Bills", "Totals by category, shorter"]] as const).map(([v, l, d]) => (
                <button key={v} type="button" role="radio" aria-checked={claimFormat === v} onClick={() => pickFormat(v)} className={cn("rounded-md border p-2 text-left", claimFormat === v ? "border-primary bg-primary/10" : "border-input")}>
                  <span className="block font-medium">{l}</span><span className="text-muted-foreground">{d}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Only expenses you paid personally, marked for reimbursement and still outstanding are claimed. Making this PDF doesn't change any claim status.</p>
        </section>
      )}
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <label className="block text-sm font-semibold">What is this statement for?
          <select className={cn(sel, "mt-1")} value={choice} onChange={(e) => { setChoice(e.target.value); setExcluded([]); }}>
            {trips.length > 0 && <optgroup label="Trips">{trips.map((t) => <option key={t.id} value={`trip:${t.id}`}>{t.name}</option>)}</optgroup>}
            {groupTags.length > 0 && <optgroup label="Events, projects & groups">{groupTags.map((t) => <option key={t} value={`tag:${t}`}>{t}</option>)}</optgroup>}
            <option value="entries">Individual business purchases…</option>
          </select>
        </label>
        {choice === "entries" ? (
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
            {!purchases.length && <p className="text-sm text-muted-foreground">No business or official expenses yet.</p>}
            {purchases.map((e) => (
              <label key={e.id} className="flex items-center gap-2 text-sm"><Checkbox checked={picked.includes(e.id)} onCheckedChange={(v) => setPicked((p) => (v ? [...p, e.id] : p.filter((x) => x !== e.id)))} />
                <span className="flex-1 truncate">{e.date} · {e.merchant || e.title}</span><span className="tabular-nums">{money(e.amount)}</span></label>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label>From (optional)<input type="date" className={cn(sel, "mt-1")} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>To (optional)<input type="date" className={cn(sel, "mt-1")} value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label>Purpose<input className={cn(sel, "mt-1")} value={purpose} placeholder="e.g. Client visit" onChange={(e) => setPurpose(e.target.value)} /></label>
          <label>Organisation<input className={cn(sel, "mt-1")} value={org} placeholder="From entries if blank" onChange={(e) => setOrg(e.target.value)} /></label>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Review transactions <span className="text-sm font-normal text-muted-foreground">({included.length} of {candidates.length} included · {money(included.reduce((s, e) => s + ((e.txnType ?? "expense") === "refund" ? -e.amount : e.amount), 0))})</span></h2>
        {!candidates.length && <p className="text-sm text-muted-foreground">No expenses are linked to this yet. Tag entries with the trip, event or project to include them.</p>}
        {candidates.map((e) => {
          const p = paymentInfo(e, store.accounts, instruments, store.memberName);
          const on = !excluded.includes(e.id);
          return (
            <label key={e.id} className={cn("flex gap-3 rounded-xl border bg-card p-3 text-sm", !on && "opacity-50")}>
              <Checkbox checked={on} onCheckedChange={(v) => setExcluded((x) => (v ? x.filter((i) => i !== e.id) : [...x, e.id]))} aria-label={`Include ${e.title}`} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2"><span className="truncate font-medium">{e.merchant || e.title}</span><span className="tabular-nums">{(e.txnType ?? "expense") === "refund" ? "−" : ""}{money(e.originalAmount, e.currency)}</span></div>
                <div className="text-xs text-muted-foreground">{e.date} · {e.category} · {p.method} · <span className={cn(p.source === NOT_RECORDED && "text-destructive")}>{p.source}</span> · {p.payer}</div>
                <div className="text-xs text-muted-foreground">{e.receipts.length ? <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" />{e.receipts.length} bill{e.receipts.length > 1 ? "s" : ""}</span> : <span className="text-destructive">Bill not attached</span>}{e.reimbursementStatus && e.reimbursementStatus !== "none" ? ` · reimbursement ${e.reimbursementStatus}` : ""}{accountName(e.accountId) ? "" : ""}</div>
              </div>
            </label>
          );
        })}
        <p className="text-xs text-muted-foreground">Unticking only leaves an entry out of this statement; your records are not changed. Fix payment details or reimbursement status on the entry itself.</p>
      </section>

      <Button className="w-full" onClick={generate} disabled={busy || !included.length}><FileText className="mr-1 h-4 w-4" />{claimMode ? "Generate claim PDF" : "Generate statement PDF"}</Button>
      <p className="text-xs text-muted-foreground">Prepared on this device — keep this page open until it's ready.</p>
      {stage >= 0 && <ProcessingPanel title={failed ? "Statement not finished" : "Preparing your statement… you can keep using the app; we'll tell you when it's ready"} stages={stagesAt(STAGES, stage, failed)} {...(busy ? { onCancel: () => { cancelled.current = true; setStage(-1); } } : {})} />}

      {result && (
        <section className="space-y-3 rounded-xl border bg-card p-4">
          {result.missing.length > 0 && <p className="text-sm text-destructive">{result.missing.length} bill{result.missing.length > 1 ? "s" : ""} couldn't be read and {result.missing.length > 1 ? "are" : "is"} marked "not readable" in the PDF ({result.missing.join(", ")}).</p>}
          <iframe title="Statement preview" src={result.url} className="h-[70vh] w-full rounded-md border bg-background" />
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" onClick={() => openPreview(result.blob)}><Eye className="mr-1 h-4 w-4" />Open</Button>
            <Button variant="outline" onClick={() => downloadBlob(result.blob, result.name)}><Download className="mr-1 h-4 w-4" />Download</Button>
            <Button onClick={() => { void deliverFile(result.blob, result.name); }}><Share2 className="mr-1 h-4 w-4" />Share</Button>
          </div>
          <p className="text-xs text-muted-foreground">Also saved in Reports Centre → Report history.</p>
        </section>
      )}
    </div>
  );
}
