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
import { ClaimProfilePanel } from './ClaimProfilePanel';
import { ClaimOrganisationAllocation } from './ClaimOrganisationAllocation';
import { ClaimExpenseDiscovery } from './ClaimExpenseDiscovery';
import { ClaimExpenseDetails } from './ClaimExpenseDetails';
import { ClaimSearchSelect } from './ClaimSearchSelect';
import { useClaimPreparation } from './useClaimPreparation';
import type { ClaimPreparationData } from '@/lib/claim-preparations';
import type { Expense } from '@/lib/expenses';
import { DEFAULT_DECLARATION, maskedText, organisationStatement, profileClaimant, reimbursementAccountLabel, resolveReimbursementProfile, responsibilityShares } from '@/lib/reimbursement-profiles';

import { buildClaim, applyAdvance, type Claimant } from "@/lib/expense-claim";
import { fetchPrivateFile } from "@/lib/private-files";
import { reportDocumentError } from "@/lib/report-documents";
import { ReportDocumentVerification, type ReportDocumentCheck } from "./ReportDocumentVerification";

const STAGES = ["Collecting transactions", "Fetching original bills", "Building statement", "Attaching annexures", "Saving to report history"];
const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
const today = () => new Date().toISOString().slice(0, 10);

async function toJpeg(blob: Blob): Promise<Uint8Array> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const context = c.getContext('2d'); if (!context) throw Error('Image conversion unavailable'); context.drawImage(img, 0, 0);
    const b = await new Promise<Blob>((r, j) => c.toBlob((x) => (x ? r(x) : j(new Error("convert"))), "image/jpeg", 0.92));
    return new Uint8Array(await b.arrayBuffer());
  } finally { URL.revokeObjectURL(url); }
}

export function ExpenditureReportBuilder({ mode, search }: { mode: "statement" | "claim"; search: { trip?: string | undefined; tag?: string | undefined; entry?: string | undefined; entries?: string | undefined } }) {
  const claimMode = mode === "claim";
  const [claimant, setClaimant] = useState<Claimant>({ name: "", employeeId: "", department: "", designation: "", approver: "", bankDetails: "", email: "" });
  const [claimFormat, setClaimFormat] = useState<"detailed" | "summary">("detailed");
  const store = useStore();
  const navigate = useNavigate();
  const trips = (store.preferences.trips ?? []) as TravelTrip[];
  const instruments = store.preferences.paymentInstruments ?? [];
  const groupTags = useMemo(() => [...new Set([...store.preferences.tags.filter(t=>['Project','Event','Purpose','Client'].includes(t.group)).map(t=>`${t.group}: ${t.name}`),...store.transactions.flatMap((e) => e.tags ?? []).filter((t) => GROUP_TAG.test(t) && !t.startsWith("Trip: "))])].sort(), [store.transactions,store.preferences.tags]);
  const purchases = useMemo(() => store.expenses.filter((e) => e.scope === "business" || e.scope === "official" || (e.workspaceAllocations ?? []).some((w) => w.workspace === "business" || w.workspace === "official")).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200), [store.expenses]);

  const initial = search.trip ? `trip:${search.trip}` : search.tag ? `tag:${search.tag}` : search.entry || search.entries ? "entries" : trips[0] ? `trip:${trips[0].id}` : groupTags[0] ? `tag:${groupTags[0]}` : "entries";
  const [choice, setChoice] = useState(initial);
  const [picked, setPicked] = useState<string[]>(search.entries ? search.entries.split(",").filter((id) => store.transactions.some((e) => e.id === id)).slice(0, 500) : search.entry ? [search.entry] : []);
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [purpose, setPurpose] = useState(""); const [org, setOrg] = useState("");
  const [profileId, setProfileId] = useState(''); const [routeId, setRouteId] = useState(''); const [receivingAccountId, setReceivingAccountId] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(''); const [methodFilter, setMethodFilter] = useState(''); const [confirmed, setConfirmed] = useState(false);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [stage, setStage] = useState(-1); const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; url: string; name: string; missing: string[] } | null>(null);
  const cancelled = useRef(false);
  const [documentChecks, setDocumentChecks] = useState<ReportDocumentCheck[] | null>(null);
  const documentDecision = useRef<((proceed: boolean) => void) | null>(null);
  useEffect(() => () => { documentDecision.current?.(false); }, []);
  const initializedActivity = useRef('');
  const restoredProfile = useRef(false);
  const [rejected,setRejected]=useState<string[]>([]),[detail,setDetail]=useState<Expense|null>(null),[reviewSearch,setReviewSearch]=useState(''),[reviewSort,setReviewSort]=useState('date'),[priorClaimIds,setPriorClaimIds]=useState<string[]>([]),[allowRepeat,setAllowRepeat]=useState(false),[historyCheck,setHistoryCheck]=useState<'loading'|'ready'|'error'>('loading'),[advanceInput,setAdvanceInput]=useState(''),[priorAdvance,setPriorAdvance]=useState<Record<string,number>>({});
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const subject: Subject = choice.startsWith("trip:") ? { kind: "trip", id: choice.slice(5) } : choice.startsWith("tag:") ? { kind: "tag", tag: choice.slice(4) } : { kind: "entries", ids: picked };
  const subjectName = subject.kind === "trip" ? trips.find((t) => t.id === subject.id)?.name ?? "Trip" : subject.kind === "tag" ? subject.tag.replace(/^\w+: /, "") : picked.length === 1 ? store.expenses.find((e) => e.id === picked[0])?.title ?? "Business purchase" : "Business purchases";
  const candidates = useMemo(() => subjectEntries(subject, store.transactions, trips, from || undefined, to || undefined), [choice, picked, from, to, store.transactions, trips]);
  const included = candidates.filter((e) => !excluded.includes(e.id));
  const accountName = (id: string | null | undefined) => store.accounts.find((a) => a.id === id)?.name;
  const settings = store.preferences.reimbursementSettings;
  const selectedTrip = choice.startsWith('trip:') ? trips.find(t => t.id === choice.slice(5)) : undefined;
  const fallbackOrg = selectedTrip?.organisation ?? '';
  const activity = choice === 'entries' ? `entries:${[...picked].sort().join(',')}` : choice;
  const profile = resolveReimbursementProfile(settings, { organisation: org, activity, ...(profileId ? { explicitId: profileId } : {}), ...(selectedTrip?.primaryWorkspace ? { workspace: selectedTrip.primaryWorkspace } : {}) }).profile;
  useEffect(() => {
    if (store.loading || initializedActivity.current === activity || (choice.startsWith('trip:') && !selectedTrip)) return;
    initializedActivity.current = activity;
    setProfileId(''); setConfirmed(false); setAllowRepeat(false);
    setPurpose(selectedTrip?.purpose || (choice.startsWith('tag:') ? choice.slice(4).replace(/^\w+: /, '') : ''));
    const organisations = [...new Set(candidates.flatMap(e => responsibilityShares(e, settings, fallbackOrg).map(p => p.organisation)))];
    setOrg(organisations.length === 1 ? organisations[0] ?? '' : organisations.length === 0 ? fallbackOrg : '');
    setFrom(selectedTrip?.start ?? ''); setTo(selectedTrip?.end ?? '');
  // Do not replace user edits when entries refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice, activity, store.loading, selectedTrip?.id]);
  useEffect(() => {
    if (!claimMode) return;
    if(restoredProfile.current){restoredProfile.current=false;return;}
    setClaimant(profile ? profileClaimant(profile, store.accounts) : { name: store.name, employeeId: '', department: '', designation: '', approver: '', email: '', bankDetails: '', declaration: DEFAULT_DECLARATION });
    setRouteId(profile?.defaultRouteId ?? ''); setReceivingAccountId(profile?.accountId ?? ''); setClaimFormat(profile?.format ?? settings.lastFormat); setConfirmed(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, claimMode, store.name]);
  const preparationData:ClaimPreparationData={choice,picked,excluded,organisation:org,profileId,routeId,accountId:receivingAccountId,claimant,purpose,from,to,format:claimFormat,rejected};
  const restorePreparation=(d:ClaimPreparationData)=>{restoredProfile.current=true;initializedActivity.current=d.choice==='entries'?`entries:${[...d.picked].sort().join(',')}`:d.choice;setChoice(d.choice);setPicked(d.picked);setExcluded(d.excluded);setOrg(d.organisation);setProfileId(d.profileId);setRouteId(d.routeId);setReceivingAccountId(d.accountId);setClaimant(d.claimant);setPurpose(d.purpose);setFrom(d.from);setTo(d.to);setClaimFormat(d.format);setRejected(d.rejected??[]);setConfirmed(false);};
  const preparation=useClaimPreparation(store.userId,claimMode&&!store.loading,preparationData,restorePreparation,!!(search.trip||search.tag||search.entry||search.entries));
  useEffect(()=>{if(!claimMode)return;let active=true;setHistoryCheck('loading');void (async()=>{const ids:string[]=[];const applied:Record<string,number>={};for(let start=0;;start+=250){const {data,error}=await supabase.from('report_history').select('filters').eq('kind','claim-submission').order('created_at',{ascending:false}).range(start,start+249);if(error){if(active)setHistoryCheck('error');return;}for(const h of data??[]){const filters=h.filters as {organisation?:string;subject?:{kind?:string;id?:string};snapshot?:{items?:{id:string}[];totals?:{advanceApplied?:number}}};if(filters.subject?.kind==='trip'&&filters.subject.id)applied[filters.subject.id]=(applied[filters.subject.id]??0)+(filters.snapshot?.totals?.advanceApplied??0);if(filters.organisation===org)ids.push(...(filters.snapshot?.items??[]).map(i=>i.id));}if(!data||data.length<250)break;}if(active){setPriorAdvance(applied);setPriorClaimIds([...new Set(ids)]);setHistoryCheck('ready');}})();return()=>{active=false;};},[claimMode,org]);
  const pickFormat = async (f: 'detailed' | 'summary') => { setClaimFormat(f); try { await store.savePreferences({ ...store.preferences, reimbursementSettings: { ...settings, lastFormat: f } }); } catch { toast.error('Format changed for this claim but could not be saved.'); } };
  const draftStatement = buildStatement({ subject, subjectName, purpose, organisation: org, entries: candidates, trips, accounts: store.accounts, instruments, memberName: store.memberName, today: today(), reference: 'PREVIEW' });
  const scopedStatement = organisationStatement(draftStatement, candidates, settings, org, fallbackOrg);
  const previewClaim = buildClaim(scopedStatement, claimant);
  const eligibleIds = previewClaim.items.filter(i => i.source !== NOT_RECORDED && (!priorClaimIds.includes(i.id)||allowRepeat) && !['submitted','under review'].includes(i.status) && (!profile?.categories.length || profile.categories.includes(i.category)) && (profile?.documentRule !== 'required' || i.billRef !== 'Bill Not Attached')).map(i => i.id);
  const visible = candidates.filter(e => (!categoryFilter || e.category === categoryFilter) && (!methodFilter || e.paymentMethod === methodFilter)&&(!reviewSearch||`${e.title} ${e.merchant??''} ${e.description}`.toLowerCase().includes(reviewSearch.toLowerCase()))).sort((a,b)=>reviewSort==='amount'?b.amount-a.amount:reviewSort==='merchant'?(a.merchant||a.title).localeCompare(b.merchant||b.title):a.date.localeCompare(b.date));
  const selectedClaimTotal = previewClaim.items.filter(i => !excluded.includes(i.id) && eligibleIds.includes(i.id)).reduce((s, i) => s + i.claimed, 0);
  const multiOrg = new Set(candidates.flatMap(e => responsibilityShares(e, settings, fallbackOrg).map(p => p.organisation))).size > 1;
  const unknownOrg = candidates.filter(e => !responsibilityShares(e, settings, fallbackOrg).length).length;
  const advanceEntries = store.transactions.filter(e => selectedTrip && (e.tripId === selectedTrip.id || e.tags?.includes(`Trip: ${selectedTrip.name}`)) && (e.txnType === 'advance' || e.txnType === 'advance_settlement'));
  const advanceNet = Math.max(0, advanceEntries.reduce((s, e) => s + (e.txnType === 'advance' ? e.amount : -e.amount), 0) - (selectedTrip ? priorAdvance[selectedTrip.id] ?? 0 : 0));
  const advanceChosen = advanceNet <= 0 || advanceInput.trim() !== '';
  const changeOrganisation = (v: string) => { setOrg(v); setProfileId(''); setConfirmed(false); };
  useEffect(() => { setConfirmed(false); }, [org, profile?.id, claimant, receivingAccountId, claimFormat, from, to, purpose, selectedClaimTotal, excluded, JSON.stringify(scopedStatement.rows.map(r => [r.id, r.eligible, r.reimbursed, r.outstanding]))]);

  async function generate() {
    cancelled.current = false; setFailed(false); setResult(null); setStage(0);
    try {
      if (!included.length) throw new Error("Choose at least one transaction.");
      if (claimMode && (!org || !confirmed)) throw Error('Review and confirm the paying organisation and eligible expenses.');
      if(claimMode&&historyCheck!=='ready')throw Error('Previous claims could not be checked. Reconnect and reload before generating.');
      if (claimMode && !profile && settings.profiles.filter(p => p.organisation === org).length > 1) throw Error('Select the applicable claimant role.');
      if (claimMode && !advanceChosen) throw Error('Enter how much of the trip advance to apply to this claim (0 if none).');
      const id = crypto.randomUUID(), reference = statementReference(today(), id);
      const reportEntries = claimMode ? included.filter(e => eligibleIds.includes(e.id)) : included;
      const rawStatement = buildStatement({ subject, subjectName, purpose, organisation: org, entries: reportEntries, trips, accounts: store.accounts, instruments, memberName: store.memberName, today: today(), reference });
      const st = claimMode ? organisationStatement(rawStatement, reportEntries, settings, org, fallbackOrg) : rawStatement;
      const baseClaim = claimMode ? buildClaim(st, { ...claimant, bankDetails: receivingAccountId ? reimbursementAccountLabel(store.accounts.find(a => a.id === receivingAccountId)) : '', approver: claimant.approver, declaration: claimant.declaration || DEFAULT_DECLARATION }) : null;
      const claim = baseClaim && advanceNet > 0 ? applyAdvance(baseClaim, Number(advanceInput), advanceNet) : baseClaim;
      if (claim) claim.excluded = [...previewClaim.excluded, ...previewClaim.items.filter(i => !reportEntries.some(e => e.id === i.id)).map(row => ({ row, reason: eligibleIds.includes(row.id) ? 'Not selected for this claim' : 'Profile document/category rule or missing payment details' }))];
      if (claim && !claimant.name.trim()) throw new Error("Enter the claimant's name.");
      if (claim && !claim.items.length) throw new Error("Nothing to claim: none of the chosen expenses are personally paid, marked for reimbursement and still outstanding.");
      setStage(1);
      const files: Record<string, AnnexFile | null> = {};
      const checks: ReportDocumentCheck[] = [];
      for (const a of claim ? claim.annexures : st.annexures) {
        if (cancelled.current) return;
        try {
          const url = await store.signedUrl(a.path); if (!url) throw new Error();
          const b = await fetchPrivateFile(url, { mimeType: a.type });
          const type = b.type || a.type;
          files[a.no] = type === "application/pdf" || /\.pdf$/i.test(a.name) ? { bytes: new Uint8Array(await b.arrayBuffer()), type: "application/pdf" }
            : type === "image/png" || type === "image/jpeg" ? { bytes: new Uint8Array(await b.arrayBuffer()), type } : { bytes: await toJpeg(b), type: "image/jpeg" };
        } catch { files[a.no] = null; }
        const error = await reportDocumentError(files[a.no] ?? null);
        checks.push({ id: a.no, title: `${a.no} · ${a.name} · ${a.date}`, error });
        if (error) files[a.no] = null;
      }
      for (const row of claim ? claim.items : st.rows) {
        const rowNo = "claimNo" in row ? row.claimNo : row.sno;
        if (!(claim ? claim.annexures : st.annexures).some(a => a.row === rowNo)) checks.push({ id: row.id, title: `${row.date} · ${row.particulars}`, error: "No supporting bill attached" });
      }
      setStage(-1);
      const proceed = await new Promise<boolean>(resolve => { documentDecision.current = resolve; setDocumentChecks(checks); });
      documentDecision.current = null;
      if (!proceed || cancelled.current) return;
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
      let historySaved = false;
      const previous = claim ? await supabase.from('report_history').select('id,version,filters').eq('kind', 'claim-submission').contains('filters', { activity, organisation: org }).order('version', { ascending: false }).limit(1) : null;
      if(previous?.error)throw Error('Could not check report versions. Your PDF is ready locally but was not saved.');
      const same = (previous?.data ?? []).filter(h => { const f = h.filters as { activity?: string; organisation?: string }; return f?.activity === activity && f?.organisation === org; });
      const version = 1 + Math.max(0, ...same.map(h => h.version));
      const up = await supabase.storage.from("receipts").upload(path, blob, { contentType: "application/pdf" });
      if (!up.error) {
        const { error } = await supabase.from("report_history").insert({ id, owner_id: store.userId, kind: claim ? "claim-submission" : "expenditure-statement", title: `${claim ? `Expense Claim Submission · ${org} · v${version}` : "Detailed Expenditure Statement"} — ${subjectName}`, period_from: st.start, period_to: st.end, workspace: "all", filters: { subject, excluded, reference, activity, organisation: org, profileId: profile?.id, format: claimFormat, snapshot: claim ?? st } as never, file_path: path, file_size: blob.size, version });
        historySaved = !error;
        if (error) await supabase.storage.from("receipts").remove([path]);
        if (error) toast.error("The PDF is ready, but it couldn't be saved to report history.");
      } else toast.error("The PDF is ready, but it couldn't be saved to report history.");
      setStage(-1); toast.success(claim ? "Claim PDF ready" : "Statement ready", { description: historySaved ? 'Saved in Reports Centre history.' : 'Ready on this device; not saved to history.', action: { label: "Open", onClick: () => void navigate({ to: "/report-centre" }) } });
    } catch (e) { setFailed(true); toast.error(e instanceof Error ? e.message : "Couldn't prepare the statement"); }
  }
  const busy = (stage >= 0 && !failed) || documentChecks !== null;
  const openPreview = (b: Blob) => { const u = URL.createObjectURL(b); window.open(u, "_blank"); setTimeout(() => URL.revokeObjectURL(u), 60_000); };

  return (
    <div className="space-y-5 pb-[calc(7rem+env(safe-area-inset-bottom))] [&_button:not([role=checkbox])]:min-h-11">
      <PageTitle title={claimMode ? "Expense Claim Submission" : "Detailed Expenditure Statement"} sub={claimMode ? "A formal reimbursement request for your organisation's accounts team: claimed items, declaration, approval lines and the original bills." : "A complete record of what was spent, how it was paid and what is still to be reimbursed, with every original bill attached."} />
      {claimMode&&<div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span role="status">{preparation.status}</span><div className="flex gap-2">{preparation.recover&&<Button size="sm" variant="outline" onClick={preparation.resume}>Resume saved preparation</Button>}<Button size="sm" variant="ghost" onClick={preparation.saveNow}>Save preparation</Button></div></div>}
      <div className={cn(claimMode&&'grid min-w-0 gap-6 min-[1000px]:grid-cols-[minmax(280px,.8fr)_minmax(0,1.4fr)] min-[1600px]:grid-cols-[minmax(280px,.75fr)_minmax(420px,1.2fr)_minmax(360px,1fr)]')}>
      <div className="min-w-0 space-y-4">
      <section className={cn('space-y-3', !claimMode && 'rounded-xl border bg-card p-4')}>
        {claimMode?<ClaimSearchSelect label="Claim for" value={choice} onChange={v=>{setChoice(v);setExcluded([]);}} options={[...trips.map(t=>({value:`trip:${t.id}`,label:t.name})),...groupTags.map(t=>({value:`tag:${t}`,label:t})),{value:'entries',label:'Individual business purchases'}]} />:<label className="block text-sm font-semibold">What is this statement for?
          <select className={cn(sel, "mt-1")} value={choice} onChange={(e) => { setChoice(e.target.value); setExcluded([]); }}>
            {trips.length > 0 && <optgroup label="Trips">{trips.map((t) => <option key={t.id} value={`trip:${t.id}`}>{t.name}</option>)}</optgroup>}
            {groupTags.length > 0 && <optgroup label="Events, projects & groups">{groupTags.map((t) => <option key={t} value={`tag:${t}`}>{t}</option>)}</optgroup>}
            <option value="entries">Individual business purchases…</option>
          </select>
        </label>}
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
        <div className={cn('grid gap-2 text-xs', !claimMode && 'grid-cols-2')}>
          <label>Purpose<input className={cn(sel, "mt-1")} value={purpose} placeholder="e.g. Client visit" onChange={(e) => setPurpose(e.target.value)} /></label>
          {!claimMode && <label>Organisation<input className={cn(sel, "mt-1")} value={org} placeholder="From entries if blank" onChange={(e) => setOrg(e.target.value)} /></label>}
        </div>
      </section>
      {claimMode && <ClaimProfilePanel organisation={org} setOrganisation={changeOrganisation} profile={profile} profileId={profileId} setProfileId={setProfileId} claimant={claimant} setClaimant={setClaimant} routeId={routeId} setRouteId={v => { setRouteId(v); const route = profile?.routes.find(r => r.id === v); setClaimant(c => ({ ...c, approver: route?.approver ?? '', reportingAuthority: route?.reportingAuthority ?? '', finance: route?.finance ?? '', additionalApprover: route?.additionalApprover ?? '' })); }} accountId={receivingAccountId} setAccountId={setReceivingAccountId} format={claimFormat} setFormat={f => void pickFormat(f)} activity={activity} />}
      </div><div className="min-w-0 space-y-4">
      {claimMode&&<section className="space-y-3 border-y py-4"><h2 className="font-semibold">{subjectName} · {org||'Organisation unconfirmed'}</h2><dl className="grid grid-cols-2 gap-3">{[['Activity expenditure',draftStatement.summary.total],['Eligible organisation share',previewClaim.totals.eligible],['Already reimbursed',previewClaim.totals.received],['Outstanding selection',selectedClaimTotal],['Personal payments',draftStatement.summary.personal],['Organisation payments',draftStatement.summary.organisation],['Advances received',advanceNet],['Non-reimbursable / excluded',previewClaim.excluded.reduce((s,x)=>s+x.row.inr,0)]].map(([label,amount])=><div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="whitespace-nowrap text-sm font-semibold tabular-nums">{money(Number(amount))}</dd></div>)}</dl></section>}
      {claimMode&&<ClaimExpenseDiscovery subject={subject} organisation={org} from={from} to={to} rejected={rejected} setRejected={setRejected} onPick={ids=>setPicked(p=>[...new Set([...p,...ids])])} />}
      {claimMode&&multiOrg&&<div className="flex flex-wrap gap-2">{[...new Set(candidates.flatMap(e=>responsibilityShares(e,settings,fallbackOrg).map(p=>p.organisation)))].map(o=><Button key={o} size="sm" variant={org===o?'default':'outline'} onClick={()=>changeOrganisation(o)}>Prepare {o} claim</Button>)}</div>}

      <section className="space-y-2">
        <h2 className="font-semibold">Review transactions <span className="text-sm font-normal text-muted-foreground">({claimMode?eligibleIds.filter(id=>!excluded.includes(id)).length:included.length} of {candidates.length} included)</span></h2>
        {claimMode&&<><div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2"><input aria-label="Search linked transactions" type="search" placeholder="Search transactions" value={reviewSearch} onChange={e=>setReviewSearch(e.target.value)} className={sel}/><select aria-label="Sort transactions" className={sel} value={reviewSort} onChange={e=>setReviewSort(e.target.value)}><option value="date">Date</option><option value="amount">Amount</option><option value="merchant">Merchant</option></select></div>{priorClaimIds.some(id=>candidates.some(e=>e.id===id))&&<label className="flex items-start gap-2 text-xs text-destructive"><Checkbox checked={allowRepeat} onCheckedChange={v=>{setAllowRepeat(v===true);setConfirmed(false);}}/>Previously included in a saved claim. Prepare only an explicitly identified replacement version, not another submission.</label>}</>}
        {claimMode && <><div className="grid grid-cols-2 gap-2"><select aria-label="Filter by category" className={sel} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="">All categories</option>{[...new Set(candidates.map(e => e.category))].map(c => <option key={c}>{c}</option>)}</select><select aria-label="Filter by payment method" className={sel} value={methodFilter} onChange={e => setMethodFilter(e.target.value)}><option value="">All payment methods</option>{[...new Set(candidates.map(e => e.paymentMethod))].map(m => <option key={m}>{m}</option>)}</select></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setExcluded(candidates.filter(e => !eligibleIds.includes(e.id)).map(e => e.id))}>Select all eligible</Button><Button size="sm" variant="outline" onClick={() => setExcluded(candidates.filter(e => !visible.some(v => v.id === e.id) || !eligibleIds.includes(e.id)).map(e => e.id))}>Select matching eligible</Button><Button size="sm" variant="ghost" onClick={() => setExcluded(candidates.map(e => e.id))}>Clear selection</Button></div>{multiOrg && <p role="alert" className="text-sm text-destructive">Multiple organisations: prepare a separate claim for each paying organisation.</p>}{unknownOrg > 0 && <p className="text-sm text-destructive">{unknownOrg} expenses need organisation responsibility confirmed.</p>}{advanceNet > 0 && <div className="space-y-1"><label className="text-sm font-medium" htmlFor="advance-applied">Advance to apply to this claim</label><input id="advance-applied" inputMode="decimal" className={sel} placeholder="0" value={advanceInput} onChange={e => setAdvanceInput(e.target.value)} /><p className="text-xs text-muted-foreground">{money(advanceNet)} of the trip advance is not yet applied to a claim. Enter the part this claim uses (0 if none); it is deducted from the amount payable.</p></div>}</>}
        {!candidates.length && <p className="text-sm text-muted-foreground">No linked expenses yet. {claimMode?'Find and review existing expenses above.':'Tag entries with the trip, event or project to include them.'}</p>}
        <div className={cn(claimMode&&'max-h-[60vh] overflow-y-auto space-y-2')}>
        {visible.map((e) => {
          const p = paymentInfo(e, store.accounts, instruments, store.memberName);
          const allowed = !claimMode || eligibleIds.includes(e.id); const on = allowed && !excluded.includes(e.id);
          const claimRow = previewClaim.items.find(i => i.id === e.id); const reason = previewClaim.excluded.find(x => x.row.id === e.id)?.reason;
          return (
            <div key={e.id} className={cn("flex gap-3 rounded-lg border bg-card p-3 text-sm", !on && "opacity-70")}>
              <Checkbox checked={on} disabled={!allowed} onCheckedChange={(v) => setExcluded((x) => (v ? x.filter((i) => i !== e.id) : [...x, e.id]))} aria-label={`Include ${e.title}`} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2"><span className="truncate font-medium">{e.merchant || e.title}</span><span className="tabular-nums">{(e.txnType ?? "expense") === "refund" ? "−" : ""}{money(e.originalAmount, e.currency)}</span></div>
                <div className="text-xs text-muted-foreground">{e.date} · {e.category} · {p.method} · <span className={cn(p.source === NOT_RECORDED && "text-destructive")}>{p.source}</span> · {p.payer}</div>
                <div className="text-xs text-muted-foreground">{e.receipts.length ? <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" />{e.receipts.length} bill{e.receipts.length > 1 ? "s" : ""}</span> : <span className="text-destructive">Bill not attached</span>}{e.reimbursementStatus && e.reimbursementStatus !== "none" ? ` · reimbursement ${e.reimbursementStatus}` : ""}{accountName(e.accountId) ? "" : ""}</div>
                {claimMode && <><p className="text-xs">{claimRow ? `Eligible ${money(claimRow.eligible)} · Received ${money(claimRow.reimbursed)} · Outstanding ${money(claimRow.claimed)}` : reason || 'Requires review'}{!allowed && claimRow ? priorClaimIds.includes(e.id)?' · Previously included in a saved claim': ['submitted','under review'].includes(claimRow.status)?' · Already submitted / under review':' · Excluded: payment details, category rule or required bill needs review' : ''}</p><ClaimOrganisationAllocation entry={e} fallback={fallbackOrg} /></>}
                <Button size="sm" variant="ghost" onClick={()=>setDetail(e)}><Eye className="h-3 w-3"/>Details / bills</Button>
              </div>
            </div>
          );
        })}
        </div><p className="text-xs text-muted-foreground">Unticking only leaves an entry out of this statement; your records are not changed. Fix payment details or reimbursement status on the entry itself.</p>
      </section>
      {claimMode && <section className="space-y-3 border-y py-4"><h2 className="font-semibold">Review & generate</h2><p className="text-lg font-semibold tabular-nums">Outstanding claim · {money(selectedClaimTotal)}</p><p className="text-sm">{org || 'Paying organisation required'} · {maskedText(claimant.name)} · {purpose || 'Purpose not supplied'}</p><p className="text-xs text-muted-foreground">{previewClaim.items.filter(i => i.billRef === 'Bill Not Attached').length} expenses need bills · {previewClaim.excluded.length} excluded · {claimant.approver ? `Proposed approver: ${claimant.approver} (not approved)` : 'Approving authority not supplied'}</p><label className="flex items-start gap-2 text-sm"><Checkbox checked={confirmed} onCheckedChange={v => setConfirmed(v === true)} />I reviewed this organisation, profile and outstanding expenses. A repeated report is a new version, not another reimbursement.</label></section>}

      {claimMode&&historyCheck==='error'&&<p role="alert" className="text-sm text-destructive">Could not check previous claims. Reconnect and reload before generating.</p>}
      <Button className="w-full" onClick={generate} disabled={busy || !included.length || (claimMode && (!confirmed || !org || selectedClaimTotal <= 0 || !advanceChosen||historyCheck!=='ready'))}><FileText className="mr-1 h-4 w-4" />{claimMode ? "Generate claim PDF" : "Generate statement PDF"}</Button>
      <p className="text-xs text-muted-foreground">Prepared on this device — keep this page open until it's ready.</p>
      {stage >= 0 && <ProcessingPanel title={failed ? "Statement not finished" : "Preparing your statement… you can keep using the app; we'll tell you when it's ready"} stages={stagesAt(STAGES, stage, failed)} {...(busy ? { onCancel: () => { cancelled.current = true; setStage(-1); } } : {})} />}
      </div><div className={cn('min-w-0',claimMode&&'min-[1000px]:col-span-2 min-[1600px]:col-span-1')}>
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
      {!result&&claimMode&&<div className="hidden space-y-3 border-t py-5 min-[1600px]:block"><h2 className="font-semibold">Report preview</h2><p className="text-sm">{claimant.name||'Claimant required'} · {org||'Organisation required'}</p><p className="text-sm">{subjectName} · {from} — {to}</p><p className="font-semibold tabular-nums">{money(selectedClaimTotal)}</p><p className="text-xs text-muted-foreground">{claimFormat==='summary'?'Summary + Bills':'Detailed + Bills'}</p></div>}
      </div></div><ClaimExpenseDetails entry={detail} onClose={()=>setDetail(null)} />
      {documentChecks && <ReportDocumentVerification rows={documentChecks} required={claimMode && profile?.documentRule === "required"} onDecision={proceed => { setDocumentChecks(null); documentDecision.current?.(proceed); }} />}
    </div>
  );
}
